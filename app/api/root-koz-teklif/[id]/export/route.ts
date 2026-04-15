import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { type NextRequest } from "next/server";

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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const pool = await poolPromise;

  const headerRes = await pool.request()
    .input("id", parseInt(id))
    .query(`SELECT * FROM RootKozTeklif WHERE ID = @id AND SilindiMi = 0`);
  if (!headerRes.recordset.length)
    return new Response("Bulunamadı", { status: 404 });
  const t = headerRes.recordset[0];

  const kalemRes = await pool.request()
    .input("id", parseInt(id))
    .query(`SELECT * FROM RootKozTeklifKalem WHERE TeklifID = @id ORDER BY Sira`);
  const kalemler = kalemRes.recordset;

  // Gruplama
  const grouped: Record<string, any[]> = {};
  for (const k of kalemler) {
    if (!k.Dahil) continue;
    const b = k.Bolum || "DİĞER";
    if (!grouped[b]) grouped[b] = [];
    grouped[b].push(k);
  }

  // Hesaplamalar
  const ara = kalemler
    .filter(k => k.Dahil)
    .reduce((s: number, k: any) => s + (parseFloat(k.Miktar)||1)*(parseFloat(k.BirimFiyat)||0)*(1-(parseFloat(k.Iskonto)||0)/100), 0);
  const gIsk   = parseFloat(t.GenelIskonto) || 0;
  const iskSon = ara * (1 - gIsk / 100);
  const kdvOr  = parseFloat(t.KDVOran) || 20;
  const kdv    = iskSon * kdvOr / 100;
  const toplam = iskSon + kdv;
  const tarih  = new Date(t.Tarih).toLocaleDateString("tr-TR");
  const gecerlilik = (() => {
    const d = new Date(t.Tarih);
    d.setDate(d.getDate() + 30);
    return d.toLocaleDateString("tr-TR");
  })();

  let bolumSections = "";
  for (const [bolum, items] of Object.entries(grouped)) {
    const rows = items.map(k => {
      const net = (parseFloat(k.Miktar)||1) * (parseFloat(k.BirimFiyat)||0) * (1-(parseFloat(k.Iskonto)||0)/100);
      return `
        <tr>
          <td>${k.HizmetAdi}</td>
          <td style="text-align:center">${k.Sure || "—"}</td>
          <td style="text-align:right">${fmt(parseFloat(k.Miktar)||1)}</td>
          <td style="text-align:right">${fmt(parseFloat(k.BirimFiyat)||0)} ${k.ParaBirimi||"TRY"}</td>
          <td style="text-align:right;font-weight:600">${fmt(net)} ${k.ParaBirimi||"TRY"}</td>
        </tr>`;
    }).join("");

    bolumSections += `
      <tr class="section-header">
        <td colspan="5">${BOLUM_LABELS[bolum] || bolum}</td>
      </tr>
      ${rows}`;
  }

  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<title>Root Kozmetik Teklif — ${t.TeklifNo}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 13px;
    color: #1d1d1f;
    background: #fff;
    padding: 40px;
    max-width: 900px;
    margin: 0 auto;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 32px;
    padding-bottom: 20px;
    border-bottom: 2px solid #1d1d1f;
  }
  .brand { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
  .brand-sub { font-size: 12px; color: #86868b; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }
  .teklif-meta { text-align: right; }
  .teklif-meta p { font-size: 12px; color: #515154; line-height: 1.6; }
  .teklif-meta .no { font-size: 20px; font-weight: 700; color: #0071e3; }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1px;
    background: #e5e5ea;
    border: 1px solid #e5e5ea;
    border-radius: 10px;
    overflow: hidden;
    margin-bottom: 28px;
  }
  .info-cell {
    background: #fafafa;
    padding: 12px 14px;
  }
  .info-label { font-size: 10px; color: #86868b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px; }
  .info-value { font-size: 13px; font-weight: 600; }

  table.services {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid #e5e5ea;
    border-radius: 10px;
    overflow: hidden;
    margin-bottom: 24px;
  }
  table.services th {
    background: #1d1d1f;
    color: #fff;
    padding: 10px 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  table.services th:not(:first-child) { text-align: right; }
  table.services th:nth-child(2) { text-align: center; }
  table.services td {
    padding: 8px 12px;
    border-bottom: 1px solid #f2f2f7;
    font-size: 12px;
    vertical-align: middle;
  }
  table.services td:not(:first-child) { text-align: right; }
  table.services td:nth-child(2) { text-align: center; }
  tr.section-header td {
    background: #f0f4f8;
    font-weight: 700;
    font-size: 11px;
    color: #0071e3;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 8px 12px;
    border-top: 2px solid #0071e3;
  }

  .totals {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 28px;
  }
  .totals-inner { min-width: 300px; }
  .total-row {
    display: flex;
    justify-content: space-between;
    padding: 5px 0;
    font-size: 13px;
  }
  .total-row.final {
    border-top: 2px solid #0071e3;
    margin-top: 6px;
    padding-top: 10px;
    font-size: 18px;
    font-weight: 700;
    color: #0071e3;
  }
  .total-row .label { color: #515154; }
  .total-row.final .label { color: #1d1d1f; }

  .ödeme { font-size: 12px; color: #515154; margin-bottom: 20px; }
  .notlar { background: #f5f5f7; border-radius: 8px; padding: 14px; font-size: 12px; color: #515154; margin-bottom: 28px; }

  .project-phases {
    border: 1px solid #e5e5ea;
    border-radius: 10px;
    overflow: hidden;
    margin-bottom: 28px;
  }
  .project-phases h3 {
    background: #f5f5f7;
    padding: 10px 16px;
    font-size: 12px;
    font-weight: 700;
    color: #1d1d1f;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid #e5e5ea;
  }
  .phase-list { padding: 12px 16px; }
  .phase-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 6px 0;
    font-size: 12px;
    border-bottom: 1px solid #f2f2f7;
  }
  .phase-item:last-child { border-bottom: none; }
  .phase-num {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #0071e3;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .phase-text .phase-title { font-weight: 600; }
  .phase-text .phase-sub { color: #515154; font-size: 11px; }

  .signatures {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-top: 40px;
    padding-top: 24px;
    border-top: 1px solid #e5e5ea;
  }
  .sig-box {
    border: 1px dashed #c7c7cc;
    border-radius: 8px;
    padding: 20px;
    min-height: 100px;
  }
  .sig-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #515154; margin-bottom: 8px; }

  .footer {
    margin-top: 32px;
    padding-top: 16px;
    border-top: 1px solid #e5e5ea;
    font-size: 11px;
    color: #86868b;
    text-align: center;
  }

  @media print {
    body { padding: 20px; }
    .no-print { display: none !important; }
    @page { margin: 1.5cm; }
  }
</style>
</head>
<body>

<div class="no-print" style="position:fixed;top:20px;right:20px;display:flex;gap:8px;z-index:100;">
  <button onclick="window.print()"
    style="background:#0071e3;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer;">
    🖨 Yazdır / PDF
  </button>
  <button onclick="window.close()"
    style="background:#f5f5f7;color:#1d1d1f;border:1px solid #e5e5ea;border-radius:8px;padding:10px 20px;font-size:14px;cursor:pointer;">
    Kapat
  </button>
</div>

<div class="header">
  <div>
    <div class="brand">Root Kozmetik</div>
    <div class="brand-sub">Kozmetik Marka Çıkarma Hizmet Teklifi</div>
  </div>
  <div class="teklif-meta">
    <div class="no">${t.TeklifNo}</div>
    <p>Tarih: ${tarih}</p>
    <p>Geçerlilik: ${gecerlilik}</p>
  </div>
</div>

<div class="info-grid">
  <div class="info-cell">
    <div class="info-label">Müşteri</div>
    <div class="info-value">${t.MusteriAdi || "—"}</div>
  </div>
  <div class="info-cell">
    <div class="info-label">Marka Adı</div>
    <div class="info-value">${t.MarkaAdi || "—"}</div>
  </div>
  <div class="info-cell">
    <div class="info-label">Ürün Kategorisi</div>
    <div class="info-value">${t.UrunKategorisi || "—"}</div>
  </div>
  <div class="info-cell">
    <div class="info-label">SKU / Üretim</div>
    <div class="info-value">${t.SKUSayisi ? `${t.SKUSayisi} SKU` : "—"} ${t.UretimMiktari ? `· ${t.UretimMiktari}` : ""}</div>
  </div>
</div>

<table class="services">
  <thead>
    <tr>
      <th style="text-align:left">Hizmet</th>
      <th style="text-align:center">Süre</th>
      <th style="text-align:right">Miktar</th>
      <th style="text-align:right">Birim Fiyat</th>
      <th style="text-align:right">Tutar</th>
    </tr>
  </thead>
  <tbody>
    ${bolumSections}
  </tbody>
</table>

<div class="totals">
  <div class="totals-inner">
    ${gIsk > 0 ? `
    <div class="total-row">
      <span class="label">Ara Toplam</span>
      <span>${fmt(ara)} TRY</span>
    </div>
    <div class="total-row">
      <span class="label">Genel İskonto (%${gIsk})</span>
      <span style="color:#e53935">-${fmt(ara - iskSon)} TRY</span>
    </div>` : ""}
    <div class="total-row">
      <span class="label">KDV (%${kdvOr})</span>
      <span>${fmt(kdv)} TRY</span>
    </div>
    <div class="total-row final">
      <span class="label">TOPLAM</span>
      <span>${fmt(toplam)} TRY</span>
    </div>
  </div>
</div>

${t.OdemeTuru ? `<div class="ödeme"><strong>Ödeme Planı:</strong> ${t.OdemeTuru}</div>` : ""}
${t.Notlar    ? `<div class="notlar"><strong>Notlar:</strong> ${t.Notlar}</div>`    : ""}

<div class="project-phases">
  <h3>Proje Aşamaları</h3>
  <div class="phase-list">
    ${[
      ["Briefing & ihtiyaç analizi", "Root + Müşteri → Proje onay formu"],
      ["Teklif ve sözleşme onayı + ön ödeme", "Müşteri → İmzalı sözleşme"],
      ["Formülasyon / tasarım / başvuru başlatma", "Root → İlerleme raporu"],
      ["Numune / taslak onayı", "Müşteri → Yazılı onay"],
      ["Üretim / bildirim / test süreçleri", "Root → Sertifikalar, raporlar"],
      ["Final teslimat + fatura", "Root → Tüm dosyalar + ürün"],
      ["Destek dönemi", "Root → Talep bazlı"],
    ].map(([title, sub], i) => `
    <div class="phase-item">
      <div class="phase-num">${i+1}</div>
      <div class="phase-text">
        <div class="phase-title">${title}</div>
        <div class="phase-sub">${sub}</div>
      </div>
    </div>`).join("")}
  </div>
</div>

<div class="signatures">
  <div class="sig-box">
    <div class="sig-title">Root Kozmetik A.Ş.</div>
    <div style="margin-top:40px;border-top:1px solid #c7c7cc;padding-top:8px;font-size:11px;color:#515154;">
      Yetkili / Tarih
    </div>
  </div>
  <div class="sig-box">
    <div class="sig-title">${t.MusteriAdi || "Müşteri / Firma"}</div>
    <div style="margin-top:40px;border-top:1px solid #c7c7cc;padding-top:8px;font-size:11px;color:#515154;">
      Yetkili / Tarih
    </div>
  </div>
</div>

<div class="footer">
  Bu teklif ${tarih} tarihinde düzenlenmiş olup 30 gün geçerlidir. &nbsp;|&nbsp; Root Kozmetik A.Ş.
</div>

</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
