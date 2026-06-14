export const runtime = "nodejs";
export const maxDuration = 120;

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { loadRaporViewData } from "@/lib/raporViewData";
import { renderUrlToPdf } from "@/lib/chromiumPdf";
import { signPdfBuffer, pdfImzaYapilandirildi } from "@/lib/raporPdfSign";
import { getAllSettings } from "@/lib/settings";
import nodemailer from "nodemailer";
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
    const sirketWeb   = cfg.SIRKET_WEB   || process.env.SIRKET_WEB   || "";
    const sirketEmail = cfg.SIRKET_EMAIL || process.env.SIRKET_EMAIL || "";
    const sirketAdres = cfg.SIRKET_ADRES || process.env.SIRKET_ADRES || "";
    const mailHost    = cfg.MAIL_HOST    || process.env.MAIL_HOST    || "";
    const mailPort    = parseInt(cfg.MAIL_PORT || process.env.MAIL_PORT || "587");
    const mailSecure  = (cfg.MAIL_SECURE ?? process.env.MAIL_SECURE ?? "false") === "true";
    const mailUser    = cfg.MAIL_USER    || process.env.MAIL_USER    || "";
    const mailPass    = cfg.MAIL_PASS    || process.env.MAIL_PASS    || "";
    const mailFrom    = cfg.MAIL_FROM    || process.env.MAIL_FROM    || mailUser;
    if (!mailHost || !mailUser || !mailPass) {
      return Response.json({ error: "SMTP ayarları yapılmamış." }, { status: 500 });
    }

    // Çoklu rapor için cookie/origin gerekli (Chromium oturum aktarımı)
    const cookieHeader = request.headers.get("cookie") || undefined;
    const origin = new URL(request.url).origin;
    const pool = await cosmoPool;

    // Her bir (nkrId, format) için imzalı PDF üret
    const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];
    const raporOzetler: Array<{ raporNo: string; numune: string; firma: string }> = [];

    const sanitize = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);

    for (const it of items) {
      const nkrId = Number(it.nkrId);
      const fmt = String(it.raporFormati || "").trim();
      const data = await loadRaporViewData(nkrId, fmt);
      if (!data) continue;
      if (!data.onay || (data.onay.durum !== "Onaylandı" && data.onay.durum !== "Yayınlandı")) continue;

      const previewUrl = `${origin}/rapor-onay-print/${nkrId}?format=${encodeURIComponent(fmt)}`;
      const pdf = await renderUrlToPdf(previewUrl, {
        cookieHeader,
        printBackground: true,
        marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
        settleMs: 1500,
      });
      const signed = await signPdfBuffer(pdf);

      const raporNo = data.onay.disRaporKodu || data.header.RaporNo || `rapor-${nkrId}`;
      const numune = data.header.Numune_Adi || "";
      const fileBase = sanitize(`${raporNo} - ${numune}`) || `Rapor-${nkrId}`;
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

    // Mail gövdesi
    const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
    const mesajHtml = mesaj
      ? `<p style="margin:0 0 16px 0;color:#1d1d1f;line-height:1.6;white-space:pre-wrap;">${esc(mesaj)}</p>`
      : "";
    const raporListHtml = raporOzetler.map(r => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eaeaea;color:#1d1d1f;font-weight:600;">${esc(r.raporNo)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eaeaea;color:#1d1d1f;">${esc(r.numune)}</td>
      </tr>`).join("");

    const html = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><title>${esc(sirketAdi)} — Analiz Raporu</title></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;">
  <div style="max-width:640px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
    <div style="padding:24px 28px;border-bottom:1px solid #eaeaea;">
      <img src="cid:unique-logo" alt="${esc(sirketAdi)}" style="height:32px;display:block;"/>
    </div>
    <div style="padding:28px;">
      <h2 style="margin:0 0 16px 0;font-size:18px;color:#1d1d1f;font-weight:700;">Analiz Raporunuz</h2>
      ${mesajHtml}
      <p style="margin:0 0 12px 0;color:#86868b;font-size:14px;">Ekteki PDF'lerde aşağıdaki rapor(lar) yer almaktadır:</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #eaeaea;border-radius:8px;overflow:hidden;font-size:13px;">
        <thead>
          <tr style="background:#f5f5f7;">
            <th style="padding:8px 10px;text-align:left;color:#6e6e73;font-weight:600;border-bottom:1px solid #eaeaea;">Rapor No</th>
            <th style="padding:8px 10px;text-align:left;color:#6e6e73;font-weight:600;border-bottom:1px solid #eaeaea;">Numune</th>
          </tr>
        </thead>
        <tbody>${raporListHtml}</tbody>
      </table>
      <p style="margin:18px 0 0 0;font-size:12px;color:#86868b;">Bu raporlar dijital olarak imzalanmıştır. Doğrulama için PDF üzerindeki QR kodu veya <a href="https://dogrulama.uniqueanalyse.com" style="color:#0071e3;text-decoration:none;">dogrulama.uniqueanalyse.com</a> kullanılabilir.</p>
    </div>
    <div style="padding:18px 28px;background:#fafafa;border-top:1px solid #eaeaea;font-size:12px;color:#86868b;">
      <strong style="color:#1d1d1f;">${esc(sirketAdi)}</strong><br/>
      ${sirketAdres ? esc(sirketAdres) + "<br/>" : ""}
      ${sirketEmail ? `<a href="mailto:${esc(sirketEmail)}" style="color:#0071e3;text-decoration:none;">${esc(sirketEmail)}</a>` : ""}
      ${sirketWeb ? ` · <a href="${esc(sirketWeb)}" style="color:#0071e3;text-decoration:none;">${esc(sirketWeb)}</a>` : ""}
    </div>
  </div>
</body></html>`;

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

    await transporter.sendMail({
      from: mailFrom,
      to: to.join(", "),
      cc: cc.length ? cc.join(", ") : undefined,
      subject: konu || `Analiz Raporu — ${sirketAdi}`,
      html,
      attachments: allAttachments,
    });

    return Response.json({ ok: true, gonderilen: attachments.length });
  } catch (e: any) {
    console.error("[rapor-takip mail-gonder]", e);
    return Response.json({ error: e.message || "Mail gönderilemedi" }, { status: 500 });
  }
}
