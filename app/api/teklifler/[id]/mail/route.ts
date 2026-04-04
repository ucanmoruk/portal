export const runtime = "nodejs";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import nodemailer from "nodemailer";
import { getAllSettings } from "@/lib/settings";

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

    const satirlar: any[] = sRes.recordset;
    const no = teklifLabel(h.TeklifNo, h.RevNo);

    // Hesaplamalar
    const kdvOran  = parseInt(h.KdvOran)      || 20;
    const genelIsk = parseFloat(h.GenelIskonto) || 0;
    let araToplam  = 0;
    for (const s of satirlar) {
      const adet    = parseInt(s.Adet)      || 1;
      const fiyat   = parseFloat(s.Fiyat)   || 0;
      const iskonto = parseFloat(s.Iskonto) || 0;
      araToplam += adet * fiyat * (1 - iskonto / 100);
    }
    const iskontoluTutar = araToplam * (1 - genelIsk / 100);
    const kdvTutar       = iskontoluTutar * kdvOran / 100;
    const genelToplam    = iskontoluTutar + kdvTutar;

    // Çoğunluk para birimi
    const pbCount: Record<string, number> = {};
    satirlar.forEach(s => { pbCount[s.ParaBirimi] = (pbCount[s.ParaBirimi] || 0) + 1; });
    const pb = Object.entries(pbCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "TRY";

    // Portal base URL (onay linkleri için ileriye dönük)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";

    // Hizmet satır HTML'i
    const satirHtml = satirlar.map((s: any, i: number) => {
      const adet    = parseInt(s.Adet)      || 1;
      const fiyat   = parseFloat(s.Fiyat)   || 0;
      const iskonto = parseFloat(s.Iskonto) || 0;
      const net     = adet * fiyat * (1 - iskonto / 100);
      const rowBg   = i % 2 === 0 ? "#ffffff" : "#f8f9fb";

      // Hizmet adı: akreditasyon varsa * öne, metot varsa sona
      const parts: string[] = [];
      if (s.Akreditasyon) parts.push("*");
      parts.push(escHtml(s.HizmetAdi || ""));
      if (s.Metot) parts.push(`/ ${escHtml(s.Metot)}`);
      const hizmetLabel = parts.join(" ");

      return `
        <tr style="background:${rowBg};">
          <td style="padding:9px 14px;border-bottom:1px solid #eaedf1;font-size:13px;color:#1d1d1f;">${hizmetLabel}</td>
          <td style="padding:9px 14px;border-bottom:1px solid #eaedf1;font-size:13px;text-align:center;color:#3a3a3c;">${adet}</td>
          <td style="padding:9px 14px;border-bottom:1px solid #eaedf1;font-size:13px;text-align:right;color:#3a3a3c;">${fmt(fiyat)} ${escHtml(s.ParaBirimi)}</td>
          <td style="padding:9px 14px;border-bottom:1px solid #eaedf1;font-size:13px;text-align:center;color:${iskonto > 0 ? "#c0392b" : "#8e8e93"};">${iskonto > 0 ? `%${iskonto}` : "—"}</td>
          <td style="padding:9px 14px;border-bottom:1px solid #eaedf1;font-size:13px;text-align:right;font-weight:600;color:#1d1d1f;">${fmt(net)} ${escHtml(s.ParaBirimi)}</td>
        </tr>`;
    }).join("");

    // Genel iskonto satırı (varsa)
    const iskontoSatirHtml = genelIsk > 0 ? `
      <tr>
        <td colspan="3" style="padding:7px 14px;text-align:right;font-size:13px;color:#6e6e73;">Genel İskonto (%${genelIsk})</td>
        <td colspan="2" style="padding:7px 14px;text-align:right;font-size:13px;font-weight:600;color:#c0392b;">-${fmt(araToplam * genelIsk / 100)} ${escHtml(pb)}</td>
      </tr>` : "";

    const html = buildHtml({
      sirketAdi, sirketWeb, sirketEmail, sirketAdres,
      no, tarih: h.Tarih, musteriAd: h.MusteriAd,
      musteriYetkili: h.MusteriYetkili, teklifVeren: h.TeklifVeren,
      teklifKonusu: h.TeklifKonusu,
      mesaj, notlar: h.Notlar,
      satirHtml, iskontoSatirHtml,
      pb, araToplam, genelIsk, kdvOran, kdvTutar, genelToplam,
      baseUrl, teklifId: id,
    });

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
    });

    // Durumu "Gönderildi" yap
    await pool.request()
      .input("ID", Number(id))
      .query(`UPDATE TeklifX1 SET TeklifDurum = 'Gönderildi' WHERE ID = @ID AND TeklifDurum = 'Taslak'`);

    return Response.json({ success: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ── HTML builder ──────────────────────────────────────────────────────────────

function buildHtml(p: {
  sirketAdi: string; sirketWeb: string; sirketEmail: string; sirketAdres: string;
  no: string; tarih: string; musteriAd: string; musteriYetkili: string; teklifVeren: string;
  teklifKonusu: string; mesaj: string; notlar: string;
  satirHtml: string; iskontoSatirHtml: string;
  pb: string; araToplam: number; genelIsk: number;
  kdvOran: number; kdvTutar: number; genelToplam: number;
  baseUrl: string; teklifId: string;
}) {
  const {
    sirketAdi, sirketWeb, sirketEmail, sirketAdres,
    no, tarih, musteriAd, musteriYetkili, teklifVeren,
    teklifKonusu, mesaj, notlar,
    satirHtml, iskontoSatirHtml,
    pb, araToplam, genelIsk, kdvOran, kdvTutar, genelToplam,
    baseUrl, teklifId,
  } = p;

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

function teklifLabel(no: number | null, rev: number) {
  if (!no) return "—";
  const yy  = String(no).slice(0, 2);
  const seq = String(no).slice(2).padStart(4, "0");
  return rev > 0 ? `${yy}${seq}/${rev}` : `${yy}${seq}`;
}

function fmt(n: any) {
  const num = parseFloat(n);
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
