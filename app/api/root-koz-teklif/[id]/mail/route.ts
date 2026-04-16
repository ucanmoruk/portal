import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { getAllSettings } from "@/lib/settings";
import { type NextRequest } from "next/server";
import nodemailer from "nodemailer";

const BOLUM_LABELS: Record<string, string> = {
  FORMULASYON: "Formülasyon & Ar-Ge (Root Scientific)",
  FASON:       "Fason Üretim (Root Works)",
  RUHSAT:      "Ruhsatlandırma & Mevzuat (Root Regulation)",
  TEST:        "Test & Analiz (Cosmoliz by Root)",
  MARKA:       "Marka & Tasarım (Root Branding)",
};

function fmt(n: number) {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function buildHtml(teklif: any, kalemler: any[]): string {
  const grouped: Record<string, any[]> = {};
  for (const k of kalemler) {
    if (!k.Dahil) continue;
    const b = k.Bolum || "DİĞER";
    if (!grouped[b]) grouped[b] = [];
    grouped[b].push(k);
  }

  let bolumRows = "";
  for (const [bolum, items] of Object.entries(grouped)) {
    bolumRows += `
      <tr>
        <td colspan="5" style="background:#f0f4f8;font-weight:700;font-size:12px;
          padding:8px 12px;color:#1d1d1f;border-top:2px solid #0071e3;">
          ${BOLUM_LABELS[bolum] || bolum}
        </td>
      </tr>`;
    for (const k of items) {
      const net = (parseFloat(k.Miktar) || 1) * (parseFloat(k.BirimFiyat) || 0) * (1 - (parseFloat(k.Iskonto) || 0) / 100);
      const cur = k.ParaBirimi || "TRY";
      bolumRows += `
        <tr>
          <td style="padding:7px 12px;color:#1d1d1f;font-size:13px;">${k.HizmetAdi}</td>
          <td style="padding:7px 12px;color:#515154;font-size:12px;text-align:center;">${k.Sure || "—"}</td>
          <td style="padding:7px 12px;color:#515154;font-size:12px;text-align:right;">${fmt(parseFloat(k.Miktar) || 1)}</td>
          <td style="padding:7px 12px;color:#515154;font-size:12px;text-align:right;">${fmt(parseFloat(k.BirimFiyat) || 0)} ${cur}</td>
          <td style="padding:7px 12px;color:#1d1d1f;font-size:13px;font-weight:600;text-align:right;">${fmt(net)} ${cur}</td>
        </tr>`;
    }
  }

  const ara = kalemler
    .filter(k => k.Dahil)
    .reduce((s: number, k: any) => {
      return s + (parseFloat(k.Miktar) || 1) * (parseFloat(k.BirimFiyat) || 0) * (1 - (parseFloat(k.Iskonto) || 0) / 100);
    }, 0);
  const gIsk   = parseFloat(teklif.GenelIskonto) || 0;
  const iskSon = ara * (1 - gIsk / 100);
  const kdvOr  = parseFloat(teklif.KDVOran) || 20;
  const kdv    = iskSon * kdvOr / 100;
  const toplam = iskSon + kdv;

  const tarih = new Date(teklif.Tarih).toLocaleDateString("tr-TR");

  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><title>Root Kozmetik Teklif</title></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:32px 0;">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#1d1d1f 0%,#333 100%);padding:32px 40px;">
    <p style="margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px;">Root Kozmetik</p>
    <p style="margin:4px 0 0;font-size:12px;color:#a1a1a6;letter-spacing:1px;text-transform:uppercase;">Kozmetik Marka Çıkarma Hizmet Teklifi</p>
  </td></tr>

  <!-- Info band -->
  <tr><td style="background:#f5f5f7;padding:16px 40px;">
    <table width="100%"><tr>
      <td style="font-size:12px;color:#515154;">
        <b>Teklif No:</b> ${teklif.TeklifNo}<br>
        <b>Tarih:</b> ${tarih}
      </td>
      <td style="font-size:12px;color:#515154;text-align:right;">
        <b>Müşteri:</b> ${teklif.MusteriAdi || "—"}<br>
        <b>Marka:</b> ${teklif.MarkaAdi || "—"}
      </td>
    </tr></table>
  </td></tr>

  <!-- Project info -->
  <tr><td style="padding:20px 40px 8px;">
    <table width="100%" style="border:1px solid #e5e5ea;border-radius:10px;overflow:hidden;">
      <tr style="background:#fafafa;">
        <td style="padding:10px 16px;font-size:12px;color:#515154;border-right:1px solid #e5e5ea;">
          <div style="color:#86868b;font-size:11px;text-transform:uppercase;letter-spacing:.5px;">Ürün Kategorisi</div>
          <div style="font-weight:600;color:#1d1d1f;margin-top:2px;">${teklif.UrunKategorisi || "—"}</div>
        </td>
        <td style="padding:10px 16px;font-size:12px;color:#515154;border-right:1px solid #e5e5ea;">
          <div style="color:#86868b;font-size:11px;text-transform:uppercase;letter-spacing:.5px;">SKU</div>
          <div style="font-weight:600;color:#1d1d1f;margin-top:2px;">${teklif.SKUSayisi || "—"}</div>
        </td>
        <td style="padding:10px 16px;font-size:12px;color:#515154;border-right:1px solid #e5e5ea;">
          <div style="color:#86868b;font-size:11px;text-transform:uppercase;letter-spacing:.5px;">Üretim Miktarı</div>
          <div style="font-weight:600;color:#1d1d1f;margin-top:2px;">${teklif.UretimMiktari || "—"}</div>
        </td>
        <td style="padding:10px 16px;font-size:12px;color:#515154;">
          <div style="color:#86868b;font-size:11px;text-transform:uppercase;letter-spacing:.5px;">Hedef Pazar</div>
          <div style="font-weight:600;color:#1d1d1f;margin-top:2px;">${teklif.HedefPazar || "—"}</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Services table -->
  <tr><td style="padding:20px 40px 8px;">
    <table width="100%" style="border-collapse:collapse;border:1px solid #e5e5ea;border-radius:10px;overflow:hidden;">
      <thead>
        <tr style="background:#1d1d1f;">
          <th style="padding:10px 12px;text-align:left;font-size:12px;color:#fff;font-weight:600;">Hizmet</th>
          <th style="padding:10px 12px;text-align:center;font-size:12px;color:#fff;font-weight:600;">Süre</th>
          <th style="padding:10px 12px;text-align:right;font-size:12px;color:#fff;font-weight:600;">Miktar</th>
          <th style="padding:10px 12px;text-align:right;font-size:12px;color:#fff;font-weight:600;">Birim Fiyat</th>
          <th style="padding:10px 12px;text-align:right;font-size:12px;color:#fff;font-weight:600;">Tutar</th>
        </tr>
      </thead>
      <tbody>${bolumRows}</tbody>
    </table>
  </td></tr>

  <!-- Totals -->
  <tr><td style="padding:8px 40px 24px;">
    <table align="right" style="min-width:280px;">
      ${gIsk > 0 ? `
      <tr>
        <td style="padding:4px 12px;font-size:13px;color:#515154;">Ara Toplam</td>
        <td style="padding:4px 12px;font-size:13px;color:#1d1d1f;text-align:right;">${fmt(ara)} TRY</td>
      </tr>
      <tr>
        <td style="padding:4px 12px;font-size:13px;color:#515154;">Genel İskonto (%${gIsk})</td>
        <td style="padding:4px 12px;font-size:13px;color:#e53935;text-align:right;">-${fmt(ara - iskSon)} TRY</td>
      </tr>` : ""}
      <tr>
        <td style="padding:4px 12px;font-size:13px;color:#515154;">KDV (%${kdvOr})</td>
        <td style="padding:4px 12px;font-size:13px;color:#1d1d1f;text-align:right;">${fmt(kdv)} TRY</td>
      </tr>
      <tr style="border-top:2px solid #0071e3;">
        <td style="padding:10px 12px;font-size:16px;font-weight:700;color:#1d1d1f;">TOPLAM</td>
        <td style="padding:10px 12px;font-size:16px;font-weight:700;color:#0071e3;text-align:right;">${fmt(toplam)} TRY</td>
      </tr>
    </table>
  </td></tr>

  ${teklif.OdemeTuru ? `
  <tr><td style="padding:0 40px 16px;">
    <p style="margin:0;font-size:12px;color:#515154;"><b>Ödeme Planı:</b> ${teklif.OdemeTuru}</p>
  </td></tr>` : ""}

  ${teklif.Notlar ? `
  <tr><td style="padding:0 40px 16px;">
    <p style="margin:0;font-size:12px;color:#515154;"><b>Notlar:</b> ${teklif.Notlar}</p>
  </td></tr>` : ""}

  <!-- Footer -->
  <tr><td style="background:#f5f5f7;padding:20px 40px;border-top:1px solid #e5e5ea;">
    <p style="margin:0;font-size:11px;color:#86868b;text-align:center;">
      Bu teklif ${tarih} tarihinde düzenlenmiş olup 30 gün geçerlidir.<br>
      Root Kozmetik A.Ş. — <a href="mailto:info@rootkozmetik.com" style="color:#0071e3;text-decoration:none;">info@rootkozmetik.com</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const pool = await poolPromise;
  const body = await req.json();

  const { to = [], cc = [], konu } = body;
  if (!to.length) return Response.json({ error: "En az bir alıcı gerekli" }, { status: 400 });

  // Teklif + kalemler
  const headerRes = await pool.request()
    .input("id", parseInt(id))
    .query(`SELECT * FROM RootKozTeklif WHERE ID = @id AND SilindiMi = 0`);
  if (!headerRes.recordset.length)
    return Response.json({ error: "Bulunamadı" }, { status: 404 });
  const teklif = headerRes.recordset[0];

  const kalemRes = await pool.request()
    .input("id", parseInt(id))
    .query(`SELECT * FROM RootKozTeklifKalem WHERE TeklifID = @id ORDER BY Sira`);

  // SMTP ayarları — lib/settings üzerinden (PortalAyarlar tablosu)
  const cfg      = await getAllSettings();
  const smtpHost = cfg.MAIL_HOST   || process.env.MAIL_HOST   || "";
  const smtpPort = parseInt(cfg.MAIL_PORT || process.env.MAIL_PORT || "587");
  const smtpUser = cfg.MAIL_USER   || process.env.MAIL_USER   || "";
  const smtpPass = cfg.MAIL_PASS   || process.env.MAIL_PASS   || "";
  const smtpFrom = cfg.MAIL_FROM   || process.env.MAIL_FROM   || smtpUser;
  const secure   = (cfg.MAIL_SECURE || process.env.MAIL_SECURE || "false") === "true";

  if (!smtpHost || !smtpUser || !smtpPass)
    return Response.json({ error: "Mail ayarları eksik. Admin > Ayarlar bölümünden MAIL_HOST, MAIL_USER, MAIL_PASS değerlerini kaydedin." }, { status: 500 });

  const transporter = nodemailer.createTransport({
    host: smtpHost, port: smtpPort, secure,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const html = buildHtml(teklif, kalemRes.recordset);
  const subject = konu || `Root Kozmetik Teklif — ${teklif.TeklifNo} — ${teklif.MusteriAdi || ""}`;

  await transporter.sendMail({
    from: smtpFrom,
    to:   to.join(", "),
    cc:   cc.length ? cc.join(", ") : undefined,
    subject,
    html,
  });

  // Durumu Gönderildi yap
  await pool.request()
    .input("id", parseInt(id))
    .query(`UPDATE RootKozTeklif SET Durum = 'Gönderildi', GuncellenmeTarihi = GETDATE() WHERE ID = @id`);

  return Response.json({ ok: true });
}
