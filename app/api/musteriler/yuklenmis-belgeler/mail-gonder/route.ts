export const runtime = "nodejs";
export const maxDuration = 120;

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { getAllSettings } from "@/lib/settings";
import nodemailer from "nodemailer";
import { existsSync } from "node:fs";
import path from "node:path";

type MailBody = {
  ids?: number[];
  to?: string[];
  cc?: string[];
  konu?: string;
  mesaj?: string;
};

function cleanMailList(value: unknown): string[] {
  const arr = Array.isArray(value) ? value : String(value || "").split(/[;,]/);
  return arr.map((x) => String(x || "").trim()).filter(Boolean);
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function sanitizeFileName(value: unknown): string {
  return String(value || "Belge")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "Belge";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Mail gönderilemedi.";
}

async function fetchPdf(url: string): Promise<Buffer> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`PDF indirilemedi (${res.status}): ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5 || buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new Error(`PDF dosyası geçersiz görünüyor: ${url}`);
  }
  return buf;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  let body: MailBody = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Geçersiz JSON" }, { status: 400 });
  }

  const ids = Array.from(new Set(
    (Array.isArray(body.ids) ? body.ids : [])
      .map((x) => Number(x))
      .filter((x) => Number.isInteger(x) && x > 0),
  ));
  const to = cleanMailList(body.to);
  const cc = cleanMailList(body.cc);
  const konu = String(body.konu || "").trim();
  const mesaj = String(body.mesaj || "").trim();

  if (ids.length === 0) return Response.json({ error: "En az bir belge seçilmeli." }, { status: 400 });
  if (ids.length > 30) return Response.json({ error: "Tek seferde en fazla 30 PDF gönderilebilir." }, { status: 400 });
  if (to.length === 0) return Response.json({ error: "En az bir alıcı girilmeli." }, { status: 400 });

  try {
    const cfg = await getAllSettings();
    const sirketAdi = cfg.SIRKET_ADI || process.env.SIRKET_ADI || "UNIQUE Analiz";
    const sirketWeb = cfg.SIRKET_WEB || process.env.SIRKET_WEB || "";
    const sirketEmail = cfg.SIRKET_EMAIL || process.env.SIRKET_EMAIL || "";
    const sirketAdres = cfg.SIRKET_ADRES || process.env.SIRKET_ADRES || "";
    const mailHost = (cfg.MAIL_HOST || process.env.MAIL_HOST || "")
      .trim().replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, "");
    const mailPort = parseInt(cfg.MAIL_PORT || process.env.MAIL_PORT || "587", 10);
    const mailSecure = (cfg.MAIL_SECURE ?? process.env.MAIL_SECURE ?? "false") === "true";
    const mailUser = (cfg.MAIL_USER || process.env.MAIL_USER || "").trim();
    const mailPass = cfg.MAIL_PASS || process.env.MAIL_PASS || "";
    const mailFrom = (cfg.MAIL_FROM || process.env.MAIL_FROM || mailUser).trim();
    if (!mailHost || !mailUser || !mailPass) {
      return Response.json({ error: "SMTP ayarları yapılmamış." }, { status: 500 });
    }

    const pool = await cosmoPool;
    const idList = ids.join(",");
    const result = await pool.request().query(`
      SELECT
        r.ID,
        r.RaporNo,
        r.NumuneTur,
        r.NumuneAd,
        ISNULL(NULLIF(r.FirmaAd, ''), ISNULL(f.Firma_Adi, '')) AS FirmaAd,
        ISNULL(NULLIF(r.Proje, ''), ISNULL(p.Firma_Adi, '')) AS Proje,
        r.Yol
      FROM Rapor r
      LEFT JOIN Firma f ON f.ID = r.FirmaID
      LEFT JOIN Firma p ON p.ID = r.ProjeID
      WHERE r.Durum = 'Aktif'
        AND r.Yol LIKE 'http%'
        AND r.ID IN (${idList})
      ORDER BY r.ID
    `);

    const rows = result.recordset || [];
    if (rows.length === 0) return Response.json({ error: "Gönderilecek aktif belge bulunamadı." }, { status: 404 });
    if (rows.length !== ids.length) {
      return Response.json({ error: "Seçili belgelerden bazıları bulunamadı veya aktif değil." }, { status: 404 });
    }

    const attachments: Array<{ filename: string; content: Buffer; contentType: string } | { filename: string; path: string; cid: string }> = [];
    const belgeRows: string[] = [];
    for (const row of rows) {
      const pdf = await fetchPdf(String(row.Yol || ""));
      const fileBase = sanitizeFileName(`${row.RaporNo || row.ID} - ${row.NumuneAd || row.NumuneTur || "Belge"}`);
      attachments.push({ filename: `${fileBase}.pdf`, content: pdf, contentType: "application/pdf" });
      belgeRows.push(`
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eaeaea;color:#1d1d1f;font-weight:600;">${esc(row.RaporNo || row.ID)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eaeaea;color:#1d1d1f;">${esc(row.NumuneAd || "-")}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eaeaea;color:#6e6e73;">${esc(row.NumuneTur || "-")}</td>
        </tr>
      `);
    }

    const mesajHtml = mesaj
      ? `<p style="margin:0 0 16px 0;color:#1d1d1f;line-height:1.6;white-space:pre-wrap;">${esc(mesaj)}</p>`
      : "";
    const html = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><title>${esc(sirketAdi)} - Belgeler</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;">
  <div style="max-width:640px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;">
    <div style="padding:24px 28px;border-bottom:1px solid #eaeaea;">
      <img src="cid:unique-logo" alt="${esc(sirketAdi)}" style="height:32px;display:block;"/>
    </div>
    <div style="padding:28px;">
      <h2 style="margin:0 0 16px 0;font-size:18px;color:#1d1d1f;font-weight:700;">Belgeleriniz</h2>
      ${mesajHtml}
      <p style="margin:0 0 12px 0;color:#86868b;font-size:14px;">Ekteki PDF dosyalarında aşağıdaki belge(ler) yer almaktadır:</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #eaeaea;border-radius:8px;overflow:hidden;font-size:13px;">
        <thead>
          <tr style="background:#ffffff;">
            <th style="padding:8px 10px;text-align:left;color:#6e6e73;font-weight:600;border-bottom:1px solid #eaeaea;">Rapor No</th>
            <th style="padding:8px 10px;text-align:left;color:#6e6e73;font-weight:600;border-bottom:1px solid #eaeaea;">Numune</th>
            <th style="padding:8px 10px;text-align:left;color:#6e6e73;font-weight:600;border-bottom:1px solid #eaeaea;">Tür</th>
          </tr>
        </thead>
        <tbody>${belgeRows.join("")}</tbody>
      </table>
    </div>
    <div style="padding:18px 28px;background:#ffffff;border-top:1px solid #eaeaea;font-size:12px;color:#86868b;">
      <strong style="color:#1d1d1f;">${esc(sirketAdi)}</strong><br/>
      ${sirketAdres ? esc(sirketAdres) + "<br/>" : ""}
      ${sirketEmail ? `<a href="mailto:${esc(sirketEmail)}" style="color:#0071e3;text-decoration:none;">${esc(sirketEmail)}</a>` : ""}
      ${sirketWeb ? ` · <a href="${esc(sirketWeb)}" style="color:#0071e3;text-decoration:none;">${esc(sirketWeb)}</a>` : ""}
    </div>
  </div>
</body></html>`;

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
      subject: konu || `Belgeler - ${sirketAdi}`,
      html,
      attachments: allAttachments,
    });

    return Response.json({
      ok: true,
      gonderilen: rows.length,
      messageId: info.messageId,
      accepted: info.accepted || [],
      rejected: info.rejected || [],
    });
  } catch (e: unknown) {
    console.error("[yuklenmis-belgeler mail-gonder]", e);
    return Response.json({ error: getErrorMessage(e) }, { status: 500 });
  }
}
