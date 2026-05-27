export const runtime = "nodejs";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import nodemailer from "nodemailer";
import { getAllSettings } from "@/lib/settings";
import { createTeklifApprovalToken } from "@/lib/teklifApprovalToken";
import { existsSync } from "node:fs";
import path from "node:path";

interface TeklifMailSatir {
  HizmetAdi: string;
  Adet: number | string | null;
  Metot: string;
  Akreditasyon: string;
  Fiyat: number | string | null;
  ParaBirimi: string | null;
  Iskonto: number | string | null;
}

// ----------------------------------------------------------------
// POST /api/teklifler/[id]/mail
// Body: { to: string[], cc?: string[], konu?: string, mesaj?: string }
// ----------------------------------------------------------------
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return Response.json({ error: "Geçersiz ID" }, { status: 400 });
  }

  const body = await request.json();
  const to: string[]  = body.to   || [];
  const cc: string[]  = body.cc   || [];
  const konu: string  = body.konu  || "";
  const mesaj: string = body.mesaj || "";

  if (to.length === 0) {
    return Response.json({ error: "En az bir alıcı giriniz." }, { status: 400 });
  }

  try {
    const pool = await poolPromise;

    // Ayarları DB'den oku (env fallback)
    const cfg = await getAllSettings();
    const sirketAdi   = cfg.SIRKET_ADI   || process.env.SIRKET_ADI   || "ÜGD";
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
      return Response.json({ error: "Mail ayarları yapılmamış. Admin → Ayarlar bölümünden SMTP bilgilerini girin." }, { status: 500 });
    }

    // Teklif verilerini çek
    const hRes = await pool.request()
      .input("ID", Number(id))
      .query(`
        SELECT
          t.ID, t.TeklifNo, t.RevNo,
          FORMAT(t.Tarih, 'dd.MM.yyyy') AS Tarih,
          t.Notlar,
          ISNULL(t.TeklifKonusu, 'Fiyat teklifimiz') AS TeklifKonusu,
          ISNULL(t.TeklifVeren,  '')                  AS TeklifVeren,
          ISNULL(t.KdvOran, 20)                       AS KdvOran,
          ISNULL(t.GenelIskonto, 0)                   AS GenelIskonto,
          ISNULL(m.Ad,'')           AS MusteriAd,
          ISNULL(m.Email,'')        AS MusteriEmail,
          ISNULL(m.Telefon,'')      AS MusteriTelefon,
          ISNULL(m.Adres,'')        AS MusteriAdres,
          ISNULL(m.Yetkili,'')      AS MusteriYetkili
        FROM TeklifX1 t
        LEFT JOIN RootTedarikci m ON m.ID = t.MusteriID
        WHERE t.ID = @ID
      `);

    if (!hRes.recordset.length) {
      return Response.json({ error: "Teklif bulunamadı." }, { status: 404 });
    }

    const h = hRes.recordset[0];

    const sRes = await pool.request()
      .input("TeklifID", Number(id))
      .query(`
        SELECT HizmetAdi,
               ISNULL(Adet, 1)          AS Adet,
               ISNULL(Metot, '')        AS Metot,
               ISNULL(Akreditasyon, '') AS Akreditasyon,
               Fiyat, ParaBirimi,
               ISNULL(Iskonto, 0)       AS Iskonto
        FROM TeklifX2
        WHERE TeklifID = @TeklifID
        ORDER BY ID
      `);

    const satirlar = sRes.recordset as TeklifMailSatir[];
    const no = teklifLabel(h.TeklifNo, h.RevNo);

    // Hesaplamalar
    const kdvOran = Number.parseInt(String(h.KdvOran ?? ""), 10) || 20;
    const genelIsk = Number.parseFloat(String(h.GenelIskonto ?? "")) || 0;
    let araToplam  = 0;
    for (const s of satirlar) {
      const adet = Number.parseInt(String(s.Adet ?? ""), 10) || 1;
      const fiyat = Number.parseFloat(String(s.Fiyat ?? "")) || 0;
      const iskonto = Number.parseFloat(String(s.Iskonto ?? "")) || 0;
      araToplam += adet * fiyat * (1 - iskonto / 100);
    }
    const iskontoluTutar = araToplam * (1 - genelIsk / 100);
    const kdvTutar       = iskontoluTutar * kdvOran / 100;
    const genelToplam    = iskontoluTutar + kdvTutar;

    // Çoğunluk para birimi
    const pbCount: Record<string, number> = {};
    satirlar.forEach(s => {
      const p = s.ParaBirimi || "TRY";
      pbCount[p] = (pbCount[p] || 0) + 1;
    });
    const pb = Object.entries(pbCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "TRY";

    // Portal base URL (onay linkleri için ileriye dönük)
    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "");

    // Hizmet satır HTML'i
    const satirHtml = satirlar.map((s, i) => {
      const adet = Number.parseInt(String(s.Adet ?? ""), 10) || 1;
      const fiyat = Number.parseFloat(String(s.Fiyat ?? "")) || 0;
      const iskonto = Number.parseFloat(String(s.Iskonto ?? "")) || 0;
      const net     = adet * fiyat * (1 - iskonto / 100);
      // Hizmet adı: akreditasyon varsa * öne, metot varsa sona
      const parts: string[] = [];
      if (s.Akreditasyon) parts.push("*");
      parts.push(escHtml(s.HizmetAdi || ""));
      if (s.Metot) parts.push(`/ ${escHtml(s.Metot)}`);
      const hizmetLabel = parts.join(" ");

      return `
        <tr>
          <td style="padding:6px 8px;border-bottom:1px solid #eaeaea;text-align:center;color:#6e6e73;">${i + 1}.</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eaeaea;color:#1d1d1f;">${hizmetLabel}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eaeaea;text-align:center;color:#1d1d1f;">${adet}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eaeaea;text-align:right;color:#1d1d1f;">${fmt(fiyat)} ${escHtml(s.ParaBirimi)}${iskonto > 0 ? ` (-%${iskonto})` : ""}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eaeaea;text-align:right;font-weight:600;color:#1d1d1f;">${fmt(net)} ${escHtml(s.ParaBirimi)}</td>
        </tr>`;
    }).join("");

    // Genel iskonto satırı (varsa)
    const iskontoSatirHtml = genelIsk > 0 ? `
      <tr>
        <td colspan="4" style="padding:3px 4px;text-align:left;color:#1d1d1f;">İskonto (%${genelIsk}):</td>
        <td style="padding:3px 4px;text-align:right;font-weight:600;color:#1d1d1f;">${fmt(araToplam * genelIsk / 100)} ${escHtml(pb)}</td>
      </tr>` : "";

    const html = buildHtmlV4({
      sirketAdi, sirketWeb, sirketEmail, sirketAdres,
      no, tarih: h.Tarih, musteriAd: h.MusteriAd,
      musteriYetkili: h.MusteriYetkili, teklifVeren: h.TeklifVeren,
      teklifKonusu: h.TeklifKonusu,
      mesaj, notlar: h.Notlar,
      satirHtml, iskontoSatirHtml,
      pb, araToplam, genelIsk, kdvOran, kdvTutar, genelToplam,
      baseUrl, teklifId: id,
      logoSrc: "cid:unique-logo",
      sealSrc: "cid:unique-seal",
    });

    const attachments = [
      { filename: "unique-logo.png", path: path.join(process.cwd(), "public", "unique-logo.png"), cid: "unique-logo" },
      { filename: "unique-seal.png", path: path.join(process.cwd(), "public", "unique-seal.png"), cid: "unique-seal" },
    ].filter((asset) => existsSync(asset.path));

    // SMTP
    const transporter = nodemailer.createTransport({
      host:   mailHost,
      port:   mailPort,
      secure: mailSecure,
      auth: { user: mailUser, pass: mailPass },
    });

    await transporter.sendMail({
      from:    mailFrom,
      to:      to.join(", "),
      cc:      cc.length ? cc.join(", ") : undefined,
      subject: konu || `Fiyat Teklifimiz — ROT${no} | ${sirketAdi}`,
      html,
      attachments,
    });

    // Durumu "Gönderildi" yap
    await pool.request()
      .input("ID", Number(id))
      .query(`UPDATE TeklifX1 SET TeklifDurum = 'Gönderildi' WHERE ID = @ID AND TeklifDurum = 'Taslak'`);

    return Response.json({ success: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Mail gönderilemedi.";
    return Response.json({ error: message }, { status: 500 });
  }
}

