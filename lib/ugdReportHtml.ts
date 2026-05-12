type IngredientRow = {
  inputName?: string;
  inputAmount?: string;
  INCIName?: string | null;
  Cas?: string | null;
  Ec?: string | null;
  Functions?: string | null;
  Regulation?: string | null;
  YonetmelikNo?: string | null;
  YonetmelikUrunTipi?: string | null;
  Maks?: string | null;
  Diger?: string | null;
  Etiket?: string | null;
  Fizikokimya?: string | null;
  Toksikoloji?: string | null;
  Kaynak?: string | null;
  dap?: number;
  noael?: string;
  matched?: boolean;
};

type UGDReportInput = {
  form: Record<string, unknown>;
  formulResults: IngredientRow[];
  firmaAd: string;
  firmaAdres: string;
  firmaTelefon: string;
  firmaMail: string;
};

const empty = "—";

function text(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const valueText = String(value).trim();
  return valueText || fallback;
}

function esc(value: unknown, fallback = "") {
  return text(value, fallback)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nl2br(value: unknown, fallback = "") {
  return esc(value, fallback).replace(/\r?\n/g, "<br>");
}

function todayTr() {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

function calcSED(a: number, c: number, dap: number) {
  return a * (c / 100) * (dap / 100);
}

function calcMOS(noael: string | undefined, sed: number) {
  const n = parseFloat(text(noael));
  if (!n || !sed) return null;
  return n / sed;
}

function fmtSED(value: number) {
  if (!value) return empty;
  return value < 0.0001 ? value.toExponential(3) : value.toFixed(5);
}

function fmtMOS(value: number | null) {
  if (value === null) return empty;
  return value >= 10000 ? "&gt;10000" : value.toFixed(1);
}

function hasMeaningfulValue(value: unknown) {
  const normalized = text(value).toLocaleLowerCase("tr-TR");
  return !!normalized && !["-", "—", "n/a", "na", "yok", "none"].includes(normalized);
}

function isAnnexII(row: IngredientRow) {
  const regulation = text(row.Regulation).toLocaleLowerCase("tr-TR");
  return /(^|[^a-z0-9])(?:ek|annex)?\s*ii(?:[^a-z0-9]|$)/i.test(regulation);
}

function hasRegulatoryRestriction(row: IngredientRow) {
  return hasMeaningfulValue(row.YonetmelikNo)
    || hasMeaningfulValue(row.Regulation)
    || hasMeaningfulValue(row.Maks)
    || hasMeaningfulValue(row.Diger)
    || hasMeaningfulValue(row.Etiket);
}

function exposureValue(value: unknown, label: string) {
  const line = text(value)
    .split(/\r?\n/)
    .find((item) => item.toLocaleLowerCase("tr-TR").startsWith(label.toLocaleLowerCase("tr-TR")));
  return text(line?.split(":").slice(1).join(":"), empty);
}

function imageBlock(dataUrl: unknown, caption: string) {
  const src = text(dataUrl);
  if (!src.startsWith("data:image/")) return "";
  return `<figure class="image-block"><img src="${esc(src)}" alt="${esc(caption)}"><figcaption>${esc(caption)}</figcaption></figure>`;
}

function infoTable(rows: [string, unknown][]) {
  return `<table class="kv">${rows.map(([label, value]) => `
    <tr>
      <th>${esc(label)}</th>
      <td>${nl2br(value, empty)}</td>
    </tr>`).join("")}
  </table>`;
}

function formulaRows(rows: IngredientRow[], a: number) {
  if (!rows.length) {
    return `<tr><td colspan="12" class="muted">Formül bileşeni girilmedi.</td></tr>`;
  }

  return rows.map((row) => {
    const concentration = parseFloat(text(row.inputAmount, "0").replace(",", ".")) || 0;
    const dap = typeof row.dap === "number" ? row.dap : parseFloat(text(row.dap, "100")) || 100;
    const sed = calcSED(a, concentration, dap);
    const mos = calcMOS(row.noael, sed);
    const ok = mos === null || mos >= 100;

    return `<tr>
      <td>${esc(row.INCIName || row.inputName, empty)}</td>
      <td>${esc(row.Cas, empty)}</td>
      <td>${esc(row.Ec, empty)}</td>
      <td>${esc(row.Functions, empty)}</td>
      <td>${esc(row.Regulation, empty)}</td>
      <td class="num">${esc(row.inputAmount, "0")}</td>
      <td class="num">${a || empty}</td>
      <td class="num">${dap}</td>
      <td class="num">${fmtSED(sed)}</td>
      <td class="num">${esc(row.noael, empty)}</td>
      <td class="num">${fmtMOS(mos)}</td>
      <td class="${ok ? "ok" : "warn"}">${ok ? "UYGUN" : "UYGUN DEĞİL"}</td>
    </tr>`;
  }).join("");
}

function preservativeRows(rows: IngredientRow[]) {
  const filtered = rows.filter((row) => text(row.Regulation).toLocaleLowerCase("tr-TR").includes("v"));
  const source = filtered.length ? filtered : rows;
  if (!source.length) return `<tr><td colspan="7" class="muted">Koruyucu bileşen kaydı yok.</td></tr>`;

  return source.map((row) => {
    const concentration = parseFloat(text(row.inputAmount, "0").replace(",", ".")) || 0;
    const dap = typeof row.dap === "number" ? row.dap : 100;
    const sed = calcSED(269, concentration, dap);
    const mos = calcMOS(row.noael, sed);
    return `<tr>
      <td>${esc(row.INCIName || row.inputName, empty)}</td>
      <td>${esc(row.Cas, empty)}</td>
      <td class="num">${esc(row.inputAmount, "0")}</td>
      <td class="num">269</td>
      <td class="num">${fmtSED(sed)}</td>
      <td class="num">${esc(row.noael, empty)}</td>
      <td class="num">${fmtMOS(mos)}</td>
    </tr>`;
  }).join("");
}

function allergenRows(rows: IngredientRow[], a: number) {
  const filtered = rows.filter((row) => {
    const haystack = `${text(row.Functions)} ${text(row.Regulation)} ${text(row.INCIName)}`.toLocaleLowerCase("tr-TR");
    return haystack.includes("fragrance") || haystack.includes("parfum") || haystack.includes("aroma") || haystack.includes("allergen");
  });
  const source = filtered.length ? filtered : rows;
  if (!source.length) return `<tr><td colspan="8" class="muted">Alerjen bileşen kaydı yok.</td></tr>`;

  return source.map((row) => {
    const concentration = parseFloat(text(row.inputAmount, "0").replace(",", ".")) || 0;
    const dap = typeof row.dap === "number" ? row.dap : 100;
    const sed = calcSED(a, concentration, dap);
    const mos = calcMOS(row.noael, sed);
    return `<tr>
      <td>${esc(row.INCIName || row.inputName, empty)}</td>
      <td>${esc(row.Cas, empty)}</td>
      <td>${esc(row.Ec, empty)}</td>
      <td class="num">${esc(row.inputAmount, "0")}</td>
      <td class="num">${a || empty}</td>
      <td class="num">${fmtSED(sed)}</td>
      <td class="num">${esc(row.noael, empty)}</td>
      <td class="num">${fmtMOS(mos)}</td>
    </tr>`;
  }).join("");
}

function regulationRows(rows: IngredientRow[]) {
  const regulatedRows = rows.filter(hasRegulatoryRestriction);
  if (!regulatedRows.length) return `<tr><td colspan="8" class="muted">Limit, etiket şartı veya yasaklı madde kaydı yok.</td></tr>`;

  return regulatedRows.map((row) => {
    const banned = isAnnexII(row);
    return `<tr${banned ? ' class="danger-row"' : ""}>
      <td>${esc(row.YonetmelikNo || row.Regulation, empty)}</td>
      <td>${esc(row.INCIName || row.inputName, empty)}</td>
      <td>${esc(row.YonetmelikUrunTipi, empty)}</td>
      <td>${esc(row.Maks, empty)}</td>
      <td>${esc(row.Diger, empty)}</td>
      <td>${esc(row.Etiket, empty)}</td>
      <td class="num">${esc(row.inputAmount, "0")}</td>
      <td class="${banned ? "warn" : "ok"}">${banned ? "UYGUN DEĞİL" : "UYGUN"}</td>
    </tr>`;
  }).join("");
}

function ingredientProfiles(rows: IngredientRow[]) {
  if (!rows.length) return `<p class="muted">Bileşen profili kaydı yok.</p>`;

  return rows.map((row) => `<section class="ingredient-profile">
    <h3>${esc(row.INCIName || row.inputName, empty)}</h3>
    ${infoTable([
      ["Fizikokimyasal Özellikler", row.Fizikokimya],
      ["Toksikolojik Özellikler", row.Toksikoloji],
      ["Kaynak", row.Kaynak],
    ])}
  </section>`).join("");
}

export function renderUgdReportHtml(input: UGDReportInput) {
  const { form: f, formulResults, firmaAd, firmaAdres, firmaTelefon, firmaMail } = input;
  const a = parseFloat(text(f.A, "0").replace(",", ".")) || 0;
  const maruziyet = text(f.MaruziyetAciklama);
  const title = `UGD_Rapor_${text(f.RaporNo, "rapor")}`;
  const reportHeader = `
    <div class="report-header">
      <div>
        <div class="report-header-title">KOZMETİK ÜRÜN GÜVENLİLİK DEĞERLENDİRMESİ</div>
        <div class="report-header-subtitle">(EC) No 1223/2009 Kozmetik Regülasyonu ve 23 Mayıs 2005 tarihli, 25823 sayılı Kozmetik Yönetmeliği uyarınca hazırlanmıştır.</div>
      </div>
      <div class="report-header-meta">
        <span>Form / Versiyon No:</span>
        <strong>${esc(f.RaporNo, empty)} / ${esc(f.Versiyon, empty)}</strong>
      </div>
    </div>`;
  const screenHeader = `<div class="screen-page-header">${reportHeader}</div>`;

  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <title>${esc(title)}</title>
  <style>
    @page WordSection1 { size: A4; margin: 25mm 14mm 18mm 14mm; mso-header: ugdWordHeader; }
    @page { size: A4; margin: 20mm 14mm 18mm 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-family: Microsoft Sans Serif, Tahoma, sans-serif; font-size: 9.5pt; line-height: 1.48; }
    .WordSection1 { page: WordSection1; }
    .pdf-header { display: none; position: fixed; left: 0; right: 0; height: 20mm; z-index: 10; mso-hide: all; }
    .screen-page-header { display: none; }
    .report-header { width: 100%; border-bottom: 1px solid #1f4788; padding-bottom: 5px; display: table; table-layout: fixed; color: #143b6f; }
    .report-header > div { display: table-cell; vertical-align: top; }
    .report-header-title { font-size: 9.5pt; font-weight: 700; }
    .report-header-subtitle { margin-top: 2px; color: #000000; font-size: 7.4pt; line-height: 1.25; }
    .report-header-meta { width: 38mm; text-align: right; font-size: 7.5pt; color: #000000; }
    .report-header-meta strong { display: block; margin-top: 2px; color: #111827; font-size: 8.5pt; }
    h1, h2, h3 { margin: 0 0 8px; color: #000000; line-height: 1.2; }
    h1 { font-size: 25pt; text-align: center; letter-spacing: .04em; }
    h2 { margin-top: 5px; padding-bottom: 5px; border-bottom: 2px solid #000000; font-size: 14.5pt; page-break-after: avoid; }
    h3 { margin-top: 12px; font-size: 9.5pt; color: #ffffff; padding:5px; background-color: #003366; page-break-after: avoid; }
    p { margin: 0 0 8px; }
    .cover { min-height: 230mm; display: flex; flex-direction: column; justify-content: center; text-align: center; page-break-after: always; }
    .cover .rule { width: 120px; height: 3px; margin: 22px auto; background: #1f4788; }
    .cover .product { margin-top: 16px; font-size: 17pt; font-weight: 700; }
    .cover .company { margin-top: 6px; font-size: 13pt; }
    .cover .basis { max-width: 165mm; margin: 28px auto 0; color: #4b5563; font-size: 10pt; }
    .toc { page-break-after: always; }
    .toc p { margin: 2px 0; }
    .part-title { padding: 9px 12px; margin-top: 16px; background: #eef4fb; border-left: 5px solid #1f4788; font-weight: 700; color: #143b6f; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; page-break-inside: auto; }
    tr { page-break-inside: avoid; page-break-after: auto; }
    th, td { border: 1px solid #cfd8e3; padding: 5px 6px; vertical-align: top; }
    th { background: #dedede; color: #000000; font-weight: 700; text-align: left; }
    .kv th { width: 40%; }
    .compact { font-size: 8.2pt; }
    .compact th, .compact td { padding: 4px; }
    .num { text-align: right; white-space: nowrap; }
    .ok { color: #166534; font-weight: 700; text-align: center; }
    .warn { color: #b91c1c; font-weight: 700; text-align: center; }
    .danger-row td { background: #fee2e2; border-color: #ef4444; }
    .muted { color: #6b7280; font-style: italic; }
    .note { margin: 10px 0; padding: 9px 11px; background: #f8fafc; border-left: 4px solid #94a3b8; }
    .page-break { page-break-before: always; }
    .image-block { margin: 10px 0; page-break-inside: avoid; }
    .image-block img { max-width: 100%; max-height: 95mm; display: block; border: 1px solid #d1d5db; }
    .image-block figcaption { margin-top: 4px; color: #6b7280; font-size: 8.5pt; }
    .signature { height: 34mm; border-bottom: 1px solid #111827; width: 70mm; margin-top: 16px; }
    .print-actions { position: fixed; top: 12px; right: 12px; z-index: 20; }
    .print-actions button { padding: 8px 12px; border: 1px solid #1f4788; border-radius: 6px; background: #1f4788; color: white; font-weight: 700; cursor: pointer; }
    @media screen {
      body { background: #e5e7eb; padding: 24px 0; }
      .WordSection1 { width: 100%; }
      .WordSection1 > section { position: relative; width: 210mm; min-height: 297mm; margin: 0 auto 18px; padding: 32mm 14mm 18mm; background: #fff; box-shadow: 0 12px 32px rgba(15, 23, 42, .18); }
      .screen-page-header { display: block; position: absolute; top: 8mm; left: 14mm; right: 14mm; }
      .print-actions { top: 20px; right: 24px; }
    }
    @media print {
      .print-actions, .screen-page-header { display: none; }
      .pdf-header { display: none; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="print-actions"><button onclick="window.print()">Yazdır / PDF</button></div>
  <div class="pdf-header">${reportHeader}</div>
  <!--[if gte mso 9]><div style="mso-element:header" id="ugdWordHeader">${reportHeader}</div><![endif]-->

  <div class="WordSection1">
  <section class="cover">
    ${screenHeader}
    <h1>KOZMETİK ÜRÜN GÜVENLİLİK<br>DEĞERLENDİRMESİ</h1>
    <div class="rule"></div>
    <div class="product">${esc(f.Urun, empty)}</div>
    <div class="company">${esc(firmaAd, empty)}</div>
    <p class="basis" style="border: 1px solid #add8e6; 
    width: 500px; 
    margin-bottom: 2px; 
    padding: 15px; 
    text-align: center; 
    line-height: 1.5;
    word-wrap: break-word;">(EC) No 1223/2009 Kozmetik Regülasyonu, 23 Mayıs 2005 tarihli 25823 Resmi Gazete sayılı Kozmetik Yönetmeliği ve ekleri,</p>
    <p class="basis" style="border: 1px solid #add8e6; 
    width: 500px; 
    margin-bottom: 2px; 
    padding: 15px; 
    text-align: center; 
    line-height: 1.5;
    word-wrap: break-word;">The SCCS's Notes of Guidance For The Testing of Cosmetics Ingerients and Their Safety Evaluation 12th Revision,</p>
    <p class="basis" style="border: 1px solid #add8e6; 
    width: 500px; 
    padding: 15px; 
    text-align: center; 
    line-height: 1.5;
    word-wrap: break-word;">Türkiye İlaç ve Tıbbi Cihaz Kurumu Kozmetik Ürünlerde Güvenlilik Değerlendirmesine İlişkin Kılavuz Sürüm 3.0 uyarınca hazırlanmıştır.</p>
  </section>

  <section class="toc">
    ${screenHeader}
    <h2>İÇİNDEKİLER</h2>
    <div class="part-title">KISIM A - KOZMETİK ÜRÜN GÜVENLİLİK BİLGİLERİ</div>
    <p>A.1. Kozmetik ürünün kantitatif ve kalitatif bileşimi</p>
    <p>A.2. Kozmetik ürünün fiziksel/kimyasal özellikleri ve stabilitesi</p>
    <p>A.3. Mikrobiyolojik kalite</p>
    <p>A.4. Safsızlıklar, kalıntılar, ambalaj materyali hakkında bilgi</p>
    <p>A.5. Normal ve makul olarak öngörülebilir kullanım</p>
    <p>A.6. Kozmetik ürüne maruziyet</p>
    <p>A.7. Formülde yer alan maddelere maruziyet değerlendirmesi</p>
    <p>A.8. Formülde yer alan maddelerin toksikolojik profili</p>
    <p>A.9. İstenmeyen etkiler ve ciddi istenmeyen etkiler</p>
    <p>A.10. Kozmetik ürün bilgisi</p>
    <div class="part-title">KISIM B - KOZMETİK ÜRÜN GÜVENLİLİK DEĞERLENDİRMESİ</div>
    <p>B.1. Değerlendirme sonucu</p>
    <p>B.2. Etikette yer alan uyarılar ve kullanım talimatları</p>
    <p>B.3. Gerekçelendirme</p>
    <p>B.4. Güvenlilik değerlendirme sorumlusu ile ilgili bilgiler ve Kısım B’nin onaylanması</p>
  </section>

  <section>
    ${screenHeader}
    <h2>A. KOZMETİK ÜRÜN GÜVENLİLİK BİLGİSİ</h2>
    <h3>Ürün Hakkında Bilgiler</h3>
    ${infoTable([
      ["Ürün Adı", f.Urun],
      ["Barkodu", f.Barkod],
      ["Nominal Miktar", f.Miktar],
      ["Ürün Tipi", f.Tip1],
      ["Uygulama Yeri", f.Uygulama],
      ["Hedeflenen Kişiler", f.Hedef],
    ])}

     <h3>Tedarikçi / Dağıtıcı Firma</h3>
    ${infoTable([
      ["Tedarikçi / Dağıtıcı Firma", firmaAd],
      ["Adresi", firmaAdres],
      ["Telefon", firmaTelefon],
      ["E-Mail", firmaMail],
    ])}

    <h3>A.1. Kozmetik Ürünün Kalitatif ve Kantitatif Bileşimi</h3>
    <p>Kozmetik ürüne ait kalitatif ve kantitatif özellikler rapor Ek-1 bölümünde detaylı olarak paylaşılmıştır.</p>

    <h3>A.2. Kozmetik Ürünün Fiziksel / Kimyasal Özellikleri ve Stabilitesi</h3>
    <div style="font-weight: bold;">a. Madde veya karışımların fiziksel/kimyasal özellikleri</div>
    <p>Madde veya karışımlara ait fiziksel ve kimyasal özellikler Ek-3 bölümünde detaylı olarak paylaşılmıştır.</p>
    <div style="font-weight: bold;">b. Bitmiş kozmetik ürününün fiziksel ve kimyasal özellikleri</div>
    ${infoTable([
      ["Görünüm", f.Gorunum],
      ["Renk", f.Renk],
      ["Koku", f.Koku],
      ["pH", f.PH ?? f.pH],
      ["Kaynama Noktası", f.Kaynama],
      ["Erime Noktası", f.Erime],
      ["Yoğunluk", f.Yogunluk],
      ["Viskozite", f.Viskozite],
      ["Suda Çözünebilirlik", f.SudaCozunebilirlik],
      ["Diğer Çözünebilirlik", f.DigerCozunebilirlik],
    ])}

    <div style="page-break-after: always;"></div> 

    <div style="font-weight: bold;">c. Kozmetik Ürünün Stabilitesi</div>
    <p>Piyasada satılan bir kozmetik ürün, normal veya öngörülebilir kullanım koşulları altında kullanıldığında insan sağlığı için güvenli olmalıdır. Bitmiş ürün üzerinde stabilite çalışmaları yapılmıştır. Ürünün görünümü, rengi, kokusu, pH ve ağırlık değerleri farklı sıcaklık koşulları altında düzenli aralıklarla kontrol edilir. Stabilite test sonuçları ürün bilgi dosyasına eklenmektedir.</p>
    <p>${nl2br(f.Stabilite)}</p>
    ${imageBlock(f.StabiliteGorsel, "Stabilite görseli")}


<div style="font-weight: bold; margin-bottom: 2px">(1) Stabilite testinde kullanılan ürünün bileşiminin piyasada fiilen bulunan ürünle aynı olduğunun kanıtı</div>
<p>SCCS, kozmetik ürünün türüne ve kullanım amacına göre uyarlanmış ilgili stabilite testlerinin yapılmasını önermiştir. Üretici, stabilite testlerinin şu anda inert kaplarla ve beyan yoluyla piyasada kullanılması amaçlanan kaplarla yapıldığını garanti etmiştir.</p>

<div style="font-weight: bold; margin-bottom: 2px">(2) Koruyucu etkinlik çalışmalarının sonuçları, örneğin; tarama-zorlama testi (challenge test) </div>	
<p>Test, belirli inokulum seviyelerinde uygun mikroorganizmaların hazırlanmasını ve mikroorganizma içeren numunenin belirli zaman aralıklarında aşılanmasıyla numunedeki mikroorganizmaların sayılmasını içerir. Ürünün koruyucu özelliklerinin yeterliliği, test koşulları altında 7, 14 ve 28. günlerde mikroorganizmalarda önemli bir azalma veya artış olup olmadığının belirlenmesiyle belirlenir.

<p>Test sonuçlarına göre, üretici bu ürünün korunmasının etkinliğini challenge testi yaparak deneysel olarak garanti eder.</p>

   <p>${nl2br(f.KoruyucuEtkinlik)}</p>
    ${imageBlock(f.KoruyucuEtkinlikGorsel, "Challenge test görseli")}

<div style="font-weight: bold; margin-bottom: 2px">(3) Uygulanabilir olduğunda, açıldıktan sonra kullanım süresi ve gerekçesi</div>
<p>PAO (Açıldıktan sonraki süre) tahmini, mikrobiyal kontaminasyona karşı direnç, ambalaj türü, kullanım süresi (hacim/doz/sıklık), uygulama alanı ve kozmetik ürüne yönelik popülasyon tipi gibi çeşitli faktörlerin değerlendirilmesiyle yapılır. Bu faktörlerin birlikte değerlendirilmesinden sonra, ürünün PAO'su 12 ay şeklinde tahmin edilebilir.

    <h3>A.3. Mikrobiyolojik Kalite</h3>
    <div style="font-weight: bold;">Maddelerin ve karışımların mikrobiyolojik kalitesi</div>
    <p>Mikrobiyolojik kalite için ana parametreler orijinal kontaminasyon seviyesi ve mikrobiyal büyüme olasılığıdır. Hammaddeler mikrobiyal büyümeye duyarlılığına göre değerlendirilmiştir.
     
<div style="font-weight: bold;">b. Bitmiş kozmetik ürünün mikrobiyolojik kalitesi</div>
<p>Kozmetik ürünlerde kesinlikle bulunmaması gereken mikroorganizmalar Staphylococcus aureus, Pseudomonas aeruginosa, Candida albicans ve Escherichia coli’dir.
<p>Farklı cilt bölgeleri, farklı hassasiyete sahip olabileceğinden kozmetik ürünler için iki ayrı kategori tanımlanmıştır.</p>
   
 <table>  
  <tr>
        <td style="white-space: nowrap;">Kategori 1</td>
        <td>3 Yaş altı çocuklara yönelik ürünler, Göz bölgesine uygulanan ürünler, mukoz membranlara uygulanan ürünler</td>
      </tr>
      <tr>
        <td style="white-space: nowrap;">Kategori 2</td>
        <td>Diğer ürünler</td>
      </tr>
 </table>

<p>Kantitatif / Nicel Limitler:</p>
 <table>  
  <tr>
        <td style="white-space: nowrap;">Kategori 1</td>
        <td style="white-space: nowrap;">Toplam canlı aerobik mezofilik mikroorganizma sayısı (bakteri, maya ve küf) 10^2 cfu/g ya da 10^2 cfu/ml’den fazla olmamalıdır.</td>
      </tr>
      <tr>
        <td style="white-space: nowrap;">Kategori 2</td>
        <td style="white-space: nowrap;">Toplam canlı aerobik mezofilik mikroorganizma sayısı (bakteri, maya ve küf)  10^3 cfu/g ya da 10^3 cfu/ml’den fazla olmamalıdır.</td>
      </tr>
 </table>


  <p>Kalitatif / Nitel Limitler:</p>
   <table>  
  <tr>
        <td style="white-space: nowrap;">Kategori 1</td>
        <td>Staphylococcus aureus, Pseudomonas aeruginosa, Candida albicans ya da Escherichia coli bulunmamalıdır.</td>
      </tr>
      <tr>
        <td style="white-space: nowrap;">Kategori 2</td>
        <td>Toplam canlı aerobik mezofilik mikroorganizma sayısı (bakteri, maya ve küf) 10^3 cfu/g ya da 10^3 cfu/ml’den fazla olmamalıdır.</td>
      </tr>
 </table>



<p>İyi İmalat Uygulamalarına ve Mikrobiyolojik Kalite Yönetimine uyarak cihaz ve malzemelerin temiz, ürünlerin patolojik mikroorganizmasız olmasını sağlamalı, özel temizleme, sanitasyon ve kontrol prosedürlerini tanımlayarak takip edilmektedir.
<p>Son ürün için yapılan mikrobiyolojik analiz sonuçları ürün güvenlik dosyasında sunulmuştur. Sonuçlar mikrobiyolojik kalite kontrol limitlerine uygundur. Mikrobiyolojik kontaminasyon riski taşımamaktadır. Mikrobiyolojik olarak ürün kategori 2’dedir. </p>

<p>${nl2br(f.Mikrobiyoloji)}</p>
    ${imageBlock(f.MikrobiyolojiGorsel, "Mikrobiyoloji görseli")}

    <h3>A.4. Safsızlıklar, Kalıntılar, Ambalaj Materyali Bilgisi</h3>
    
<div style="font-weight: bold;">a. Maddeler ve karışımların saflığı </div>
<p>Tüm ham maddeler güvenlik ve yönetmeliğe uygunluk açısından değerlendirildi.</p>
<p>Safsızlıklar hammaddelerdeki istenmeyen maddelerdir. Bir eser, bitmiş üründeki istenmeyen bir maddenin küçük bir miktarıdır. Safsızlıklar ve izler, bitmiş ürünün güvenliği açısından değerlendirilmelidir.</p>
<p>İstenmeyen maddeler aşağıdaki kaynaklardan kaynaklanabilir: ham maddelerdeki/maddelerdeki safsızlıklar; üretim süreci; normal depolama koşulları altında ve/veya ambalaj malzemesiyle temas yoluyla meydana gelebilecek üründeki maddelerin potansiyel kimyasal evrimi/etkileşimi ve/veya göçü.</p>

<div style="font-weight: bold;">b. Yasaklı madde kalıntılarının teknik olarak kaçınılmazlığının kanıtı</div>
<p>Kozmetik ürün İyi Üretim Uygulamaları (GMP) uyarınca üretilmiştir. Ayrıca, ürünün teknik verileri değerlendirilmiş ve ağır metallerin teknik olarak kaçınılmaz olduğu düşünülmüştür. Üreticinin verilerine göre, üretilen ürün (EC) No 1223/2009 Yönetmeliğine uygundur. Formülasyondaki bileşenler, bitmiş kozmetik üründe istenmeyen safsızlıklara neden olabilecek herhangi bir potansiyel etkileşimi göstermemektedir.

<div style="font-weight: bold;">c. Ambalaj materyalinin ilgili özellikleri</div>
<p<>Ürün ve ambalajı arasındaki olası istenmeyen etkileşimler değerlendirilmiştir. 
<p>Olası etkileşimler değerlendirilmiş ve sonuçlar ambalajın ürünle uyumlu olduğunu göstermektedir.</p5>
<p>Ambalaj malzemesinin ilgili özellikleri dikkate alınmalıdır, çünkü ambalajdan formülasyona madde göçü meydana gelebilir. Ambalaj malzemesi ve nominal miktar hakkında bilgi Ürün Bilgi Dosyasında verilmiştir.


    <h3>A.5. Normal ve Makul Olarak Öngörülebilir Kullanım</h3>
    ${infoTable([
      ["Kullanım", f.Kullanim],
      ["Uyarılar", f.Uyarilar],
    ])}
    ${imageBlock(f.EtiketGorsel, "Etiket / ambalaj görseli")}

    <h3>A.6. Kozmetik Ürüne Maruziyet</h3>
    ${infoTable([
      ["Ürün Tipi", f.Tip1],
      ["Uygulama Yeri", f.Uygulama],
      ["Uygulanan ürünün deriye temas ettiği alan (cm²)", exposureValue(maruziyet, "Uygulanan ürünün deriye temas ettiği alan")],
      ["Uygulanan ürünün miktarı (g)", exposureValue(maruziyet, "Uygulanan ürünün miktarı")],
      ["Temas süresi ve uygulama sıklığı", exposureValue(maruziyet, "Temas süresi ve uygulama sıklığı")],
      ["Normal ve makul öngörülebilir maruziyet yolları", "Dermal emilim"],
      ["Hedeflenen veya maruz kalan kişi / kişiler", f.Hedef],
      ["A Değeri", f.A],
    ])}

    <p>A değeri için (toplam günlük maruziyet) (yetişkin vücut ağırlığı: 60 kg) (‘The SCCS's Notes Of Guidance For The Testing Of Cosmetic Ingredients And Their Safety Evaluation 12th Revision SCCS/1647/22)’ baz alınmıştır.)</p>

    <h3>A.7. Formülde Yer Alan Maddelere Maruziyet</h3>

    <p><strong>SED:</strong> Sistemik maruziyet dozu. Kan dolaşımına geçmesi beklenen kozmetik bileşeninin miktarıdır. Birimi mg/kg vücut ağırlığı/gün cinsinden ifade edilir.</p>

    <p>Eldeki veriler ışığında SED iki yöntemle hesaplanabilir. Burada tercih edilen metot uygulanan ürünün % olarak dermal emilim miktarı üzerinden yapılan hesaplamadır.</p>

    <div class="note">SED = A (mg/kg x Vücut Ağırlığı/Gün) x C (%) / 100 x DAP (%) / 100</div>

${infoTable([
      ["SED (mg/kg vücut ağırlığı/gün):", "Sistemik maruziyet dozu"],
      ["A (mg/kg vücut ağırlığı/gün):", "Vücut ağırlığının kg’ı başına uygulanan ürün miktarı ile uygulama sıklığına bağlı olarak bir kozmetik ürüne günlük maruziyet"],
      ["C (%):", "Maruziyeti hesaplanacak olan maddenin bitmiş ürün içerisindeki yüzde konsantrasyonu."],
      ["Dap (%):", "Ürünün dermal emilim yüzdesi\n(kullanım koşulları taklit edilerek yapılan deney sonucunda elde edilmekte olup bilinmiyor ise ürünün %100 emiliminin olduğu kabul edilir.)"],
      ["Günlük maruziyet miktarı için hesaplanan A değeri:", f.A],
      ["Koruyucular için kullanılan A değeri:", "269,00 mg/kg vücut ağırlığı/gün"]
    ])}

<p>İlgili ürüne ait hesaplanmış SED değerleri Ek-1 Tablo-1'de belirtilmiştir.</p>

    <h3>A.8. Formülde Yer Alan Maddelerin Toksikolojik Profili</h3>

<div style="font-weight: bold">a. Güvenlilik değerlendirmesinin bir parçası olarak toksikolojik profili ilgilendiren genel hususlar</div>
<p>Formülde yer alan hammaddeler ve karışımlar ticari adlarına göre gruplandırılarak toksikolojik değerlendirmeleri yapılmıştır. Hammadde ve karışımların fiziksel özellikleri ve toksikolojik profilleri Ek-3'te verilmiştir.

<div style="font-weight: bold">b. Tüm ilgili toksikolojik bitiş noktaları için maddelerin toksikolojik profilleri</div>
<div style="font-weight: bold">Güvenlilik Sınırının (MoS) Hesaplanması:</div>
<p>Bütün belirgin emilim yolları dikkate alınarak ve deneyler sonucu gözlemlenen toksikolojik veriler ışığında belirlenen NO(A)EL değerine dayanarak, sistemik etkiler ve güvenlilik sınırı (MoS) hesaplanır. Bu değerlendirme yapılamıyor ise nedeni uygun bir şekilde gerekçelendirilmelidir.</p>

 <div class="note">MoS = NO(A)EL / SED ≥ 100</div>

${infoTable([
      ["MoS", "Ürün bileşeninin güvenlilik sınırıdır."],
      ["NO(A)EL", "Sıçan, fare, tavşan veya köpeklerde yapılan 28 gün, 90 gün gibi uzun süreli tekrarlanan doz kronik toksisite, karsinojenisite, teratojenisite test çalışmalarının sonuçlarıdır. İstenmeyen etkinin gözlenmediği maddenin en yüksek uygulama miktarıdır. Tedavi veya uygulamaya bağlı olarak hiç istenmeyen etki görülmeyen en yüksek doz veya maruz kalınan madde miktarı birimi mg/kg vücut ağırlığı/gün cinsinden ifade edilir."],
      ["SED", "Sistemik maruz kalınma dozu. Kan dolaşımına geçmesi beklenen miktardır. Birimi mg/kg vücut ağırlığı/gün cinsinden ifade edilir."],
    ])}

<p>İlgili ürüne ait hesaplanmış MoS değerleri Ek-1 Tablo-1'de belirtilmiştir.</p>

<div style="font-weight: bold">c. Bütün belirgin absorbsiyon yollarının değerlendirilmesi</div>

<p>Ürün formülasyonunda bulunan hammaddelerin Kozmetik Yönetmeliği eklerine uygunluk kontrolüne ilişkin veriler Ek-2'de sunulmaktadır.
<p>EK II: KOZMETİK ÜRÜNLERDE YASAKLANAN MADDELERİN LİSTESİ
<p>EK III: KOZMETİK ÜRÜNLERİN İÇERMEMESİ GEREKEN MADDELERİN LİSTESİ, BELİRTİLEN KISITLAMALAR HARİÇ
<p>EK IV: KOZMETİK ÜRÜNLERDE İZİN VERİLEN RENKLENDİRİCİLERİN LİSTESİ
<p>EK V: KOZMETİK ÜRÜNLERDE İZİN VERİLEN KORUYUCULARIN LİSTESİ
<p>EK VI: KOZMETİK ÜRÜNLERDE İZİN VERİLEN UV FİLTRELERİN LİSTESİ

    <h3>A.9. İstenmeyen Etkiler ve Ciddi İstenmeyen Etkiler</h3>
   <p>Ürünün piyasaya arzı sonrası kullanımında üründen kaynaklanan istenmeyen etkileri toplayacak, belgelendirecek, nedensellik kuracak ve yönetecek bir sistem kurulmalı ve ciddi istenmeyen etkiler olduğunda, “Türkiye İlaç Ve Tıbbi Cihaz Kurumu Üretici Tarafından Ciddi İstenmeyen Etkinin (CİE) Kuruma Bildirilmesine İlişkin Kılavuz” gereğince Kurum bilgilendirilmelidir.
   <p>Kozmetik ürün/ürünler ile ilgili istenmeyen etkiler ve ciddi istenmeyen etkiler hakkındaki tüm veriler erişilebilir olmalıdır. İstatistiki veriler de dahil olmak üzere tüm istenmeyen ve ciddi istenmeyen etkilere dair bilgilerin ürün bilgi dosyasında bulunması zorunludur.
   <p>Üretici tarafından istenmeyen etki ve ciddi istenmeyen etki bildirilmemiştir.

    <h3>A.10. Kozmetik Ürün Bilgisi</h3>

  
  <p>Güvenlik değerlendirme raporuna ve toksikolojik profil hesaplamalarına göre ürünün satışında herhangi bir engel bulunmamaktadır. </p>
  <p>İspatlanması gereken bir iddia bulunmamaktadır ve ürün hakkında destekleyici bir güvenlik verisi bulunmamaktadır. </p>
  <p>Etiket, ürün bileşimi, GMP Sertifikası, Test sonuçları (Stabilite Testi, Challenge ve Mikrobiyolojik Test), Hammaddelere ait Güvenlik Bilgi Formları, Ambalajlama Materyaline ait bilgiler, Üretim yöntemi ve Bitmiş ürüne ait Güvenlik Bilgi Formu gibi ek belgeler ürün bilgi dosyasında bulunmaktadır. </p>

  
  
    </section>

  <section class="page-break">
    ${screenHeader}
    <h2>KISIM B. KOZMETİK ÜRÜN GÜVENLİLİK DEĞERLENDİRMESİ</h2>
    <h3>B.1. Değerlendirme Sonucu</h3>   
   <p>Kozmetik Yönetmeliğinin 6’ncı maddesi gereğince piyasaya arz edilen bir kozmetik ürün, normal ve üretici tarafından öngörülebilen şartlar altında uygulandığında veya ürünün sunumu, etiketlenmesi, kullanımına dair açıklamalara veya üretici tarafından sağlanan bilgiler dikkate alınarak önerilen kullanım şartlarına göre uygulandığında, insan sağlığı açısından güvenli olmalıdır.</p>
   <p>İşbu rapor; ürün bileşenlerinin toksikolojik karakteri, kimyasal yapısı ve maruz kalma seviyeleri, ürünün kullanımına sunulduğu hedef kitlenin veya ürünün uygulanacağı bölgenin belirgin maruziyet özellikleri göz önünde bulundurularak Kozmetik Yönetmeliği’nin 12 nci maddesi gereğince kozmetik bitmiş ürüne hazırlanmıştır.</p>
   <p>Bütün kaynaklardan elde edilen mevcut veriler değerlendirilerek kozmetik ürün güvenlilik raporu hazırlanmıştır. Formülasyonda yer alan her bir maddenin, karışımın ve bitmiş ürünün öngörülen kullanım koşulları altında güvenlilik değerlendirilmesi yapılmıştır.</p>
   <p>Değerlendirilen kozmetik ürün düzenli kullanım için uygun olup, harici kullanım içindir.</p>
   <p>Hammaddeden başlayarak bitmiş kozmetik ürünün eksiksiz olarak kalitatif ve kantitatif bileşimi açıklanmış, her bir hammaddenin ismi kimliği (kalitatif) ve miktarını belirten ağırlık yüzdelerinin yer aldığı tüm ürün bileşimi değerlendirilmiştir.</p>
   <p>Bitmiş ürüne ait fizikokimyasal spesifikasyonları değerlendirilmiştir.</p>
   <p>Hızlandırılmış ve uzun süreli stabilite testleri kozmetik ürünün bileşimi, formülasyonu, ambalaj şekli, kullanım şekli gibi ürüne özel kriterler göz önüne alınarak belirlenen farklı sıcaklıklarda, depolama ve dağıtım için önerilen son ambalaj ve kap/kapak sistemindeki ambalajlı kozmetik ürün üzerinden fiziksel, kimyasal ve ambalaj uyumu testleri gerçekleştirilmiştir.</p>
   <p>${nl2br(f.Stabilite)}</p>
   <p>Normal koşullar altında depolanan kozmetik ürünün belirtilen minimum dayanma süresinin ve bitmiş ürünün açıldıktan sonra kullanım süresinin doğrulanması güvenlilik açısından önemlidir.</p>
   <p>Ürün formülasyonu ve stabilite test sonuçlarına göre; ambalaj materyali ürünün saflığı ve stabilitesi üzerine olumsuz etki yapmamaktadır.</p>
   <p>Ürün, yasaklı madde kalıntısı içermemektedir. Safsızlıklar ve kalıntılar hakkında bilgi bulunmamaktadır.</p>
   <p>Bitmiş ürün iç ve dış ambalajı değerlendirilmiştir. İç ve dış ambalajda üreticinin, adı veya unvanı ve adresi, ürünün fonksiyonu, ağırlık veya hacim olarak ambalajlama anındaki nominal miktar, açıldıktan sonraki kullanım süresi, kullanma talimatı ve tedbirler, üretim kodu veya üretim şarj numarası, ürün bileşenleri, vb. bilgiler yer almaktadır. Ürün bileşenleri listesinde yer alan bütün hammaddeler INCI isimleri ile ve % konsantrasyona göre büyükten küçüğe olacak şekilde sıra ile yazılmıştır. Etiketin mevzuata uygun olduğu görülmüştür.</p>
   <p>Dermal, oral ve inhaler maruziyet yolu insanların kozmetik ürünlere ilişkin potansiyel maruziyet yollarıdır. Değerlendirilen kozmetik ürün için dermal maruziyet söz konusudur.</p>
   <p>Kozmetik üründeki maddelerin her birine maruziyet, bitmiş ürüne maruziyetten ve bitmiş üründeki maddelerin tek tek konsantrasyonlarından hesaplanmıştır.</p>
   <p>Hammaddelerin üst limitteki kullanım oranı alınarak ve % 100 absorbe olduğu kabul edilerek olası en kötü durumdaki güvenlik aralığı hesaplanmıştır.</p>
   <p>Ürün; Kozmetik Yönetmeliğinde Değişiklik Yapılmasına Dair Yönetmelik / EK II ‐Kozmetik Ürünlerde Yasaklı Maddeler Listesi yer alan yasaklı maddeler listesindeki maddeleri içermemektedir.</p>
   <p>Ürünün, kullanım yeri, kullanım amacı ve miktarına göre normal ve makul olarak öngörülebilir kullanımı uygundur.</p>
   <p>Bu rapor mevcut veriler doğrultusunda hazırlanmıştır.</p>
   <p>Normal şartlar altında ürünün, kullanım yeri, kullanım amacı ve miktarına göre normal ve makul olarak öngörülebilir kullanımı uygundur.</p>
   <p>Üründe veya mevzuatta değişiklikler gerçekleştiğinde (örneğin; üreticinin yaptığı değişiklikler, mevzuatta formülasyonda yer alan maddelerden birine getirilen kısıtlama, formülasyon veya ambalaj gereklilikleri gibi hususlarda) mevzuata uygunluğu kontrol edilmeli, güvenlilik değerlendirmesi yeniden gözden geçirilmeli ve gerekliyse güncellenmelidir.</p>
   <p>Aşağıdaki şartlardan bir veya daha fazlası söz konusu ise, güvenlilik değerlendirmesi yeniden gözden geçirilmeli ve gerekliyse güncellenmelidir:</p>
   
   
   <table>  
  <tr>
        <td style="white-space: nowrap;">a.</td>
        <td>Maddeler hakkında, var olan güvenlilik değerlendirmesinin sonucunu değiştirebilecek, yeni bilimsel bulgular ve toksikolojik veriler erişilebilir durumda ise,</td>
      </tr>
      <tr>
        <td style="white-space: nowrap;">b.</td>
        <td>Hammaddelerin formülasyonunda veya spesifikasyonlarında değişiklik olmuş ise,</td>
      </tr>
      <tr>
        <td style="white-space: nowrap;">c.</td>
        <td>Kullanım koşullarında değişiklikler olmuş ise,</td>
      </tr>
      <tr>
        <td style="white-space: nowrap;">d.</td>
        <td>Hem makul öngörülebilir kullanım şartları altında, hem de kötüye kullanma durumunda istenmeyen etkilerin yapısı, şiddeti ve sıklığı açısından artan eğilim mevcut ise.</td>
      </tr>
 </table>
    <p>Ürünün piyasaya sürülmesini takiben ortaya çıkan ilgili ilave bilgiler ışığında; ürünün formülünde, hammadde temin edilen kaynaklarda veya önerilen kullanım şeklinde yapılacak herhangi bir değişiklikte güvenlilik değerlendirme raporunun güncel tutulması gerekmektedir.</p>
    <p>Ürün güvenlik değerlendirmesi tarafımca hazırlanmış olup başkalarına devredilemez.</p>
   
    <h3>B.2. Etikette Verilen Uyarılar ve Kullanma Talimatları</h3>
    <p>Ürün üzerinde yer alan kullanım ve uyarılar bölümüne A.5. maddesinde değinilmiştir. Ürüne ait görseller ürün güvenlik dosyasında da paylaşılmıştır.</p>
    <h3>B.3. Gerekçelendirme</h3>
    <p>Bu Ürün Bilgi Dosyasında yer alan aşağıdaki kriterlere ilişkin belgeler incelenmiş ve söz konusu ürünün güvenlik değerlendirmesi sonucuna varılması için dikkate alınmıştır:</p>

<p>Kozmetik ürünün niceliksel ve niteliksel bileşimi</p>

<p>Ürünün niteliksel ve niceliksel bileşimi, kozmetik formülündeki bileşenlerin tanımlanması ve işlevi değerlendirilmiştir.</p>

<p>- Kozmetik ürünün fiziksel/kimyasal özellikleri ve stabilitesi</p>

<p>Her bir hammadde için nihai ürün özellikleri ve tedarikçinin özellikleri incelenmiştir. Stabilite, üretici tarafından sağlanan kararlılık test raporuna göre değerlendirilir. Stabilite çalışmaları, ürünün test koşulları altında kararlı kaldığını göstermektedir. Etikette, açıldıktan sonra geçen sürenin 12 ay olduğu belirtilmektedir.</p>

<p>- Mikrobiyolojik kalite</p>

<p>Bu ürün Kategori 2'ye göre değerlendirilmelidir. Ürün mikrobiyolojik açıdan kararlıdır.</p>

<p>Üretici, challenge testi sonuçlarına göre, challenge testi yaparak bu ürünün korunmasının etkinliğini deneysel olarak garanti eder.</p>

<p>- Safsızlıklar, izler, ambalaj malzemesi hakkında bilgi</p>

<p>Tüm hammaddeler güvenlik ve yönetmeliğe uygunluk açısından değerlendirildi.</p>

<p>İçeriklerde bulunan safsızlıklar belirlenen sınırlar içindedir ve toksikolojik olarak önemli kabul edilmemektedir.</p>

<p>- Kozmetik ürüne maruz kalma</p>

<p>Tüm içerikler etikete INCI adlarıyla ve yüzdelerine göre azalan sırayla yazılmalıdır.</p>

<p>Bitmiş ürüne maruz kalma, SCCS'nin kozmetik maddelerin test edilmesine ve güvenlik değerlendirmesine ilişkin kılavuz notlarının önerilerine uygun olarak belirlenmiştir.</p>

<p>- Maddelere maruz kalma</p>

<p>Kozmetik üründeki her bir maddeye maruz kalma, son ürüne maruz kalma ve son üründeki bireysel maddelerin</p>

<p>konsantrasyonundan hesaplanır. Her bir maddeden kaynaklanan potansiyel riski değerlendirmek için bu maruz</p>

<p>kalmayı hesaplamak gerekir.</p>

<p>Tek tek maddelere maruz kalma, ürünün kantitatif bileşiminden hesaplanır. Ürünün kullanımı sırasında maddeler</p>

<p>üretildiğinde veya salındığında, maruziyet tahmin edilir ve güvenlik değerlendirmesinde dikkate alınır. Hesaplamalar</p>

<p>aşağıdaki formül kullanılarak yapılmıştır:</p>

<p>Uygulanan madde miktarının yüzdesi olarak bildirilen dermal emilim</p>

<p>SED = A(mg/kg vücut ağırlığı/gün) X C(%) / 100 X DA p (%) / 100</p>

<p>Gerekli hesaplamalar yapılarak, bitmiş ürüne günlük 0,90 mg/kg/günlük tahmini bir maruziyet elde edilmiştir.</p>

<p>Kesin verilerin bulunmaması durumunda, dermal emilim, SCCS 10. Kılavuzun 28. sayfasında önerilen kriterlere göre</p>

<p>belirlenmiştir; buna göre %50'lik bir emilim seviyesi varsayılmalıdır. Sadece moleküler ağırlığın > 500 Da, Log Pow ≤ - 1 veya ≥4 ve erime noktasının > 200°C olduğu durumlarda %10'luk bir dermal emilim seviyesi varsayılmıştır.</p>

<p>- Maddelerin Toksikolojik Profili</p>

<p>Ürün formülünde bulunan bileşenlerin toksikolojik verileri, ham maddelerin tedarikçileri tarafından sağlanan bilgilerden, uzman literatüründe yayınlanan verilerden ve SCCS (Tüketici Güvenliği Bilimsel Komitesi), CIR (Kozmetik Bileşenler İncelemesi), OECD (Ekonomik İşbirliği ve Kalkınma Örgütü), IUCLID (Uluslararası Tekdüze Kimyasal Bilgi Veritabanı), FDA (Gıda ve İlaç Dairesi), ABD EPA (ABD Çevre Koruma Ajansı), EFSA (Avrupa Gıda Güvenliği Otoritesi) ve ECHA (Avrupa Kimyasallar Ajansı) gibi farklı ürünlerin güvenliğini değerlendirmekten sorumlu çeşitli uluslararası kuruluşlar tarafından yayınlanan raporlardan elde edilen verilerden alınmıştır.</p>

<p>Güvenlik marjları (MoS) aşağıdaki formül kullanılarak hesaplanmıştır:</p>

<div class="note">MoS = NO(A)EL / SED ≥ 100</div>

<p>Toksikolojik verilerin mevcut olduğu bileşenler için hesaplanan güvenlik marjı, güvenlik faktörünün kabul edilebilir olduğunu buldu (MoS > 100). NOAEL'in geleneksel yöntemin güvenlik marjını hesaplamayı imkansız hale getirmediği bileşenler durumunda, kullanılan konsantrasyonlarda maddelerin düşük toksisiteleri ve uzun bir güvenli kullanım geçmişi nedeniyle bir tehdit oluşturmadığı sonucuna varılabilir. Bu bileşenler insanlar için bir tehlike oluşturmaz ve nihai kozmetik ürünün güvenliğini olumsuz yönde etkilemez. Bu ürünü üretmek için kullanılan hammaddeler, kozmetik, ilaç ve gıda ürünlerinde uzun süreli kullanım geçmişleri göz önüne alındığında herhangi bir sağlık riski oluşturmaz. Mevcut toksikolojik verilere ve hesaplanan güvenlik marjlarına dayanarak, kozmetik formülünde bulunan hammaddeler, kullanılan konsantrasyonlarda ve amaçlanan kullanımda sistemik bir toksisite riski oluşturmaz. Bitmiş ürünün gözlerde hafif bir tahrişe neden olma olasılığı düşüktür. Ürünün küçük bir miktarının kazara yutulması önemli bir toksikolojik risk oluşturmaz. Kullanım yöntemi ve ürün formatı göz önüne alındığında, makul kullanım koşulları altında diğer maruz kalma yollarıyla sistemik risk beklenmez.</p>

<p>-İstenmeyen etkiler ve ciddi istenmeyen etkiler</p>

<p>Kasıtsız ve ciddi olumsuz etkiler olması durumunda düzeltici önlemler alınır ve güvenlik değerlendirmesi güncellenir ve bu veri dosyasına eklenir. Ek destekleyici güvenlik verileri ve iddiaların kanıtları değerlendirildi.</p>

<p>Kanıtlanması gereken bir iddia yoktur ve ürün hakkında destekleyici bir güvenlik verisi yoktur. GMP (İyi Üretim Uygulamaları), kozmetik ürünlerinin güvenli bir şekilde üretilmesini sağlamak amacıyla hammaddelerin işlenmesinden ürünün kurulması, tasarımı, üretimi, paketlenmesi, depolanması ve dağıtımına kadar tüm üretim aşamalarını kapsayan bir standarttır.</p>

<p>Bu ürün, yukarıda açıklananlar dışında, aşağıda imzası bulunan kişi tarafından düzenlemelere uygunluk açısından değerlendirilmemiştir. Üründe değerlendirilen tüm bileşenlerin açıklandığı ve rapor tablosunda listelendiği gibi doğru olduğu varsayılmıştır.</p>

<p>Verilen bilgilere dayanarak, bu raporda aksi belirtilmediği sürece ne bu ürünün ne de üründe kullanılan bileşenlerin bir tüketicide toksisiteye neden olabilecek herhangi bir safsızlık/kirletici içermediği varsayılmıştır.</p>

<p>Bu değerlendirme yalnızca burada açıklanan koşullarla ilgilidir. Güvenlik değerlendirmesi kişisel olarak yapılmış olup devredilemez.</p>
    
    
    <h3>B.4. Güvenlilik Değerlendirme Sorumlusu ile İlgili Bilgiler ve Kısım B'nin Onayı</h3>
    ${infoTable([
      ["Güvenlilik Değerlendiricisinin Adı ve Adresi", `${text(f.SorumluAd, empty)}\n${text(f.SorumluAdres, empty)}`],
      ["Güvenlilik Değerlendiricisinin Yeterlilik Kanıtı", f.SorumluKanit],
      ["Rapor Tarihi", todayTr()],
      ["İmza", '<div class="signature"></div>']
    ])}
    
  </section>

  <section class="page-break">
    ${screenHeader}
    <h2>EK-1 KOZMETİK ÜRÜNÜN FORMÜLASYON ve DEĞERLENDİRMESİ</h2>
    <table class="compact">
      <thead><tr><th>Bileşen</th><th>CAS No</th><th>EC No</th><th>Fonksiyon</th><th>Yönetmelik</th><th>C (%)</th><th>A</th><th>Dap</th><th>SED</th><th>NO(A)EL</th><th>MOS</th><th>Değerlendirme</th></tr></thead>
      <tbody>${formulaRows(formulResults, a)}</tbody>
    </table>
    <h3>Üründe Kullanılan Koruyucu Bileşenler</h3>
    <table class="compact">
      <thead><tr><th>INCI Name</th><th>CAS Number</th><th>Bitmiş Üründeki Max Konsantrasyon (%)</th><th>A (Koruyucular İçin)</th><th>SED</th><th>NO(A)EL</th><th>MOS</th></tr></thead>
      <tbody>${preservativeRows(formulResults)}</tbody>
    </table>
    <h3>Alerjen Bileşenlerin Bilgisi</h3>
    <table class="compact">
      <thead><tr><th>INCI Name</th><th>CAS Number</th><th>EINECS/ELICS Numbers</th><th>Konsantrasyon (%)</th><th>A</th><th>SED</th><th>NO(A)EL</th><th>MOS</th></tr></thead>
      <tbody>${allergenRows(formulResults, a)}</tbody>
    </table>
<p class="muted">*C: Konsantrasyon. Üst değer üzerinden değerlendirmeye alınmıştır. </p>
<p class="muted">*N/A: Hammaddenin NOAEL değerine ulaşılamadığından MoS hesabı yapılamamıştır. Hammadde yasaklı ürünler listesinde değildir ve limit dahilinde kullanılmıştır. Dolayısıyla uygun olarak değerlendirilmiştir.</p>
<p class="muted">*UYGUN: MoS> 100 olduğundan bu hammaddenin bu konsantrasyonda bu ürün içinde kullanımı güvenlidir.</p>
    <div style="page-break-after: always;"></div>

    <h2>EK-2 KOZMETİK YÖNETMELİK EKLERİNE UYGUNLUK KONTROLÜ</h2>
    <table class="compact">
      <thead><tr><th>Ek No</th><th>Maddenin INCI Adı</th><th>Ürün Tipi, Vücut Bölgeleri</th><th>Kullanıma Hazır Ürünlerdeki Maksimum Konsantrasyon</th><th>Diğer</th><th>Etiket Üzerinde Belirtilmesi Gereken Kullanma Talimatı ve Tedbirler</th><th>Bitmiş Üründeki Konsantrasyonu</th><th>Değerlendirme</th></tr></thead>
      <tbody>${regulationRows(formulResults)}</tbody>
    </table>
<div style="page-break-after: always;"></div>

    <h2>EK-3 BİLEŞENLERİN FİZİKOKİMYASAL VE TOKSİKOLOJİK ÖZELLİKLERİ</h2>
    ${ingredientProfiles(formulResults)}
<div style="page-break-after: always;"></div>
    <h2>KAYNAKLAR</h2>
    <ol>
      <li>Regulation (EC) No 1223/2009 of the European Parliament and of the Council on cosmetic products</li>
      <li>The SCCS's Notes of Guidance for the Testing of Cosmetic Ingredients and Their Safety Evaluation 12th Revision</li>
      <li>5324 sayılı Kozmetik Kanunu</li>
      <li>Kozmetik Ürünlerde Güvenlik Değerlendirmesine İlişkin Kılavuz</li>
      <li>Kozmetik Yönetmeliğinde Değişiklik Yapılmasına Dair Yönetmelik ve Ekleri</li>
      <li>Kozmetik Ürünlerin Stabilitesine ve Açıldıktan Sonra Kullanım Süresine İlişkin Kılavuz</li>
      <li>Kozmetik Ürünlerin Mikrobiyolojik Kontrolüne İlişkin Kılavuz</li>
      <li>Kozmetik Ürünlerde Güvenlilik Değerlendirmesi ve Güvenlilik Değerlendiricisi Hakkında Kılavuz</li>
      <li>Üretici Tarafından Ciddi İstenmeyen Etkinin Kuruma Bildirilmesine İlişkin Kılavuz</li>
      <li>Kozmetik Ürünlerin Etiketlenmesinde Dikkat Edilmesi Gerekenler Hakkında Kılavuz</li>
    </ol>

  </section>
</div>
</body>
</html>`;
}
