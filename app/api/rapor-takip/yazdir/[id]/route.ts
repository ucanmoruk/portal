export const runtime = "nodejs";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest } from "next/server";
import { getReportData } from "@/lib/rapor/getReportData";
import { fillTemplate } from "@/lib/rapor/fillTemplate";
import * as fs from "fs";
import * as path from "path";
import PizZip from "pizzip";

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

    // ── Onay önizlemesi ─────────────────────────────────────────────────────
    if (output === "approval") {
      const html = buildApprovalHtml(data, format);
      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

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

function templateImageDataUri(format: string, fileName: string) {
  try {
    const templatePath = path.join(process.cwd(), "sablon", `${format}.docx`);
    if (!fs.existsSync(templatePath)) return "";
    const zip = new PizZip(fs.readFileSync(templatePath));
    const file = zip.file(`word/media/${fileName}`);
    if (!file) return "";
    const ext = path.extname(fileName).toLowerCase();
    const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
    return `data:${mime};base64,${file.asNodeBuffer().toString("base64")}`;
  } catch {
    return "";
  }
}

function buildApprovalHtml(d: ReportData, format: string): string {
  const brandLogo = templateImageDataUri(format, "image9.png") || templateImageDataUri(format, "image7.png") || "/logo-teklif.png";
  const topLine = templateImageDataUri(format, "image8.png") || templateImageDataUri(format, "image10.png");
  const accreditation = templateImageDataUri(format, "image6.jpg");
  const seal = templateImageDataUri(format, "image1.png");
  const reporterSign = templateImageDataUri(format, "image5.jpg");
  const managerSign = templateImageDataUri(format, "image4.jpg");
  const hizmetRows = d.hizmetler.map((h, i) => `
    <tr>
      <td><div>${esc(h["Analiz-Eng"])}</div><em>${esc(h.Analiz)}</em></td>
      <td><div>${esc(h["Birim-Eng"])}</div><em>${esc(h.Birim)}</em></td>
      <td><div>${esc(h["Sonuc-Eng"])}</div><em>${esc(h.Sonuc)}</em></td>
      <td>${esc(h.LOQ)}</td>
      <td>-</td>
      <td><div>${esc(h["Metot-Eng"])}</div><em>${esc(h.Metot)}</em></td>
      <td><div>${esc(h["Limit-Eng"])}</div><em>${esc(h.Limit)}</em></td>
      <td><div>${esc(h["Degerlendirme-Eng"])}</div><em>${esc(h.Degerlendirme)}</em></td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>Onay Önizleme - ${esc(d.RaporNo)}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: A4; margin: 0; }
    body { margin: 0; background: #dfe3e8; color: #111; font-family: Arial, Helvetica, sans-serif; }
    .printbar { position: sticky; top: 0; z-index: 5; display: flex; justify-content: flex-end; gap: 8px; padding: 10px calc((100% - 210mm) / 2); background: rgba(255,255,255,.9); border-bottom: 1px solid #c9cdd3; }
    .btn { border: 1px solid #111; background: #fff; padding: 6px 13px; font-size: 12px; font-weight: 700; cursor: pointer; }
    .page { width: 210mm; height: 297mm; margin: 14px auto; background: #fff; position: relative; padding: 58mm 5.4mm 13mm; overflow: hidden; box-shadow: 0 8px 28px rgba(0,0,0,.16); }
    .page.second { padding-top: 44mm; }
    .headerArt { position: absolute; left: 5.4mm; right: 5.4mm; top: 8mm; height: 40mm; }
    .brandLogo { position: absolute; left: 0; top: 4mm; width: 86mm; max-height: 25mm; object-fit: contain; object-position: left top; }
    .topLine { position: absolute; left: 0; right: 0; top: 0; width: 100%; height: 1.5mm; object-fit: fill; }
    .akLogo { position: absolute; right: 35mm; top: 1mm; width: 45mm; max-height: 28mm; object-fit: contain; }
    .docCode { position: absolute; top: 39.5mm; right: 10.5mm; width: 21mm; border-collapse: collapse; font-size: 10px; text-align: center; }
    .docCode td { border: 1px solid #111; height: 6.6mm; padding: 1mm; }
    table { border-collapse: collapse; width: 100%; table-layout: fixed; }
    td, th { border: 1px solid #111; vertical-align: top; padding: 1.35mm 2.2mm; }
    .titleRow td { height: 9.5mm; font-size: 13px; }
    .sectionMain { font-size: 13px; line-height: 1.1; }
    .sectionSub, .sub { display: block; color: #777; font-size: 10px; font-style: italic; line-height: 1.1; }
    .info td { font-size: 12px; height: 7.2mm; }
    .info .label { width: 24%; }
    .info .value { width: 76%; font-weight: 500; }
    .explain { margin-top: 10mm; }
    .explain td { font-size: 12px; height: 11mm; }
    .sign { position: absolute; left: 5.4mm; right: 5.4mm; bottom: 45mm; }
    .sign th { font-size: 12px; font-weight: 400; text-align: center; height: 10mm; padding: 1mm; }
    .sign td { height: 23mm; text-align: center; vertical-align: middle; font-size: 11px; }
    .sealImg { width: 21mm; height: 21mm; object-fit: contain; opacity: .88; }
    .signImg { display: block; max-width: 34mm; max-height: 12mm; object-fit: contain; margin: 0 auto 1mm; }
    .foot { position: absolute; left: 5.4mm; right: 5.4mm; bottom: 4mm; }
    .foot td { font-size: 12px; height: 6mm; padding: 1.2mm 3mm; }
    .foot .small td { font-size: 10.5px; }
    .right { text-align: right; }
    .center { text-align: center; }
    .resultsTitle { margin-bottom: 8mm; }
    .resultsTitle td { font-size: 13px; height: 7mm; }
    .results th { background: #1f5a83; color: #111; font-size: 12px; text-align: center; font-weight: 400; padding: 1.2mm 1.4mm; line-height: 1.08; }
    .results th em { display: block; color: #111; font-style: italic; }
    .results td { font-size: 10.5px; text-align: center; padding: 1.4mm; line-height: 1.12; }
    .results td:first-child { text-align: left; }
    .results em { display: block; color: #777; font-style: italic; }
    .notes { margin-top: 3mm; }
    .notes td { height: 42mm; font-size: 9px; line-height: 1.15; padding: 2mm; }
    .notes b { font-size: 10px; }
    .end { text-align: center; font-size: 13px; margin-top: -1px; border: 1px solid #111; padding: 1mm; width: 100%; }
    @media print { body { background: #fff; } .printbar { display: none; } .page { margin: 0; box-shadow: none; page-break-after: always; } .page:last-child { page-break-after: auto; } }
  </style>
</head>
<body>
  <div class="printbar">
    <button class="btn" onclick="window.close()">Kapat</button>
    <button class="btn" onclick="window.print()">Yazdır / PDF</button>
  </div>
  <section class="page">
    <div class="headerArt">
      ${topLine ? `<img class="topLine" src="${topLine}" alt="">` : ""}
      ${brandLogo ? `<img class="brandLogo" src="${brandLogo}" alt="Unique Quality Services">` : ""}
      ${accreditation ? `<img class="akLogo" src="${accreditation}" alt="TURKAK">` : ""}
    </div>
    <table class="docCode"><tr><td>AB-2015-T</td></tr><tr><td>&nbsp;</td></tr><tr><td>${esc(d["MM-YY"])}</td></tr></table>
    <table class="titleRow"><tr><td style="width:46%"><span class="sectionMain">SAMPLE INFORMATION</span><span class="sectionSub">Numune Bilgileri</span></td><td></td></tr></table>
    <table class="info">
      <tr><td class="label">Report No / Rev No:<span class="sub">Rapor No / Rev:</span></td><td class="value">${esc(d.RaporNo)} / ${esc(d.Rev)}</td></tr>
      <tr><td class="label">Sample Acceptance Date:<span class="sub">Numune Kabul Tarihi:</span></td><td class="value">${esc(d.Tarih)}</td></tr>
      <tr><td class="label">Analysis Start / End Date:<span class="sub">Analiz Başlangıç / Bitiş Tarihi:</span></td><td class="value">${esc(d.Tarih)} / ${esc(d.Yayin)}</td></tr>
      <tr><td class="label">Sample Name:<span class="sub">Numune Adı:</span></td><td class="value">${esc(d["NumuneAdi-Eng"])}<span class="sub">${esc(d.NumuneAdi)}</span></td></tr>
      <tr><td class="label">Sample Quantity:<span class="sub">Numune Miktarı:</span></td><td class="value">${esc(d.Miktar)}</td></tr>
      <tr><td class="label">Production Date:<span class="sub">Üretim Tarihi:</span></td><td class="value">${esc(d.Urt)}</td></tr>
      <tr><td class="label">Expiration Date:<span class="sub">Son Kullanım Tarihi:</span></td><td class="value">${esc(d.SKT)}</td></tr>
      <tr><td class="label">Serial / Lot No / Product Code:<span class="sub">Seri / Lot No / Ürün Kodu:</span></td><td class="value">${esc(d.Seri)}</td></tr>
    </table>
    <table class="titleRow" style="margin-top:4mm"><tr><td style="width:49%"><span class="sectionMain">CUSTOMER INFORMATION</span><span class="sectionSub">Müşteri Bilgileri</span></td><td></td></tr></table>
    <table class="info">
      <tr><td class="label">Company Name:<span class="sub">Firma Adı:</span></td><td class="value">${esc(d.FirmaAd)}</td></tr>
      <tr><td class="label">Address:<span class="sub">Adres:</span></td><td class="value">${esc(d.Adres)}</td></tr>
      <tr><td class="label">Contact Person:<span class="sub">İlgili Kişi:</span></td><td class="value">${esc(d.FirmaYetkili)}</td></tr>
      <tr><td class="label">Contact Information:<span class="sub">İletişim Bilgileri:</span></td><td class="value">${esc(d.FirmaMail)}</td></tr>
    </table>
    <table class="explain"><tr><td style="width:23%">Explanation:<span class="sub">Açıklama:</span></td><td>Tests conducted at the customer's request were evaluated according to customer specifications.<span class="sub">Müşteri talebi doğrultusunda yapılan testler müşteri spesifikasyonuna göre değerlendirilmiştir.</span></td></tr></table>
    <table class="sign">
      <tr><th>Seal<span class="sub">Mühür</span></th><th>Sample Acceptance and Reporter<span class="sub">Numune Kabul ve Raportör</span></th><th>Laboratory Manager<span class="sub">Laboratuvar Müdürü</span></th><th>Report Publication<br>Date<span class="sub">Rapor Yayın Tarihi</span></th></tr>
      <tr>
        <td>${seal ? `<img class="sealImg" src="${seal}" alt="Seal">` : ""}</td>
        <td>${reporterSign ? `<img class="signImg" src="${reporterSign}" alt="">` : ""}Büşra ALBAYRAK</td>
        <td>${managerSign ? `<img class="signImg" src="${managerSign}" alt="">` : ""}Alaettin ÖZDEMİR</td>
        <td>${esc(d.Yayin)}</td>
      </tr>
    </table>
    <table class="foot">
      <tr><td>UNIQUE ANALİZ BELGELENDİRME ve GÖZETİM HİZMETLERİ LTD. ŞTİ.</td><td></td><td class="right">www.uqtest.com</td></tr>
      <tr><td>Atatürk Mah. Hadımköy Yolu Cad. No:10 İç Kapı No:7 Esenyurt / İstanbul</td><td></td><td class="right">hello@uqtest.com</td></tr>
      <tr class="small"><td>Ek-1.P</td><td>Yayın Tarihi: 27.09.2023&nbsp;&nbsp; Revizyon Tarih / No:</td><td class="right">Sayfa: 1</td></tr>
    </table>
  </section>
  <section class="page second">
    <div class="headerArt">
      ${topLine ? `<img class="topLine" src="${topLine}" alt="">` : ""}
      ${brandLogo ? `<img class="brandLogo" src="${brandLogo}" alt="Unique Quality Services">` : ""}
      ${accreditation ? `<img class="akLogo" src="${accreditation}" alt="TURKAK">` : ""}
    </div>
    <table class="docCode"><tr><td>${esc(d.RaporNo)}</td></tr><tr><td>&nbsp;</td></tr></table>
    <table class="resultsTitle"><tr><td style="width:37%"><span class="sectionMain">TEST RESULTS</span> <span class="sectionSub" style="display:inline">Test Sonuçları</span></td><td></td></tr></table>
    <table class="results">
      <thead><tr><th style="width:25%">Analysis<em>Analiz</em></th><th style="width:8%">Unit<em>Birim</em></th><th style="width:11%">Result<em>Sonuç</em></th><th style="width:8%">LOQ<em>LOQ</em></th><th style="width:7%">M.U.<em>Ö.B.</em></th><th style="width:15%">Method<em>Metot</em></th><th style="width:11%">Limit<em>Limit</em></th><th style="width:15%">Evaluation<em>Değerlendir</em></th></tr></thead>
      <tbody>${hizmetRows || `<tr><td colspan="8">Hizmet sonucu bulunamadı.</td></tr>`}</tbody>
    </table>
    <table class="notes"><tr><td>
      <b>Notlar:</b><br>
      1. <b>P:</b> Pass, <b>F:</b> Fail, <b>NE:</b> Not Evaluated &nbsp;&nbsp; <em>U: Uygun, UD: Uygun Değil, DY: Değerlendirme Yapılmadı</em><br>
      2. Analyses marked with "**" are within our scope accredited by TÜRKAK according to TS EN ISO/IEC 17025. <em>"**" işaretli analizler TÜRKAK tarafından TS EN ISO/IEC 17025'e göre akredite edilmiş kapsamımızda yer almaktadır.</em><br>
      3. İmzasız ve mühürsüz Analiz Raporları geçersizdir. <em>Analysis Reports without signatures and seals are invalid.</em><br>
      4. Numune alma işlemi tarafımızdan yapılmamıştır. <em>Sample collection was not performed by us.</em><br>
      5. Test sonuçları, yukarıda belirtilen numune için geçerlidir. Numunenin ait olduğu lotu temsil etmeyebilir. <em>Test results are valid for the sample specified above. They may not represent the lot to which the sample belongs.</em><br>
      6. Karar Kuralı: Müşteri, "Ölçüm belirsizliği dahil edilmeden" uygunluk beyanı verilmesini istediğini belirtmiştir. <em>Decision Rule: The customer has stated that they want a declaration of conformity without including measurement uncertainty.</em><br>
      7. Deney raporunda yer alan ve sonuçların geçerliliğini etkileyen tanımsal bilgiler müşteri tarafından beyan edilmiştir. <em>Descriptive information included in the test report that affects the validity of the results has been declared by the customer.</em><br>
      8. UNIQUE Analiz Belgelendirme ve Gözetim Hizmetleri Ltd. Şti.'nin yazılı izni olmadan bu Analiz Raporu kısmen kopyalanamaz, çoğaltılamaz veya herhangi başka amaçla kullanılamaz.
    </td></tr></table>
    <div class="end">End of Report<br><span class="sub">* Rapor Sonu *</span></div>
    <table class="foot">
      <tr><td>UNIQUE ANALİZ BELGELENDİRME ve GÖZETİM HİZMETLERİ LTD. ŞTİ.</td><td></td><td class="right">www.uqtest.com</td></tr>
      <tr><td>Atatürk Mah. Hadımköy Yolu Cad. No:10 İç Kapı No:7 Esenyurt / İstanbul</td><td></td><td class="right">hello@uqtest.com</td></tr>
      <tr class="small"><td>Ek-1.PR.20&nbsp;&nbsp; Yayın Tarihi: 27.09.2023</td><td>Revizyon Tarih / No: 25.11.2024 / 01</td><td class="right">Sayfa 2</td></tr>
    </table>
  </section>
</body>
</html>`;
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
