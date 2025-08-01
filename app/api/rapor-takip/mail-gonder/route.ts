export const runtime = "nodejs";
export const maxDuration = 120;

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { loadRaporViewData } from "@/lib/raporViewData";
import { renderUrlToPdf } from "@/lib/chromiumPdf";
import { signPdfBuffer, pdfImzaYapilandirildi } from "@/lib/raporPdfSign";
import { getRaporPdfBaseUrl } from "@/lib/raporPdfBaseUrl";
import { getAllSettings } from "@/lib/settings";
import { baseReportFormat, isEnglishReportFormat } from "@/lib/raporFormatLanguage";
import nodemailer from "nodemailer";
import { laboratoryMailBrand, renderLaboratoryMail } from "@/lib/laboratuvarMailTemplate";
import { existsSync } from "node:fs";
import path from "node:path";
import { createRaporMailLogEntries, updateRaporMailLog } from "@/lib/raporMailLog";

// POST /api/rapor-takip/mail-gonder
// Body:
//   items: [{ nkrId, raporFormati }]
//   to:    string[]              (en az 1)
//   cc:    string[]              (opsiyonel)
//   konu:  string                (opsiyonel — default: "Analiz Raporu — UNIQUE Analiz")
//   mesaj: string                (opsiyonel — düz metin, HTML'e dönüşür)
// Seçili raporların imzalı PDF'lerini üretip mail ekinde gönderir.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  let body: {
    items?: Array<{ nkrId: number; raporFormati: string }>;
    to?: string[]; cc?: string[]; konu?: string; mesaj?: string;
  } = {};
  try { body = await request.json(); } catch { return Response.json({ error: "Geçersiz JSON" }, { status: 400 }); }

  const items = Array.isArray(body.items) ? body.items.filter(i => Number.isFinite(Number(i?.nkrId)) && i?.raporFormati) : [];
  const to = Array.isArray(body.to) ? body.to.filter(s => s && s.trim()) : [];
  const cc = Array.isArray(body.cc) ? body.cc.filter(s => s && s.trim()) : [];
  const konu = (body.konu || "").trim();
  const mesaj = (body.mesaj || "").trim();

  if (items.length === 0) return Response.json({ error: "En az bir rapor seçilmeli." }, { status: 400 });
  if (to.length === 0) return Response.json({ error: "En az bir alıcı (To) girilmeli." }, { status: 400 });
  if (items.length > 20) return Response.json({ error: "Tek seferde en fazla 20 rapor gönderilebilir." }, { status: 400 });

  let pool: Awaited<typeof cosmoPool>;
  let logEntries: Awaited<ReturnType<typeof createRaporMailLogEntries>> = [];
  try {
    pool = await cosmoPool;
    const recipients = [...new Set([...to, ...cc].map((s) => s.trim()).filter(Boolean))].join(", ");
    const sessionUser = session.user as (typeof session.user & { name?: string | null }) | undefined;
    const gonderen = String(sessionUser?.name || sessionUser?.email || "");
    logEntries = await createRaporMailLogEntries(pool, items.map((item) => ({
      nkrId: Number(item.nkrId),
      raporFormati: String(item.raporFormati),
      mailAdresi: recipients,
      gonderen,
    })));
  } catch (e: unknown) {
    console.error("[rapor-takip mail log kaydi]", e);
    return Response.json({ error: `Gönderim logu oluşturulamadı: ${e instanceof Error ? e.message : "Veritabanı hatası"}` }, { status: 500 });
  }

  if (!pdfImzaYapilandirildi()) {
    await updateRaporMailLog(pool, logEntries.map((entry) => entry.logId), "Başarısız", "PDF imza sertifikası yapılandırılmadı.")
      .catch((error) => console.error("[rapor-takip mail log guncelleme]", error));
    return Response.json({ error: "PDF imza sertifikası yapılandırılmadı." }, { status: 503 });
  }

  try {
    // SMTP ayarları
    const cfg = await getAllSettings();
    const sirketAdi   = cfg.SIRKET_ADI   || process.env.SIRKET_ADI   || "UNIQUE Analiz";
    // Host/user'da gizli boşluk veya yanlışlıkla yapıştırılan protokol öneki
    // (https://, smtp://) getaddrinfo'yu bozar → temizle.
    const mailHost    = (cfg.MAIL_HOST || process.env.MAIL_HOST || "")
      .trim().replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, "");
    const mailPort    = parseInt(cfg.MAIL_PORT || process.env.MAIL_PORT || "587");
    const mailSecure  = (cfg.MAIL_SECURE ?? process.env.MAIL_SECURE ?? "false") === "true";
    const mailUser    = (cfg.MAIL_USER || process.env.MAIL_USER || "").trim();
    const mailPass    = cfg.MAIL_PASS    || process.env.MAIL_PASS    || "";
    const mailFrom    = (cfg.MAIL_FROM   || process.env.MAIL_FROM    || mailUser).trim();
    if (!mailHost || !mailUser || !mailPass) {
      await updateRaporMailLog(pool, logEntries.map((entry) => entry.logId), "Başarısız", "SMTP ayarları yapılmamış.");
      return Response.json({ error: "SMTP ayarları yapılmamış." }, { status: 500 });
    }

    // Çoklu rapor için cookie/origin gerekli (Chromium oturum aktarımı)
    const cookieHeader = request.headers.get("cookie") || undefined;
    const origin = getRaporPdfBaseUrl(request);
    // Her bir (nkrId, format) için imzalı PDF üret
    const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];
    const raporOzetler: Array<{ raporNo: string; numune: string; firma: string; logId: string }> = [];
    const logByItem = new Map(logEntries.map((entry) => [`${entry.nkrId}__${entry.raporFormati}`, entry]));
    const eligibleLogIds: string[] = [];

    const sanitize = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);

    for (const it of items) {
      const nkrId = Number(it.nkrId);
      const fmt = String(it.raporFormati || "").trim();
      const logEntry = logByItem.get(`${nkrId}__${fmt}`);
      const data = await loadRaporViewData(nkrId, baseReportFormat(fmt), fmt);
      if (!data) {
        if (logEntry) await updateRaporMailLog(pool, [logEntry.logId], "Başarısız", "Rapor kaydı bulunamadı.");
        continue;
      }
      // Onaylı / Yayınlanmış / Arşivlenmiş (önceden onaylı) raporlar maillenebilir.
      if (!data.onay || (data.onay.durum !== "Onaylandı" && data.onay.durum !== "Ödeme bekliyor" && data.onay.durum !== "Yayınlandı" && data.onay.durum !== "Arşiv")) {
        if (logEntry) await updateRaporMailLog(pool, [logEntry.logId], "Başarısız", "Rapor gönderim için onaylı/yayınlanmış durumda değil.");
        continue;
      }

      const previewUrl = `${origin}/rapor-onay-print/${nkrId}?format=${encodeURIComponent(fmt)}`;
      const pdf = await renderUrlToPdf(previewUrl, {
        cookieHeader,
        printBackground: true,
        marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
        settleMs: 1500,
      });
      const signed = await signPdfBuffer(pdf);

      const raporNo = data.onay.disRaporKodu || data.header.RaporNo || `rapor-${nkrId}`;
      const numune = isEnglishReportFormat(fmt)
        ? (data.header.Numune_Adi_En || data.header.Numune_Adi || "")
        : (data.header.Numune_Adi || "");
      const prefix = isEnglishReportFormat(fmt) ? "Eng_" : "";
      const fileBase = sanitize(`${prefix}${raporNo} - ${numune}`) || `${prefix}Rapor-${nkrId}`;
      attachments.push({
        filename: `${fileBase}.pdf`,
        content: signed,
        contentType: "application/pdf",
      });
      raporOzetler.push({
        raporNo,
        numune,
        firma: data.header.FirmaAd || "",
        logId: logEntry?.logId || "",
      });
      if (logEntry) eligibleLogIds.push(logEntry.logId);
    }

    if (attachments.length === 0) {
      await updateRaporMailLog(pool, logEntries.filter((entry) => !eligibleLogIds.includes(entry.logId)).map((entry) => entry.logId), "Başarısız", "Onaylı rapor bulunamadı veya PDF üretilemedi.");
      return Response.json({ error: "Onaylı rapor bulunamadı veya PDF üretilemedi." }, { status: 404 });
    }

    const html = renderLaboratoryMail({
      brand: laboratoryMailBrand(cfg), title: "Analiz Raporunuz", message: mesaj,
      intro: "Ekteki PDF'lerde aşağıdaki rapor(lar) yer almaktadır:",
      headings: ["Rapor No", "Numune"], rows: raporOzetler.map(r => [r.raporNo, r.numune]),
      note: 'Bu raporlar dijital olarak imzalanmıştır. Doğrulama için PDF üzerindeki QR kodu veya <a href="https://dogrulama.uniqueanalyse.com" style="color:#0071e3;text-decoration:none;">dogrulama.uniqueanalyse.com</a> kullanılabilir.',
    });

    // Logo eklentisi (cid)
    const logoPath = path.join(process.cwd(), "public", "unique-logo.png");
    const allAttachments = [
      ...(existsSync(logoPath) ? [{ filename: "unique-logo.png", path: logoPath, cid: "unique-logo" }] : []),
      ...attachments,
    ];

    const transporter = nodemailer.createTransport({
      host: mailHost,
      port: mailPort,
      secure: mailSecure,
      auth: { user: mailUser, pass: mailPass },
    });

    const info = await transporter.sendMail({
      from: mailFrom,
      to: to.join(", "),
      cc: cc.length ? cc.join(", ") : undefined,
      subject: konu || `Analiz Raporu — ${sirketAdi}`,
      html,
      attachments: allAttachments,
    });

    const accepted = Array.isArray(info.accepted) ? info.accepted : [];
    const rejected = Array.isArray(info.rejected) ? info.rejected : [];
    const sent = accepted.length > 0;
    const deliveryNote = rejected.length
      ? `Kabul edilmeyen alıcılar: ${rejected.map(String).join(", ")}`
      : null;
    await updateRaporMailLog(
      pool,
      eligibleLogIds,
      sent ? "Başarılı" : "Başarısız",
      sent ? deliveryNote : (deliveryNote || "Mail sunucusu hiçbir alıcıyı kabul etmedi."),
      info.messageId || null,
    );

    return Response.json({
      ok: true,
      gonderilen: attachments.length,
      messageId: info.messageId,
      accepted: info.accepted || [],
      rejected: info.rejected || [],
    });
  } catch (e: unknown) {
    console.error("[rapor-takip mail-gonder]", e);
    const message = e instanceof Error ? e.message : "Mail gönderilemedi";
    await updateRaporMailLog(pool, logEntries.map((entry) => entry.logId), "Başarısız", message)
      .catch((error) => console.error("[rapor-takip mail log guncelleme]", error));
    return Response.json({ error: message }, { status: 500 });
  }
}