// ── HTML builder ──────────────────────────────────────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return Response.json({ error: "Geçersiz ID" }, { status: 400 });
  }

  try {
    const html = await buildPreviewHtml(id, new URL(request.url).searchParams.get("mesaj") || "");
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Mail önizleme oluşturulamadı.";
    return Response.json({ error: message }, { status: 500 });
  }
}

async function buildPreviewHtml(id: string, mesaj: string) {
  const pool = await poolPromise;
  const cfg = await getAllSettings();
  const sirketAdi = cfg.SIRKET_ADI || process.env.SIRKET_ADI || "ÜGD";
  const sirketWeb = cfg.SIRKET_WEB || process.env.SIRKET_WEB || "";
  const sirketEmail = cfg.SIRKET_EMAIL || process.env.SIRKET_EMAIL || "";
  const sirketAdres = cfg.SIRKET_ADRES || process.env.SIRKET_ADRES || "";

  const hRes = await pool.request()
    .input("ID", Number(id))
    .query(`
      SELECT
        t.ID, t.TeklifNo, t.RevNo,
        FORMAT(t.Tarih, 'dd.MM.yyyy') AS Tarih,
        t.Notlar,
        ISNULL(t.TeklifKonusu, 'Fiyat teklifimiz') AS TeklifKonusu,
        ISNULL(t.TeklifVeren,  '')                  AS TeklifVeren,
        ISNULL(t.KdvOran, 20)                       AS KdvOran,
        ISNULL(t.GenelIskonto, 0)                   AS GenelIskonto,
        ISNULL(m.Ad,'')           AS MusteriAd,
        ISNULL(m.Yetkili,'')      AS MusteriYetkili
      FROM TeklifX1 t
      LEFT JOIN RootTedarikci m ON m.ID = t.MusteriID
      WHERE t.ID = @ID
    `);
  if (!hRes.recordset.length) throw new Error("Teklif bulunamadı.");

  const h = hRes.recordset[0];
  const sRes = await pool.request()
    .input("TeklifID", Number(id))
    .query(`
      SELECT HizmetAdi,
             ISNULL(Adet, 1)          AS Adet,
             ISNULL(Metot, '')        AS Metot,
             ISNULL(Akreditasyon, '') AS Akreditasyon,
             Fiyat, ParaBirimi,
             ISNULL(Iskonto, 0)       AS Iskonto
      FROM TeklifX2
      WHERE TeklifID = @TeklifID
      ORDER BY ID
    `);

  const satirlar = sRes.recordset as TeklifMailSatir[];
  const kdvOran = Number.parseInt(String(h.KdvOran ?? ""), 10) || 20;
  const genelIsk = Number.parseFloat(String(h.GenelIskonto ?? "")) || 0;
  let araToplam = 0;
  for (const s of satirlar) {
    const adet = Number.parseInt(String(s.Adet ?? ""), 10) || 1;
    const fiyat = Number.parseFloat(String(s.Fiyat ?? "")) || 0;
    const iskonto = Number.parseFloat(String(s.Iskonto ?? "")) || 0;
    araToplam += adet * fiyat * (1 - iskonto / 100);
  }
  const iskontoluTutar = araToplam * (1 - genelIsk / 100);
  const kdvTutar = iskontoluTutar * kdvOran / 100;
  const genelToplam = iskontoluTutar + kdvTutar;

  const pbCount: Record<string, number> = {};
  satirlar.forEach(s => {
    const p = s.ParaBirimi || "TRY";
    pbCount[p] = (pbCount[p] || 0) + 1;
  });
  const pb = Object.entries(pbCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "TRY";

  const satirHtml = satirlar.map((s, i) => {
    const adet = Number.parseInt(String(s.Adet ?? ""), 10) || 1;
    const fiyat = Number.parseFloat(String(s.Fiyat ?? "")) || 0;
    const iskonto = Number.parseFloat(String(s.Iskonto ?? "")) || 0;
    const net = adet * fiyat * (1 - iskonto / 100);
    const parts: string[] = [];
    if (s.Akreditasyon) parts.push("*");
    parts.push(escHtml(s.HizmetAdi || ""));
    if (s.Metot) parts.push(`/ ${escHtml(s.Metot)}`);
    const hizmetLabel = parts.join(" ");

    return `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eaeaea;text-align:center;color:#6e6e73;">${i + 1}.</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eaeaea;color:#1d1d1f;">${hizmetLabel}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eaeaea;text-align:center;color:#1d1d1f;">${adet}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eaeaea;text-align:right;color:#1d1d1f;">${fmt(fiyat)} ${escHtml(s.ParaBirimi)}${iskonto > 0 ? ` (-%${iskonto})` : ""}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eaeaea;text-align:right;font-weight:600;color:#1d1d1f;">${fmt(net)} ${escHtml(s.ParaBirimi)}</td>
      </tr>`;
  }).join("");

  const iskontoSatirHtml = genelIsk > 0 ? `
    <tr>
      <td colspan="4" style="padding:3px 4px;text-align:left;color:#1d1d1f;">İskonto (%${genelIsk}):</td>
      <td style="padding:3px 4px;text-align:right;font-weight:600;color:#1d1d1f;">${fmt(araToplam * genelIsk / 100)} ${escHtml(pb)}</td>
    </tr>` : "";

  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  return buildHtmlV4({
    sirketAdi, sirketWeb, sirketEmail, sirketAdres,
    no: teklifLabel(h.TeklifNo, h.RevNo),
    tarih: h.Tarih,
    musteriAd: h.MusteriAd,
    musteriYetkili: h.MusteriYetkili,
    teklifVeren: h.TeklifVeren,
    teklifKonusu: h.TeklifKonusu,
    mesaj,
    notlar: h.Notlar,
    satirHtml,
    iskontoSatirHtml,
    pb,
    araToplam,
    genelIsk,
    kdvOran,
    kdvTutar,
    genelToplam,
    baseUrl,
    teklifId: id,
    logoSrc: baseUrl ? `${baseUrl}/unique-logo.png` : "/unique-logo.png",
    sealSrc: baseUrl ? `${baseUrl}/unique-seal.png` : "/unique-seal.png",
  });
}

function buildHtml(p: {
  sirketAdi: string; sirketWeb: string; sirketEmail: string; sirketAdres: string;
  no: string; tarih: string; musteriAd: string; musteriYetkili: string; teklifVeren: string;
  teklifKonusu: string; mesaj: string; notlar: string;
  satirHtml: string; iskontoSatirHtml: string;
  pb: string; araToplam: number; genelIsk: number;
  kdvOran: number; kdvTutar: number; genelToplam: number;
  baseUrl: string; teklifId: string;
  logoSrc?: string; sealSrc?: string;
}) {
  const {
    sirketAdi, sirketWeb, sirketEmail, sirketAdres,
    no, tarih, musteriAd, musteriYetkili, teklifVeren,
    teklifKonusu, mesaj, notlar,
    satirHtml, iskontoSatirHtml,
    pb, araToplam, genelIsk, kdvOran, kdvTutar, genelToplam,
    baseUrl, teklifId,
  } = p;
  void genelIsk;

  // Onay butonları — URL'ler şimdilik placeholder (ileriye dönük)
  const onayUrl  = baseUrl ? `${baseUrl}/api/teklifler/${teklifId}/onay?action=onayla`  : "#";
  const reddetUrl = baseUrl ? `${baseUrl}/api/teklifler/${teklifId}/onay?action=reddet` : "#";

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Teklif ROT${no}</title>
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;">

  <div style="max-width:660px;margin:32px auto 48px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">

    <!-- ── Üst bant ─────────────────────────────────────────────── -->
    <div style="background:linear-gradient(135deg,#1a4f8a 0%,#0071e3 100%);padding:32px 36px 28px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.4px;">${escHtml(sirketAdi)}</div>
          ${sirketWeb ? `<div style="color:rgba(255,255,255,0.65);font-size:12px;margin-top:3px;">${escHtml(sirketWeb)}</div>` : ""}
        </div>
        <div style="text-align:right;">
          <div style="background:rgba(255,255,255,0.15);border-radius:8px;padding:8px 14px;display:inline-block;">
            <div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.5px;">ROT${no}</div>
            <div style="color:rgba(255,255,255,0.75);font-size:11px;margin-top:2px;">${tarih}</div>
          </div>
        </div>
      </div>
      <div style="color:rgba(255,255,255,0.55);font-size:12px;margin-top:18px;border-top:1px solid rgba(255,255,255,0.2);padding-top:14px;">
        FİYAT TEKLİFİ
      </div>
    </div>

    <!-- ── Teklif bilgi kartı ────────────────────────────────────── -->
    <div style="padding:24px 36px 0;display:flex;gap:0;">

      <!-- Sol: Müşteri -->
      <div style="flex:1;padding-right:20px;border-right:1px solid #e5e9ef;">
        <div style="font-size:10px;font-weight:700;color:#8e8e93;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:8px;">MÜŞTERİ</div>
        <div style="font-size:15px;font-weight:700;color:#1d1d1f;">${escHtml(musteriAd)}</div>
        ${musteriYetkili ? `<div style="font-size:13px;color:#3a3a3c;margin-top:3px;">${escHtml(musteriYetkili)}</div>` : ""}
      </div>

      <!-- Sağ: Teklif bilgileri -->
      <div style="flex:1;padding-left:24px;">
        <div style="font-size:10px;font-weight:700;color:#8e8e93;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:8px;">TEKLİF BİLGİLERİ</div>
        <table style="font-size:13px;border-collapse:collapse;width:100%;">
          <tr>
            <td style="color:#6e6e73;padding:2px 10px 2px 0;white-space:nowrap;">Konu</td>
            <td style="color:#1d1d1f;font-weight:500;">${escHtml(teklifKonusu)}</td>
          </tr>
          ${teklifVeren ? `
          <tr>
            <td style="color:#6e6e73;padding:2px 10px 2px 0;white-space:nowrap;">Teklifi Veren</td>
            <td style="color:#1d1d1f;font-weight:500;">${escHtml(teklifVeren)}</td>
          </tr>` : ""}
          <tr>
            <td style="color:#6e6e73;padding:2px 10px 2px 0;white-space:nowrap;">Tarih</td>
            <td style="color:#1d1d1f;">${tarih}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- ── Kişisel mesaj ─────────────────────────────────────────── -->
    ${mesaj ? `
    <div style="margin:20px 36px 0;background:#f0f7ff;border-left:3px solid #0071e3;border-radius:0 8px 8px 0;padding:12px 16px;font-size:14px;color:#1d1d1f;white-space:pre-wrap;line-height:1.55;">${escHtml(mesaj)}</div>
    ` : ""}

    <!-- ── Hizmet tablosu ────────────────────────────────────────── -->
    <div style="padding:20px 36px 0;">
      <div style="font-size:10px;font-weight:700;color:#8e8e93;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:10px;">HİZMETLER</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;border-radius:10px;overflow:hidden;border:1px solid #eaedf1;">
        <thead>
          <tr style="background:#f5f7fa;">
            <th style="padding:10px 14px;text-align:left;font-weight:600;font-size:11px;color:#6e6e73;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e6ed;">Hizmet / Analiz</th>
            <th style="padding:10px 14px;text-align:center;font-weight:600;font-size:11px;color:#6e6e73;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e6ed;width:48px;">Adet</th>
            <th style="padding:10px 14px;text-align:right;font-weight:600;font-size:11px;color:#6e6e73;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e6ed;">Birim Fiyat</th>
            <th style="padding:10px 14px;text-align:center;font-weight:600;font-size:11px;color:#6e6e73;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e6ed;width:60px;">İskonto</th>
            <th style="padding:10px 14px;text-align:right;font-weight:600;font-size:11px;color:#6e6e73;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e6ed;">Net Tutar</th>
          </tr>
        </thead>
        <tbody>${satirHtml}</tbody>
      </table>
    </div>

    <!-- ── Tutar özeti ───────────────────────────────────────────── -->
    <div style="padding:0 36px;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr>
          <td style="padding:8px 14px;color:#6e6e73;text-align:right;">Ara Toplam</td>
          <td style="padding:8px 14px;text-align:right;font-weight:500;color:#1d1d1f;width:160px;">${fmt(araToplam)} ${escHtml(pb)}</td>
        </tr>
        ${iskontoSatirHtml}
        <tr>
          <td style="padding:8px 14px;color:#6e6e73;text-align:right;">KDV (%${kdvOran})</td>
          <td style="padding:8px 14px;text-align:right;font-weight:500;color:#1d1d1f;">${fmt(kdvTutar)} ${escHtml(pb)}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;text-align:right;font-size:15px;font-weight:700;color:#1a4f8a;border-top:2px solid #e2e6ed;">Genel Toplam</td>
          <td style="padding:10px 14px;text-align:right;font-size:15px;font-weight:700;color:#1a4f8a;border-top:2px solid #e2e6ed;">${fmt(genelToplam)} ${escHtml(pb)}</td>
        </tr>
      </table>
    </div>

    ${notlar ? `
    <!-- ── Not ─────────────────────────────────────────────────── -->
    <div style="margin:0 36px 20px;background:#fff8e6;border-left:3px solid #f59e0b;border-radius:0 8px 8px 0;padding:11px 14px;font-size:13px;color:#1d1d1f;line-height:1.55;">
      <strong style="color:#92400e;">Not:</strong> ${escHtml(notlar)}
    </div>
    ` : ""}

    <!-- ── Onay butonları ────────────────────────────────────────── -->
    <div style="padding:24px 36px;text-align:center;border-top:1px solid #eaedf1;margin-top:12px;">
      <p style="font-size:14px;color:#3a3a3c;margin:0 0 18px;">Bu teklifi inceleyerek onaylayabilir veya revizyon talep edebilirsiniz.</p>
      <div style="display:inline-flex;gap:12px;flex-wrap:wrap;justify-content:center;">
        <a href="${onayUrl}"
           style="display:inline-block;padding:12px 28px;background:#1a4f8a;color:#ffffff;font-size:14px;font-weight:600;border-radius:10px;text-decoration:none;letter-spacing:0.2px;">
          ✓ Teklifi Onayla
        </a>
        <a href="${reddetUrl}"
           style="display:inline-block;padding:12px 28px;background:#ffffff;color:#c0392b;font-size:14px;font-weight:600;border-radius:10px;text-decoration:none;border:1.5px solid #e5c0bb;letter-spacing:0.2px;">
          ✗ Revizyon / Red
        </a>
      </div>
      <p style="font-size:11px;color:#8e8e93;margin:14px 0 0;">Sorularınız için: ${escHtml(sirketEmail)}</p>
    </div>

    <!-- ── Footer ───────────────────────────────────────────────── -->
    <div style="padding:14px 36px;background:#f5f7fa;border-top:1px solid #eaedf1;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
      <div style="font-size:11px;color:#8e8e93;">${escHtml(sirketAdi)}${sirketAdres ? ` · ${escHtml(sirketAdres)}` : ""}</div>
      <div style="font-size:11px;color:#aaaaaa;">Bu teklif elektronik olarak hazırlanmıştır.</div>
    </div>

  </div>
</body>
</html>`;
}

// ── Yardımcı fonksiyonlar ─────────────────────────────────────────────────────

void buildHtml;

function buildHtmlV4(p: Parameters<typeof buildHtml>[0]) {
  const {
    sirketAdi, sirketEmail,
    no, tarih, musteriAd, musteriYetkili, teklifVeren,
    mesaj, notlar, satirHtml, iskontoSatirHtml,
    pb, araToplam, kdvOran, kdvTutar, genelToplam,
    baseUrl, teklifId, logoSrc, sealSrc,
  } = p;

  const approvalToken = createTeklifApprovalToken(teklifId);
  const onayUrl = baseUrl ? `${baseUrl}/api/teklifler/${teklifId}/onay?token=${encodeURIComponent(approvalToken)}` : "#";
  const logoUrl = logoSrc ?? (baseUrl ? `${baseUrl}/unique-logo.png` : "");
  const sealUrl = sealSrc ?? (baseUrl ? `${baseUrl}/unique-seal.png` : "");

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Teklif ${escHtml(no)}</title>
</head>
<body style="margin:0;padding:24px;background:#f5f5f7;font-family:'JetBrains Mono','Cascadia Mono',Consolas,'Courier New',monospace;color:#1d1d1f;font-size:10.5px;line-height:1.5;">
  <div style="width:720px;max-width:100%;margin:0 auto;background:#ffffff;padding:48px 42px 28px;box-sizing:border-box;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:34px;">
      <div>${logoUrl ? `<img src="${logoUrl}" alt="${escHtml(sirketAdi)}" style="height:45px;width:auto;display:block;">` : `<div style="font-weight:800;font-size:18px;">${escHtml(sirketAdi)}</div>`}</div>
      <div style="font-size:21px;font-weight:900;letter-spacing:.8px;padding-top:15px;">FİYAT TEKLİFİ</div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:8px;">
      <tr>
        <td style="font-weight:700;width:120px;padding:2px 8px 2px 0;">Referans No:</td>
        <td style="padding:2px 8px;">${escHtml(no)}</td>
        <td style="text-align:right;padding:2px 0;">${escHtml(tarih)}</td>
      </tr>
    </table>
    <div style="font-weight:700;font-size:11px;margin-top:30px;margin-bottom:8px;">Sayın,</div>
    <div style="font-weight:800;font-size:11px;">${escHtml(musteriAd)}</div>
    ${musteriYetkili ? `<div style="font-size:11px;margin-top:2px;">${escHtml(musteriYetkili)}</div>` : ""}
    <div style="margin-top:18px;">Hizmet teklifimiz aşağıdaki gibidir.</div>
    ${mesaj ? `<div style="margin-top:14px;white-space:pre-wrap;">${escHtml(mesaj)}</div>` : ""}
    <table style="width:100%;border-collapse:collapse;margin-top:22px;font-size:10.5px;">
      <thead>
        <tr>
          <th style="width:36px;text-align:center;padding:7px 8px;border-bottom:1.5px solid #444;">No</th>
          <th style="text-align:left;padding:7px 8px;border-bottom:1.5px solid #444;">Açıklama</th>
          <th style="width:60px;text-align:center;padding:7px 8px;border-bottom:1.5px solid #444;">Adet</th>
          <th style="width:120px;text-align:right;padding:7px 8px;border-bottom:1.5px solid #444;">Birim Fiyat</th>
          <th style="width:130px;text-align:right;padding:7px 8px;border-bottom:1.5px solid #444;">Toplam Fiyat</th>
        </tr>
      </thead>
      <tbody>${satirHtml}</tbody>
    </table>
    <table style="width:100%;border-collapse:collapse;margin-top:18px;border:2px solid #4A46E5;font-size:11.5px;">
      <tr>
        <td style="padding:12px 14px 3px;">Ara Toplam:</td>
        <td style="padding:12px 14px 3px;text-align:right;">${fmt(araToplam)} ${escHtml(pb)}</td>
      </tr>
      ${iskontoSatirHtml}
      <tr>
        <td style="padding:3px 14px;">KDV (%${kdvOran}):</td>
        <td style="padding:3px 14px;text-align:right;">${fmt(kdvTutar)} ${escHtml(pb)}</td>
      </tr>
      <tr>
        <td style="padding:8px 14px 12px;font-weight:700;border-top:1px solid #d6dee8;">Genel Toplam:</td>
        <td style="padding:8px 14px 12px;text-align:right;font-weight:700;border-top:1px solid #d6dee8;">${fmt(genelToplam)} ${escHtml(pb)}</td>
      </tr>
    </table>
    <div style="margin-top:22px;font-size:9.5px;line-height:1.5;">
      <div style="font-weight:700;font-size:10px;margin-bottom:4px;">Notlar:</div>
      <p style="margin:0;">Teklifimizin geçerlilik süresi 30 gündür.</p>
      <p style="margin:0;">“*” işaretli analizler TÜRKAK tarafından TS EN ISO/IEC 17025'e göre akreditasyon kapsamımızda yer almaktadır.</p>
      <p style="margin:0;">Numune gönderimi kargo ile yapıldığında, kargo ücreti göndericiye aittir.</p>
      <p style="margin:0;">Fiyat teklifimizi ıslak imzalı olarak, mail üzerinden veya numune gönderimi sağlayarak onayladığınızı beyan edebilirsiniz.</p>
      ${notlar ? `<p style="margin:10px 0 0;font-weight:600;">${escHtml(notlar)}</p>` : ""}
    </div>
    <div style="margin-top:34px;text-align:right;">
      <div style="text-align:right;min-width:200px;margin-left:auto;display:inline-block;">
        <div style="font-size:13px;letter-spacing:-1px;">_______________</div>
        <div style="font-weight:700;font-size:11px;letter-spacing:.5px;">ONAYLAYAN</div>
        <div style="font-size:10px;color:#6e6e73;">Kaşe / İmza</div>
        <a href="${onayUrl}" style="display:inline-block;margin-top:14px;padding:10px 18px;background:#4A46E5;color:#ffffff;text-decoration:none;font-weight:700;border-radius:6px;font-size:12px;">Onaylıyorum</a>
      </div>
    </div>
    <div style="margin-top:30px;display:flex;align-items:flex-end;">
      <div style="text-align:center;">
        <div style="font-weight:700;font-size:11px;margin-bottom:10px;">Teklifi Hazırlayan</div>
        <div style="display:inline-block;background:#e8f4f8;color:#4A46E5;border:1px solid #b8dbe3;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:600;margin-bottom:8px;">✓ E-İmzalıdır</div>
        <div style="font-weight:600;font-size:11px;">${escHtml(teklifVeren || "—")}</div>
      </div>
      ${sealUrl ? `<div style="margin-left:auto;text-align:right;"><img src="${sealUrl}" alt="" style="height:90px;width:auto;"></div>` : ""}
    </div>
    <div style="margin-top:30px;display:table;width:100%;font-size:8.5px;color:#6e6e73;text-align:center;">
      <span style="display:table-cell;width:33.33%;text-align:left;">${escHtml(sirketEmail || "info@uniqueanalyse.com")}</span>
      <span style="display:table-cell;width:33.33%;text-align:center;">F.01.PR.03 – Yayın Tarihi: 27.09.2023</span>
      <span style="display:table-cell;width:33.33%;text-align:right;">Sayfa: 1 / 1</span>
    </div>
  </div>
</body>
</html>`;
}

function teklifLabel(no: number | null, rev: number) {
  if (!no) return "—";
  const yy  = String(no).slice(0, 2);
  const seq = String(no).slice(2).padStart(4, "0");
  return rev > 0 ? `${yy}${seq}/${rev}` : `${yy}${seq}`;
}

function fmt(n: unknown) {
  const num = Number.parseFloat(String(n ?? ""));
  if (isNaN(num)) return "—";
  return num.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escHtml(s: string | null | undefined) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
