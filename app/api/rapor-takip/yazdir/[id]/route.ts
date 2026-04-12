export const runtime = "nodejs";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest } from "next/server";
import { getReportData } from "@/lib/rapor/getReportData";
import { fillTemplate } from "@/lib/rapor/fillTemplate";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/rapor-takip/yazdir/[id]?format=Genel&output=docx|html
//
//   output=docx  → Şablonu doldurur, .docx olarak indirir
//   output=html  → Raporu HTML olarak render eder (print/PDF önizleme için)
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  const nkrId = parseInt(id);
  if (isNaN(nkrId)) return Response.json({ error: "Geçersiz ID" }, { status: 400 });

  const format = request.nextUrl.searchParams.get("format") || "Genel";
  const output = request.nextUrl.searchParams.get("output") || "docx";

  try {
    const data = await getReportData(nkrId, format);
    if (!data) return Response.json({ error: "Rapor bulunamadı" }, { status: 404 });

    // ── DOCX indirme ────────────────────────────────────────────────────────
    if (output === "docx") {
      const buf = await fillTemplate(data, format);
      const safe = (s: string) => s.replace(/[/\\:*?"<>|]/g, "_");
      const fileName = safe(`${data.RaporNo || `Rapor_${nkrId}`}_${format}.docx`);

      return new Response(buf as unknown as BodyInit, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${fileName}"`,
        },
      });
    }

    // ── HTML önizleme (PDF için print sayfası) ───────────────────────────────
    const html = buildPreviewHtml(data, format);
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });

  } catch (e: any) {
    if (output === "html") {
      // HTML modda kullanıcıya hata sayfası göster
      return new Response(
        `<html><body style="font:14px system-ui;padding:40px;color:#c00">
          <b>Hata:</b> ${e.message}
        </body></html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML rapor önizlemesi
// ─────────────────────────────────────────────────────────────────────────────

import type { ReportData } from "@/lib/rapor/getReportData";

function esc(s: string | null | undefined) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildPreviewHtml(d: ReportData, format: string): string {
  const hizmetRows = d.hizmetler.map((h, i) => `
    <tr style="background:${i % 2 === 0 ? "#fff" : "#f8f9fb"}">
      <td>${esc(h.Analiz)}</td>
      <td>${esc(h["Analiz-Eng"])}</td>
      <td style="text-align:center">${esc(h.Metot)}</td>
      <td style="text-align:center">${esc(h.Birim)}</td>
      <td style="text-align:center">${esc(h.LOQ)}</td>
      <td style="text-align:center">${esc(h.Limit)}</td>
      <td style="text-align:center;font-weight:600">${esc(h.Sonuc)}</td>
      <td style="text-align:center">${esc(h.Degerlendirme)}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>Rapor ${esc(d.RaporNo)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; font-size: 12px;
           background: #f0f2f5; color: #1d1d1f; }
    .page { max-width: 900px; margin: 0 auto; background: #fff;
            padding: 32px 40px; min-height: 100vh; }

    /* Yazdır */
    @media print {
      body { background: #fff; }
      .page { padding: 0; max-width: none; }
      .no-print { display: none !important; }
    }

    /* Başlık bandı */
    .header { display: flex; justify-content: space-between; align-items: flex-start;
               border-bottom: 2px solid #0071e3; padding-bottom: 16px; margin-bottom: 20px; }
    .header-left h1 { font-size: 18px; font-weight: 700; color: #0071e3; }
    .header-left p { font-size: 10px; color: #6e6e73; margin-top: 2px; }
    .header-right { text-align: right; }
    .badge { background: #0071e318; color: #0055a8; border-radius: 6px;
             padding: 4px 10px; font-size: 11px; font-weight: 700; }

    /* Bilgi kartları */
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
    .info-card { border: 1px solid #e5e9ef; border-radius: 8px; padding: 12px 14px; }
    .info-card h3 { font-size: 9px; font-weight: 700; color: #8e8e93;
                    text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
    .info-row { display: flex; gap: 8px; margin-bottom: 3px; font-size: 11.5px; }
    .info-label { color: #6e6e73; min-width: 90px; flex-shrink: 0; }
    .info-value { color: #1d1d1f; font-weight: 500; }

    /* Hizmet tablosu */
    .section-title { font-size: 9px; font-weight: 700; color: #8e8e93;
                     text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    thead tr { background: #f5f7fa; }
    th { padding: 8px 10px; text-align: left; font-size: 9px; font-weight: 700;
         color: #6e6e73; text-transform: uppercase; letter-spacing: 0.06em;
         border-bottom: 2px solid #e2e6ed; white-space: nowrap; }
    td { padding: 7px 10px; border-bottom: 1px solid #eaedf1; }

    /* Print butonu */
    .print-bar { position: sticky; top: 0; background: #fff8; backdrop-filter: blur(8px);
                  padding: 10px 0; margin-bottom: 16px; display: flex;
                  justify-content: flex-end; gap: 8px; }
    .btn { padding: 7px 16px; border-radius: 7px; border: none; cursor: pointer;
           font-size: 12px; font-weight: 600; }
    .btn-primary { background: #0071e3; color: #fff; }
    .btn-secondary { background: #f2f2f7; color: #1d1d1f; }
  </style>
</head>
<body>
<div class="page">

  <!-- Print bar -->
  <div class="print-bar no-print">
    <button class="btn btn-secondary" onclick="window.close()">Kapat</button>
    <button class="btn btn-primary" onclick="window.print()">🖨 PDF olarak yazdır</button>
  </div>

  <!-- Başlık -->
  <div class="header">
    <div class="header-left">
      <h1>ANALİZ RAPORU</h1>
      <p>${esc(format)} Formatı · ${esc(d.Yayin)} tarihinde oluşturuldu</p>
    </div>
    <div class="header-right">
      <div class="badge">${esc(d.RaporNo)}</div>
      <div style="font-size:10px;color:#8e8e93;margin-top:4px">Rev: ${esc(d.Rev)} · ${esc(d["MM-YY"])}</div>
    </div>
  </div>

  <!-- Bilgi gridı -->
  <div class="info-grid">
    <!-- Numune -->
    <div class="info-card">
      <h3>Numune Bilgileri</h3>
      <div class="info-row"><span class="info-label">Numune Adı</span><span class="info-value">${esc(d.NumuneAdi)}</span></div>
      <div class="info-row"><span class="info-label">İngilizce</span><span class="info-value">${esc(d["NumuneAdi-Eng"])}</span></div>
      <div class="info-row"><span class="info-label">Miktar</span><span class="info-value">${esc(d.Miktar) || "—"}</span></div>
      <div class="info-row"><span class="info-label">Seri No</span><span class="info-value">${esc(d.Seri)}</span></div>
      <div class="info-row"><span class="info-label">Üretim Tarihi</span><span class="info-value">${esc(d.Urt)}</span></div>
      <div class="info-row"><span class="info-label">SKT</span><span class="info-value">${esc(d.SKT)}</span></div>
    </div>
    <!-- Firma + Tarihler -->
    <div class="info-card">
      <h3>Firma &amp; Tarih Bilgileri</h3>
      <div class="info-row"><span class="info-label">Firma</span><span class="info-value">${esc(d.FirmaAd)}</span></div>
      <div class="info-row"><span class="info-label">Yetkili</span><span class="info-value">${esc(d.FirmaYetkili) || "—"}</span></div>
      <div class="info-row"><span class="info-label">Adres</span><span class="info-value">${esc(d.Adres) || "—"}</span></div>
      <div class="info-row"><span class="info-label">Kabul Tarihi</span><span class="info-value">${esc(d.Tarih)}</span></div>
      <div class="info-row"><span class="info-label">Yayın Tarihi</span><span class="info-value">${esc(d.Yayin)}</span></div>
    </div>
  </div>

  <!-- Hizmet tablosu -->
  <div class="section-title">Analiz Sonuçları (${d.hizmetler.length} hizmet)</div>
  <table>
    <thead>
      <tr>
        <th>Analiz Adı (TR)</th>
        <th>Analiz Adı (EN)</th>
        <th>Metot</th>
        <th>Birim</th>
        <th>LOQ</th>
        <th>Limit</th>
        <th>Sonuç</th>
        <th>Değerlendirme</th>
      </tr>
    </thead>
    <tbody>${hizmetRows}</tbody>
  </table>

</div>
</body>
</html>`;
}
