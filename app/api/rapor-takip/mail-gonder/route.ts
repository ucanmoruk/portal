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

  if (!pdfImzaYapilandirildi()) {
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
      return Response.json({ error: "SMTP ayarları yapılmamış." }, { status: 500 });
    }

    // Çoklu rapor için cookie/origin gerekli (Chromium oturum aktarımı)
    const cookieHeader = request.headers.get("cookie") || undefined;
    const origin = getRaporPdfBaseUrl(request);
    const pool = await cosmoPool;

    // Her bir (nkrId, format) için imzalı PDF üret
    const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];
    const raporOzetler: Array<{ raporNo: string; numune: string; firma: string }> = [];

    const sanitize = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);

    for (const it of items) {
      const nkrId = Number(it.nkrId);
      const fmt = String(it.raporFormati || "").trim();
      const data = await loadRaporViewData(nkrId, baseReportFormat(fmt), fmt);
      if (!data) continue;
      // Onaylı / Yayınlanmış / Arşivlenmiş (önceden onaylı) raporlar maillenebilir.
      if (!data.onay || (data.onay.durum !== "Onaylandı" && data.onay.durum !== "Ödeme bekliyor" && data.onay.durum !== "Yayınlandı" && data.onay.durum !== "Arşiv")) continue;

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
      });
    }

    if (attachments.length === 0) {
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

    return Response.json({
      ok: true,
      gonderilen: attachments.length,
      messageId: info.messageId,
      accepted: info.accepted || [],
      rejected: info.rejected || [],
    });
  } catch (e: any) {
    console.error("[rapor-takip mail-gonder]", e);
    return Response.json({ error: e.message || "Mail gönderilemedi" }, { status: 500 });
  }
}
