import { LAB_UGDR_REPORT_CONTENT_OVERRIDES } from "@/lib/reportContent/labUgdrReportContent";
import { UGD_REPORT_CONTENT_OVERRIDES } from "@/lib/reportContent/ugdReportContent";

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

type ReportLanguage = "tr" | "en";
type ReportProfile = "ugd" | "lab";

type UGDReportInput = {
  form: Record<string, unknown>;
  formulResults: IngredientRow[];
  firmaAd: string;
  firmaAdres: string;
  firmaTelefon: string;
  firmaMail: string;
  language?: ReportLanguage;
  profile?: ReportProfile;
  output?: "html" | "word";
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

function todayByLanguage(language: ReportLanguage) {
  return new Intl.DateTimeFormat(language === "en" ? "en-GB" : "tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

function pickLanguage(value: unknown): ReportLanguage {
  return value === "en" ? "en" : "tr";
}

function localizedField(form: Record<string, unknown>, field: string, language: ReportLanguage, fallback = "") {
  if (language === "en") {
    return text(form[`${field}En`], text(form[field], fallback));
  }
  return text(form[field], fallback);
}

const reportCopy = {
  tr: {
    htmlLang: "tr",
    headerTitle: "KOZMETİK ÜRÜN GÜVENLİLİK DEĞERLENDİRMESİ",
    headerSubtitle: "(EC) No 1223/2009 Kozmetik Regülasyonu ve 23 Mayıs 2005 tarihli, 25823 sayılı Kozmetik Yönetmeliği uyarınca hazırlanmıştır.",
    formVersion: "Form / Versiyon No:",
    printPdf: "Yazdır / PDF",
    coverTitle: "KOZMETİK ÜRÜN GÜVENLİLİK<br>DEĞERLENDİRMESİ",
    basis1: "(EC) No 1223/2009 Kozmetik Regülasyonu, 23 Mayıs 2005 tarihli 25823 Resmi Gazete sayılı Kozmetik Yönetmeliği ve ekleri,",
    basis2: "The SCCS's Notes of Guidance For The Testing of Cosmetics Ingredients and Their Safety Evaluation 12th Revision,",
    basis3: "Türkiye İlaç ve Tıbbi Cihaz Kurumu Kozmetik Ürünlerde Güvenlilik Değerlendirmesine İlişkin Kılavuz Sürüm 3.0 uyarınca hazırlanmıştır.",
    toc: "İÇİNDEKİLER",
    partA: "KISIM A - KOZMETİK ÜRÜN GÜVENLİLİK BİLGİLERİ",
    partB: "KISIM B - KOZMETİK ÜRÜN GÜVENLİLİK DEĞERLENDİRMESİ",
    sectionA: "A. KOZMETİK ÜRÜN GÜVENLİLİK BİLGİSİ",
    productInfo: "Ürün Hakkında Bilgiler",
    supplier: "Tedarikçi / Dağıtıcı Firma",
    productName: "Ürün Adı",
    barcode: "Barkodu",
    nominalAmount: "Nominal Miktar",
    productType: "Ürün Tipi",
    applicationArea: "Uygulama Yeri",
    targetUsers: "Hedeflenen Kişiler",
    supplierName: "Tedarikçi / Dağıtıcı Firma",
    address: "Adresi",
    phone: "Telefon",
    email: "E-Mail",
    use: "Kullanım",
    warnings: "Uyarılar",
    appearance: "Görünüm",
    color: "Renk",
    odor: "Koku",
    boilingPoint: "Kaynama Noktası",
    meltingPoint: "Erime Noktası",
    density: "Yoğunluk",
    viscosity: "Viskozite",
    waterSolubility: "Suda Çözünebilirlik",
    otherSolubility: "Diğer Çözünebilirlik",
    reportDate: "Rapor Tarihi",
    signature: "İmza",
    evaluator: "Güvenlilik Değerlendiricisinin Adı ve Adresi",
    qualification: "Güvenlilik Değerlendiricisinin Yeterlilik Kanıtı",
    statusOk: "UYGUN",
    statusWarn: "UYGUN DEĞİL",
    formulaEmpty: "Formül bileşeni girilmedi.",
    preservativeEmpty: "Koruyucu bileşen kaydı yok.",
    allergenEmpty: "Alerjen bileşen kaydı yok.",
    regulationEmpty: "Limit, etiket şartı veya yasaklı madde kaydı yok.",
    profileEmpty: "Bileşen profili kaydı yok.",
    physicochemical: "Fizikokimyasal Özellikler",
    toxicological: "Toksikolojik Özellikler",
    source: "Kaynak",
    stabilityImage: "Stabilite görseli",
    challengeImage: "Challenge test görseli",
    microbiologyImage: "Mikrobiyoloji görseli",
    labelImage: "Etiket / ambalaj görseli",
  },
  en: {
    htmlLang: "en",
    headerTitle: "COSMETIC PRODUCT SAFETY ASSESSMENT",
    headerSubtitle: "It has been prepared According to REGULATION (EC) No 1223/2009 OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL on Cosmetic Products",
    formVersion: "Form / Version Nr:",
    printPdf: "Print / PDF",
    coverTitle: "COSMETIC PRODUCT SAFETY<br>ASSESSMENT",
    basis1: "According to REGULATION (EC) No 1223/2009 OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL on Cosmetic Products, Annex 1-Cosmetic Product Safety Report",
    basis2: "The SCCS's Notes Of Guidance For The Testing Of Cosmetic Ingredients And Their Safety Evaluation 12th Revision,  ",
    basis3: "Prepared in accordance with the Turkish Medicines and Medical Devices Agency Guideline on Safety Assessment of Cosmetic Products Version 3.0.",
    toc: "INDEX",
    partA: "PART A - COSMETIC PRODUCT SAFETY INFORMATION",
    partB: "PART B - COSMETIC PRODUCT SAFETY ASSESSMENT",
    sectionA: "A. COSMETIC PRODUCT SAFETY INFORMATION",
    productInfo: "Product Information",
    supplier: "Company Information",
    productName: "Product Name",
    barcode: "Barcode",
    nominalAmount: "Nominal Amount",
    productType: "Product Type",
    applicationArea: "Application Area",
    targetUsers: "Target Users",
    supplierName: "Company",
    address: "Address",
    phone: "Phone",
    email: "E-Mail",
    use: "Use",
    warnings: "Warnings",
    appearance: "Appearance",
    color: "Color",
    odor: "Odor",
    boilingPoint: "Boiling Point",
    meltingPoint: "Melting Point",
    density: "Density",
    viscosity: "Viscosity",
    waterSolubility: "Water Solubility",
    otherSolubility: "Other Solubility",
    reportDate: "Report Date",
    signature: "Signature",
    evaluator: "Name and Address of the Safety Assessor",
    qualification: "Proof of Qualification of the Safety Assessor",
    statusOk: "COMPLIANT",
    statusWarn: "NOT COMPLIANT",
    formulaEmpty: "No formula ingredient was entered.",
    preservativeEmpty: "No preservative ingredient record.",
    allergenEmpty: "No allergen ingredient record.",
    regulationEmpty: "No limit, labelling condition, or prohibited substance record.",
    profileEmpty: "No ingredient profile record.",
    physicochemical: "Physicochemical Properties",
    toxicological: "Toxicological Properties",
    source: "Source",
    stabilityImage: "Stability image",
    challengeImage: "Challenge test image",
    microbiologyImage: "Microbiology image",
    labelImage: "Label / packaging image",
  },
} as const;

function mergeReportCopy(language: ReportLanguage, profile: ReportProfile) {
  const baseCopy = reportCopy[language];
  const overrides =
    profile === "lab"
      ? LAB_UGDR_REPORT_CONTENT_OVERRIDES[language]
      : UGD_REPORT_CONTENT_OVERRIDES[language];

  return {
    ...baseCopy,
    ...(overrides || {}),
  };
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

function formulaRows(rows: IngredientRow[], a: number, copy: typeof reportCopy[ReportLanguage]) {
  if (!rows.length) {
    return `<tr><td colspan="12" class="muted">${esc(copy.formulaEmpty)}</td></tr>`;
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
      <td class="${ok ? "ok" : "warn"}">${ok ? esc(copy.statusOk) : esc(copy.statusWarn)}</td>
    </tr>`;
  }).join("");
}

function preservativeRows(rows: IngredientRow[], copy: typeof reportCopy[ReportLanguage]) {
  const filtered = rows.filter((row) => text(row.Regulation).toLocaleLowerCase("tr-TR").includes("v"));
  const source = filtered.length ? filtered : rows;
  if (!source.length) return `<tr><td colspan="7" class="muted">${esc(copy.preservativeEmpty)}</td></tr>`;

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

function allergenRows(rows: IngredientRow[], a: number, copy: typeof reportCopy[ReportLanguage]) {
  const filtered = rows.filter((row) => {
    const haystack = `${text(row.Functions)} ${text(row.Regulation)} ${text(row.INCIName)}`.toLocaleLowerCase("tr-TR");
    return haystack.includes("fragrance") || haystack.includes("parfum") || haystack.includes("aroma") || haystack.includes("allergen");
  });
  const source = filtered.length ? filtered : rows;
  if (!source.length) return `<tr><td colspan="8" class="muted">${esc(copy.allergenEmpty)}</td></tr>`;

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

function regulationRows(rows: IngredientRow[], copy: typeof reportCopy[ReportLanguage]) {
  const regulatedRows = rows.filter(hasRegulatoryRestriction);
  if (!regulatedRows.length) return `<tr><td colspan="8" class="muted">${esc(copy.regulationEmpty)}</td></tr>`;

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
      <td class="${banned ? "warn" : "ok"}">${banned ? esc(copy.statusWarn) : esc(copy.statusOk)}</td>
    </tr>`;
  }).join("");
}

function ingredientProfiles(rows: IngredientRow[], copy: typeof reportCopy[ReportLanguage]) {
  if (!rows.length) return `<p class="muted">${esc(copy.profileEmpty)}</p>`;

  return rows.map((row) => `<section class="ingredient-profile">
    <h3>${esc(row.INCIName || row.inputName, empty)}</h3>
    ${infoTable([
      [copy.physicochemical, row.Fizikokimya],
      [copy.toxicological, row.Toksikoloji],
      [copy.source, row.Kaynak],
    ])}
  </section>`).join("");
}

export function renderUgdReportHtmlEn(input: UGDReportInput) {
  const { form: f, formulResults, firmaAd, firmaAdres, firmaTelefon, firmaMail } = input;
  const isWordOutput = input.output === "word";
  const language = pickLanguage(input.language);
  const profile: ReportProfile = input.profile === "lab" ? "lab" : "ugd";
  const copy = mergeReportCopy(language, profile);
  const a = parseFloat(text(f.A, "0").replace(",", ".")) || 0;
  const maruziyet = localizedField(f, "MaruziyetAciklama", language);
  const productName = localizedField(f, "Urun", language, empty);
  const useText = localizedField(f, "Kullanim", language, empty);
  const warningsText = localizedField(f, "Uyarilar", language, empty);
  const evaluatorName = localizedField(f, "SorumluAd", language, empty);
  const evaluatorAddress = localizedField(f, "SorumluAdres", language, empty);
  const evaluatorQualification = localizedField(f, "SorumluKanit", language, empty);
  const title = `UGD_Rapor_${text(f.RaporNo, "rapor")}`;
  const reportHeader = `
    <div class="report-header">
      <div>
        <div class="report-header-title">${esc(copy.headerTitle)}</div>
        <div class="report-header-subtitle">${esc(copy.headerSubtitle)}</div>
      </div>
      <div class="report-header-meta">
        <span>${esc(copy.formVersion)}</span>
        <strong>${esc(f.RaporNo, empty)} / ${esc(f.Versiyon, empty)}</strong>
      </div>
    </div>`;
  const screenHeader = isWordOutput ? "" : `<div class="screen-page-header">${reportHeader}</div>`;

  return `<!doctype html>
<html lang="${copy.htmlLang}">
<head>
  <meta charset="utf-8">
  <title>${esc(title)}</title>
  <style>
    @page WordSection1 { size: A4; margin: 20mm 14mm 18mm 14mm; mso-header: ugdWordHeader; }
    @page { size: A4; margin: 20mm 14mm 18mm 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-family: Microsoft Sans Serif, Tahoma, sans-serif; font-size: 9.5pt; line-height: 1.48; }
    .WordSection1 { page: WordSection1; }
    .pdf-header { display: none; position: fixed; left: 0; right: 0; height: 20mm; z-index: 10; mso-hide: all; }
    .screen-page-header { display: none; }
    .report-header { width: 100%; border-bottom: 1px solid #1f4788; padding-bottom: 5px; display: table; table-layout: fixed; color: #143b6f; }
    .report-header > div { display: table-cell; vertical-align: top; }
    .report-header-title { font-size: 9.5pt; font-weight: 700; letter-spacing: .02em; }
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
    .image-block { box-sizing: border-box; max-width: 100%; margin: 10px 0; overflow: hidden; text-align: center; page-break-inside: avoid; }
    .image-block img { width: auto; height: auto; max-width: 100%; max-height: 150mm; display: block; margin: 0 auto; object-fit: contain; border: 1px solid #d1d5db; }
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
  ${isWordOutput ? "" : `<div class="print-actions"><button onclick="window.print()">${esc(copy.printPdf)}</button></div>`}
  ${isWordOutput ? "" : `<div class="pdf-header">${reportHeader}</div>`}
  ${isWordOutput ? "" : `<!--[if gte mso 9]><div style="mso-element:header" id="ugdWordHeader">${reportHeader}</div><![endif]-->`}

  <div class="WordSection1">
  <section class="cover">
    ${screenHeader}
    <h1>${copy.coverTitle}</h1>
    <div class="rule"></div>
    <div class="product">${esc(productName, empty)}</div>
    <div class="company">${esc(firmaAd, empty)}</div>
    <p class="basis" style="border: 1px solid #add8e6; 
    width: 500px; 
    margin-bottom: 2px; 
    padding: 15px; 
    text-align: center; 
    line-height: 1.5;
    word-wrap: break-word;">${esc(copy.basis1)}</p>
    <p class="basis" style="border: 1px solid #add8e6; 
    width: 500px; 
    margin-bottom: 2px; 
    padding: 15px; 
    text-align: center; 
    line-height: 1.5;
    word-wrap: break-word;">${esc(copy.basis2)}</p>
    <p class="basis" style="border: 1px solid #add8e6; 
    width: 500px; 
    padding: 15px; 
    text-align: center; 
    line-height: 1.5;
    word-wrap: break-word;">${esc(copy.basis3)}</p>
  </section>

  <section class="toc">
    ${screenHeader}
    <h2>${esc(copy.toc)}</h2>
    <div class="part-title">${esc(copy.partA)}</div>
<p>A.1. Quantitative and qualitative composition of the cosmetic product</p>
<p>A.2. Physical/chemical characteristics and stability of the cosmetic product</p>
<p>a. Physical/chemical characteristics of substances or mixtures</p>
<p>b. Physical/chemical characteristics of the cosmetic product</p>
<p>c. Stability of the cosmetic product</p>
<p>(1) Evidence that the composition of the product used for stability testing corresponds to the product actually placed on the market</p>
<p>(2) The results of the preservative efficacy study, Challenge Test</p>
<p>(3) The period-after-opening (PAO) and its justification</p>
<p>A.3. Microbiological quality</p>
<p>a. Microbiological quality of substances and mixtures</p>
<p>b. Microbiological quality of the finished cosmetic product</p>
<p>A.4. Impurities, traces, information about the packaging material</p>
<p>a. Purity of substances and mixtures</p>
<p>b. Evidence of the technical unavoidability of traces of prohibited substances</p>
<p>c. The relevant characteristics of packaging material</p>
<p>A.5. Normal and reasonably foreseeable use</p>
<p>A.6. Exposure to the cosmetic product</p>
<p>A.7. Exposure to the substances</p>
<p>A.8. Toxicological profile of the substances</p>
<p>a. Toxicological Profile of The Substances</p>
<p>b. Consideration of systemic effects and calculation of the margin of safety</p>
<p>c. Control of the Substances’ Compliance with the Regulation (Ec) No 1223/2009</p>
<p>A.9. Undesirable effects and serious undesirable effects</p>
<p>A.10. Information on the cosmetic product</p>
    <div class="part-title">${esc(copy.partB)}</div>
<p>B.1. Assessment conclusion</p>
<p>B.2. Labelled warnings and instructions of use</p>
<p>B.3. Reasoning</p>
<p>B.4. Assessor’s credentials and approval of Part B</p>
  </section>

  <section>
    ${screenHeader}
    <h2>${esc(copy.sectionA)}</h2>
    <h3>${esc(copy.productInfo)}</h3>
    ${infoTable([
      [copy.productName, productName],
      [copy.barcode, f.Barkod],
      [copy.nominalAmount, f.Miktar],
      [copy.productType, f.Tip1],
      [copy.applicationArea, f.Uygulama],
      [copy.targetUsers, f.Hedef],
    ])}

     <h3>${esc(copy.supplier)}</h3>
    ${infoTable([
      [copy.supplierName, firmaAd],
      [copy.address, firmaAdres],
      [copy.phone, firmaTelefon],
      [copy.email, firmaMail],
    ])}

    <h3>A.1. Quantitative and qualitative composition of the cosmetic product</h3>
    <p>The qualitative and quantitative characteristics of the cosmetic product are detailed in Annex 1 of the report.</p>

    <h3>A.2. Physical/chemical characteristics and stability of the cosmetic product</h3>
    <div style="font-weight: bold;">a. Physical/chemical characteristics of substances or mixtures</div>
    <p>Physical and chemical properties of substances or mixtures are detailed in Annex-3.</p>
    <div style="font-weight: bold;">b. Physical/chemical characteristics of the cosmetic product</div>
    ${infoTable([
      [copy.appearance, localizedField(f, "Appearance", language)],
      [copy.color, localizedField(f, "Colour", language)],
      [copy.odor, localizedField(f, "Odor", language)],
      ["pH", localizedField(f, "pH", language, text(f.pH))],
      [copy.boilingPoint, localizedField(f, "Boiling Point", language)],
      [copy.meltingPoint, localizedField(f, "Melting Point", language)],
      [copy.density, localizedField(f, "Density", language)],
      [copy.viscosity, localizedField(f, "Viscosity", language)],
      [copy.waterSolubility, localizedField(f, "Solubility in water", language)],
      [copy.otherSolubility, localizedField(f, "Solubility in other solvents and oils", language)],
    ])}

    <div style="page-break-after: always;"></div> 

    <div style="font-weight: bold;">c. Stability of the Cosmetic Product</div>
    <p>A commercially available cosmetic product must be safe for human health when used under normal or foreseeable conditions of use. Stability studies were carried out on the finished product. The appearance, color, odor, pH and weight values of the product are checked at regular intervals under different temperature conditions. Stability test results are included in the product security file.</p>
    <p>${nl2br(f.Stabilite)}</p>
    ${imageBlock(f.StabiliteGorsel, copy.stabilityImage)}


<div style="font-weight: bold; margin-bottom: 2px">(1) Evidence that the composition of the product used for stability testing corresponds to the product actually placed on the market</div>
<p>The SCCS has recommended that relevant stability tests, adapted to the type of cosmetic product and its intended use, should be carried out. The manufacturer guarantied that stability tests are currently carried out with inert containers and those intended to be used on the market by declaration.</p>

<div style="font-weight: bold; margin-bottom: 2px">(2) The results of the preservative efficacy study, Challenge Test</div>	
<p>The test involves the preparation of appropriate microorganisms at specific inoculum levels and the enumeration of microorganisms in the sample by inoculating the sample containing microorganisms at specific time intervals. The adequacy of the preservative properties of the product is determined by determining whether a significant decrease or increase in microorganisms is observed at 7, 14 and 28 days under the test conditions.
According to the test results, the manufacturer guarantees the efficacy of the preservation of this product experimentially by carrying out challenge test.
See Annex - Challenge Test Report

   <p>${nl2br(f.KoruyucuEtkinlik)}</p>
    ${imageBlock(f.KoruyucuEtkinlikGorsel, copy.challengeImage)}

<div style="font-weight: bold; margin-bottom: 2px">(3) The period-after-opening (PAO) and its justification</div>
<p>The PAO (Period of time after opening) estimation is performed by evaluating several factors such as resistance to microbial contamination, type of packaging, duration of use (volume / dose /frequency), area of application and type of population destined for the cosmetic product. After the joint assessment of these factors, the PAO of the product can be estimated in the form of 12 months.
See Annex – Stability Test Report

    <h3>A.3.  Microbiological Quality</h3>
    <div style="font-weight: bold;">a. Microbiological quality of substances and mixtures</div>
    <p>The main parameters for microbiological quality are the original level of contamination and the possibility of microbial growth. Raw materials have been evaluated based on its susceptibility to microbial growth.
     
<div style="font-weight: bold;">b. Microbiological quality of the finished cosmetic product</div>
<p>Microorganisms that should never be present in cosmetic products are Staphylococcus aureus, Pseudomonas aeruginosa, Candida albicans and Escherichia coli.
Since different skin areas may have different sensitivities, two separate categories have been defined for cosmetic products.
  
 <table>  
  <tr>
        <td style="white-space: nowrap;">Category 1</td>
        <td>Products for children under 3 years of age, products applied to the eye area, products applied to mucous membranes</td>
      </tr>
      <tr>
        <td style="white-space: nowrap;">Category 2</td>
        <td>Other products</td>
      </tr>
 </table>

<p>Quantitative / Quantitative Limit</p>
 <table>  
  <tr>
        <td style="white-space: nowrap;">Category 1</td>
        <td style="white-space: nowrap;">The total number of viable aerobic mesophilic microorganisms (bacteria, yeast and mold) should not exceed 10^2 cfu/g or 10^2 cfu/ml.</td>
      </tr>
      <tr>
        <td style="white-space: nowrap;">Category 2</td>
        <td style="white-space: nowrap;">Total number of viable aerobic mesophilic microorganisms (bacteria, yeast and mold) not more than 10^3 cfu/g or 10^3 cfu/ml.</td>
      </tr>
 </table>


  <p>Qualitative / Qualitative Limits</p>
   <table>  
  <tr>
        <td style="white-space: nowrap;">Category 1</td>
        <td>Staphylococcus aureus, Pseudomonas aeruginosa, Candida albicans or Escherichia coli must not be present.</td>
      </tr>
      <tr>
        <td style="white-space: nowrap;">Category 2</td>
        <td>Staphylococcus aureus, Pseudomonas aeruginosa, Candida albicans or Escherichia coli must not be present.</td>
      </tr>
 </table>



<p>According to SCCS/1628/21, two separate categories of cosmetic products are defined in the
microbiological quality control limits:
Category 1: Products applied to children under three of age, to mucous membranes in general.
Category 2: Other products.
It is generally accepted that for cosmetics classified in Category 1, the total viable count for
aerobic mesophyllic microorganisms should not exceed 10² cfu/g or 10² cfu/ml of the product
(cfu = colony forming unit).
For cosmetics classified in Category 2, the total viable count for aerobic mesophyllic
microorganisms should not exceed 10³ cfu/g or 10³ cfu/ml of the product.
Pseudomonas aeruginosa, Staphylococcus aureus, Escherichia coli and Candida albicans are
considered the main potential pathogens in cosmetic products. These specific potential
pathogens must not be detectable in 1 g or 1 ml of a cosmetic product of Category 1 and
Category 2.
This product has to be evaluated according to Category 2.

<p>${nl2br(f.Mikrobiyoloji)}</p>
    ${imageBlock(f.MikrobiyolojiGorsel, copy.microbiologyImage)}

    <h3>A.4. Impurities, traces, information about the packaging material</h3>
    
<div style="font-weight: bold;">a. Purity of substances and mixtures </div>
<p>All raw materials were assessed in terms of safety and compliance with the regulation.
Impurities are unintended substances in raw materials. A trace is a small quantity of an
unintended substance in the finished product. Impurities and traces are to be evaluated with
regard to safety of the finished product.
Unintended substances can originate from the following sources: impurities in the raw
materials/substances; the manufacturing process; potential chemical evolution/interaction
and/or migration of substances in the product that could occur under normal storage conditions and/or through contact with the packaging material.

<div style="font-weight: bold;">b. Evidence of the technical unavoidability of traces of prohibited substances</div>
<p>The cosmetic product is manufactured according to Good Manufacturing Practice (GMP). Besides, the technical data of the product have been evaluated and heavy metals are considered technically unavoidability. According to the manufacturer’s data the product as manufactured complies with the Regulation (EC) No 1223/2009. The ingredients in the formulation do not indicate any potential interactions that may result in unintended impurities in the finished cosmetic product.

<div style="font-weight: bold;">c. The relevant characteristics of packaging material</div>
<p>Possible undesirable interactions between the product and its packaging have been evaluated. In order to predict the behaviour in medium / long term different tests were carried out at different temperatures, and it has been observed the produced effects on the packaging and the formula, in particular:
- Weight gain or loss
- Modifications of the packaging appearance
- Modifications of the formula appearance
- Packaging functionality
Possible interactions have been evaluated and the results show that the packaging is compatible with the product.
The relevant properties of the packaging material should be taken into account, as substance migration from the packaging to the formulation may occur. Information on packaging material and nominal quantity is provided in the Product Information File.

    <h3>A.5. Normal and reasonably foreseeable use</h3>
    ${infoTable([
      [copy.use, useText],
      [copy.warnings, warningsText],
    ])}
    ${imageBlock(f.EtiketGorsel, copy.labelImage)}

    <h3>A.6. Exposure to Cosmetic Product</h3>
    ${infoTable([
      ["Product type:", f.Tip1],
      ["Application areas:", f.Uygulama],
      ["Products applied to the skin contact area (cm²)", exposureValue(maruziyet, "Uygulanan ürünün deriye temas ettiği alan")],
      ["The amount of applied product (g)", exposureValue(maruziyet, "Uygulanan ürünün miktarı")],
      ["Applied contact time and frequency of administration of the product", exposureValue(maruziyet, "Temas süresi ve uygulama sıklığı")],
      ["Normal and reasonable routes of exposure", "Dermal absorption"],
      ["Target people", f.Hedef],
      ["A Value", f.A],
    ])}

    <p>For value A (total daily exposure) (adult body weight: 60 kg) (based on 'The SCCS's Notes Of Guidance For The Testing Of Cosmetic Ingredients And Their Safety Evaluation 12th Revision SCCS/1647/22)').

    <h3>A.7. Exposure to the substances</h3>

    <p><strong>SED:</strong> Systemic exposure dose. It is the amount of the cosmetic ingredient expected to enter the bloodstream. The unit is expressed in mg/kg body weight/day.

    <p>In the light of the available data, SED can be calculated by two methods. The preferred method here is the calculation based on the % dermal absorption of the applied product.

    <div class="note">SED = A (mg/kg x Body Weight/Day) x C (%) / 100 x DAP (%) / 100</div>

${infoTable([
      ["SED (mg/kg body weight/day):", "Systemic exposure dose"],
      ["A (mg/kg body weight/day):", "Daily exposure to a cosmetic product based on the amount of product applied per kg of body weight and frequency of application"],
      ["C (%):", "The percentage concentration of the substance in the finished product for which exposure is to be calculated."],
      ["Dap (%):", "Percent dermal absorption of the product\n(if it is obtained as a result of the experiment by simulating the conditions of use and is unknown, it is assumed that the product has 100% absorption)."],
      ["A value calculated for the daily exposure:", f.A],
      ["A value used for preservative:", "269,00 mg/kg body weight/day"]
    ])}

<p>The calculated SED values for the relevant product are given in Annex-1 Table-1.</p>

    <h3>A.8. Toxicological profile of the substances</h3>

<div style="font-weight: bold">a. Toxicological Profile of The Substances</div>
<p>The raw materials and mixtures in the formula were grouped according to their trade names and toxicological evaluations were made. Physical properties and toxicological profiles of raw materials and mixtures are given in Annex-3.

<div style="font-weight: bold">b. Consideration of systemic effects and calculation of the margin of safety</div>
<div style="font-weight: bold">Calculation of the Limit of Safety (MoS):</div>
<p>The systemic effects and the limit of safety (MoS) are calculated on the basis of the NO(A)EL value determined on the basis of the toxicological data observed in the experiments, taking into account all significant absorption pathways. If this assessment cannot be made, the reason should be adequately justified.

 <div class="note">MoS = NO(A)EL / SED ≥ 100</div>

${infoTable([
      ["MoS", "The safety limit of the product component."],
      ["NO(A)EL", "Results of long-term repeated dose chronic toxicity, carcinogenicity, teratogenicity test studies in rats, mice, rabbits or dogs for 28 days, 90 days. The highest application amount of the substance at which no undesirable effect is observed. The highest dose or amount of exposure to which no undesirable effects are observed due to treatment or application, expressed in mg/kg body weight/day."],
      ["SED", "Systemic exposure dose. The amount expected to enter the bloodstream. The unit is expressed in mg/kg body weight/day."],
    ])}

<p>The calculated MoS values of the relevant product are given in Annex-1 Table-1.</p>

<div style="font-weight: bold">c. Control of the Substances’ Compliance with the Regulation (Ec) No 1223/2009</div>

<p>Data on the conformity control of the raw materials in the product formulation with the annexes of the Cosmetics Regulation are presented in Annex-2.
<p>ANNEX II: LIST OF SUBSTANCES PROHIBITED IN COSMETIC PRODUCTS
<p>ANNEX III: LIST OF SUBSTANCES WHICH COSMETIC PRODUCTS MUST NOT CONTAIN EXCEPT SUBJECT TO THE RESTRICTIONS LAID DOWN
<p>ANNEX IV: LIST OF COLORANTS ALLOWED IN COSMETIC PRODUCTS
<p>ANNEX V: LIST OF PRESERVATIVES ALLOWED IN COSMETIC PRODUCTS
<p>ANNEX VI: LIST OF UV FILTERS ALLOWED IN COSMETIC PRODUCTS

    <h3>A. 9. Undesirable effects and serious undesirable effects</h3>
   <p>A system should be established to collect, document, establish causality and manage the undesirable effects resulting from the use of the product after it is placed on the market, and when serious undesirable effects occur, the Agency should be informed in accordance with the related institute. All data on undesirable effects and serious undesirable effects related to the cosmetic product(s) should be accessible. Information on all undesirable and serious undesirable effects, including statistical data, must be included in the product information file.
   <p>No information regarding side effects was received from the supplier.

    <h3>A.10. Information on the cosmetic product</h3>
  
  <p>According to the safety assessment report and the toxicological profile calculations, there is no obstacle in the sale of the product.
Other relevant information:
There is no claim that must be proven and there is no supporting safety data about the product.
Other documents in the Information File of the product are listed below:
<p>a- Label 
<p>b- Composition of product
<p>c- GMP Certificate
<p>d- Test results (Stability Test, Challenge and Microbiological Test)
<p>e- SDS’es of raw materials
<p>f- Packaging Informations
<p>g- Production method
  
    </section>

  <section class="page-break">
    ${screenHeader}
    <h2>B. COSMETIC PRODUCT SAFETY ASSESSMENT</h2>
    <h3>B.1. Assessment conclusion</h3>   
   <p>This report is prepared based on the Regulation (EC) No. 1223/2009 Of The European Parliament and of the Council of 30 November 2009 on cosmetic products and The SCCS's Notes o Guidance for the Testing of Cosmetic Ingredients and Their Safety Evaluation.</p>

<p>Under normal or foreseeable conditions of use, a product made to this formulation is unlikely to produce an abnormally high number of adverse reactions. All the ingredients are well known and have a history of safe use in cosmetics. The composition of the product complies with Article 14 of Regulation (EC) 1223/ 2009.</p>

<p>The undersigned declares that the product is safe under reasonable conditions of use, having evaluated all the data listed above and taking into account the results of all tests performed on the product and experience with similar products.</p>

<p>Following review of the information provided for the above product and its ingredients, the product is considered safe for the intended application and complies with EC Regulation 1223/2009 .</p>

<p>This safety assessment for human health is based upon information available at this date. Reviews of this assessment will be made as and when new information becomes available. In order to ensure that the cosmetic product safety report is kept up to date as required by</p>

<p>Article 10(1)(c) of Regulation (EC) No 1223/2009, the safety of the finished product should be reassessed regularly. The safety assessment should also be reviewed and, if necessary, updated, where one or more of the following circumstances apply:</p>

<p>(a) new scientific findings and toxicological data on the substances are available which could modify the result of the existing safety assessment;</p>

<p>(b) changes occurring in the formulation or specifications of raw materials;</p>

<p>(c) changes occurring in the conditions of use;</p>

<p>(d) a rising trend in terms of the nature, severity and frequency of undesirable effects, both under reasonably foreseeable conditions of use and in the case of misuse.</p>

<p>While preparing the cosmetic product safety report, the toxicological profile of the product components and ingredients, chemical structure, expected interactions (MSDS, allergen list, IFRA certificate, etc.), legal requirements and compliance with the legislation for the product and raw materials, durability data of the product, antimicrobial test data and packaging material. compatibility was evaluated.</p>

<p>Finished product specifications and raw material specifications received from the manufacturer for each raw material were evaluated. The stability of the cosmetic product at different temperatures and its sensitivity to moisture should be evaluated under the tested storage conditions. Storage conditions and duration of the selected study should be sufficient to include storage, transportation and subsequent use. An accelerated stability study was carried out for this product, the durability of the product was tested under two different conditions. The stability test evaluation report is given in the annex of the Product Information File.</p>

<p>In this context, Escherichia coli DSMZ 1576, Pseudomonas aeruginosa DSMZ 1117, Staphylococcus aureus DSMZ 799, Candida albicans ATCC 10231 and Aspergillus niger ATCC 16404 were used. Microbiological test is available in the appendices.</p>

<p>There is no data on impurities and residues.</p>

<p>In the safety assessment for adults, the MoS (safety interval) has been evaluated according to the MoS > 100 in the SCCS directives.</p>

<p>Confidence intervals were calculated for raw materials that could reach NO(A)EL values. The safety of raw materials whose.</p>

<p>NO(A)ELvalues are not reached has been evaluated as safe by examining CIR, COSING and literature. The confidence inte rval for all the calculated raw materials was found to be greater than 100. It is safe to use raw materials at this concentration for this product as well. By taking the upper limit usage rate of the raw materials and assuming 100% absorbtion, the worst-possible safety interval was calculated.</p>

<p>It has been seen that the information of the manufacturer and the responsible company on the finished product label, all the raw materials in the list of product components on the label, are written with the names of INCI and in order from largest to smallest according to the % concentration. Necessary symbols are included. The label has been observed to comply with the legislation.</p>

<p>The components in the product are the raw materials that are allowed to be used in cosmetics and are suitable for use. All raw materials are non-toxic at these concentrations when used under normal and predictable conditions. The product does not include the substances in the list of prohibited substances in the Regulation on the Amendment of the Cosmetic Regulation and the Annexes of the Regulation. The product composition complies with the cosmetic legislation. No undesirable effects or serious undesirable effects were reported.</p>

<p>This report has been prepared in line with the available data. The content of the product, the stability data, should be revised when there is a change in the packaging material.</p>

<p>Since the product has passed the laboratory tests and the MoS values of the raw materials are safe, the product is suitable for normal and reasonably foreseeable use under normal conditions, according to the place of use, purpose and amount of use.</p>


    <h3>B.2. Labelled warnings and instructions of use</h3>
    <p>The labelling must comply with the requirements of Article 19 of Regulation (EC) 1223/2009. Any claims made on the packaging must be substantiated with valid data for the formulation which must be kept on file. The finished product label is included in the product information file.</p>
    
    <h3>B.3. Reasoning</h3>
    <p>Documents pertaining to the below criteria contained in this Product Information File were analyzed and considered for the safety assessment conclusion of the product in reference:</p>

<p>-Quantitative and qualitative composition of the cosmetic product.</p>

<p>The qualitative and quantitative composition of the product, including the identification and function of the ingredients in the cosmetic formula, as well as the perfume analysis of the product were evaluated. The aroma used in the product complies with the IFRA Conformity Certificate.</p>

<p>-Physical/chemical characteristics and stability of the cosmetic product.</p>

<p>Final product spesifications and supplier’s spesifications for each raw material have been reviewed. Stability is evaluated according to stability test report providing by the manufacturer. Stability studies indicate that the product remains stable under the test conditions. It is declared that the time period after opening is of 12 months on the label.</p>

<p>-Microbiological quality.</p>

<p>This product has to be evaluated according to Category 2. Product is stable from a microbiological perspective. According to the challenge test results, the manufacturer guarantees the efficacy of the preservation of this product experimentially by carrying out challenge test.</p>

<p>-Impurities, traces, information about the packaging material.</p>

<p>All raw materials were assessed in terms of safety and compliance with the regulation. Impurities present in the ingredients are within the established limits and are not considered to be toxicologically significant.</p>

<p>The packaging material and its properties are indicated. This packaging forms the primary packaging of the product that has been designed to preserve and dispense the cosmetic product properly.</p>

<p>Packaging is suitably compatible with the cosmetic product and guarantees its stability.</p>

<p>-Normal and reasonably foreseeable use.</p>

<p>The labeling of the product has been checked. Producer’s informations have been reviewed for labelled warnings& instructions of use. The informations on the label is enough for this product.</p>

<p>-Exposure to the cosmetic product</p>

<p>All ingredients should be written on the label with their INCI names and in descending order according to their percentage. It is seen that the product labels are compatible. The specific exposure areas on which the product will be applied and/or to the population appropriate to its application.</p>

<p>Exposure to the finished product was determined in accordance with the recommendations of the SCCS’s notes of guidance for the testing of cosmetic substances and their safety evaluation.</p>

<p>-Exposure to the substances.</p>

<p>Exposure to each of the substances in the cosmetic product is calculated from the exposure to the final product and the concentration of the individual substances in the final product. It is necessary to calculate this exposure in order to assess the potential risk from each substance. Exposure to individual substances is calculated from the quantitative composition of the product. Where substances are generated or released during the use of the product, the exposure is estimated and taken into account in the safety assessment.Calculations were made using the following formula:</p>

<p>Dermal absorption reported as a percentage of the amount of substance applied</p>

<p>SED = A(mg/kg bw/day) X C(%) / 100 X DA p (%) / 100</p>

<p>In the absence of exact data, the dermal absorption was determined in line with the criteria recommended on Page 28 of the SCCS 10th Guide, according to which a level of absorption of 50% should be assumed. Only in cases in which the molecular weight > 500 Da, Log Pow ≤-1 or ≥4 and melting point > 200°C has a dermal absorption level of 10% been assumed.</p>

<p>-Toxicological Profile of the Substances.</p>

<p>The toxicological data of the ingredients contained in the product’s formula are taken from the information provided by the suppliers of the raw materials ,the data published in the specialist literature and the data available from reports issued by the various international organizations responsible for evaluating the safety of different products, such as the SCCS (Scientific Committee on Consumer Safety), the CIR (Cosmetic Ingredients Review), the OECD (Organization for Economic Co-operation and Development), the IUCLID(International Uniform Chemical Information Database), the FDA (FooD and Drug Administration), the USA EPA (US Environmental Protection Agency),the EFSA(European Food Safety Authority) and theECHA (European Chemicals Agency).The margins of safety (MoS) were calculated using the following formula:</p>

<p>Calculation of Margin of Safety</p>

<div class="note">MoS = NO(A)EL / SED ≥ 100</div>

<p>The calculated margin of safety for ingredients, for which toxicological data were available, found the safety factor to be acceptable (MoS > 100).</p>

<p>In the case of components, in which no NOAEL makes impossible to calculate the margin of safety of the traditional method, it can be concluded that at the concentrations used substances do not pose a threat due to their low toxicity and a long history of safe use. These components do not show a danger to people and do not adversely affect the safety of the final cosmetic product. The raw materials used to manufacture this product do not pose any health risk in view of their long history of use in cosmetic, pharmaceutical and food products.</p>

<p>Based on the available toxicological data and the margins of safety calculated, the raw materials contained in the cosmetic formula do not pose a systemic toxicity risk at the concentrations used and for the intended use. There is a small possibility that the finished product may cause a slight irritation to the eyes. The accidental ingestion of a small amount of product does not pose a significant toxicological risk. In view of the method of use and the product format, no systemic risks through other exposure routes are expected under the reasonable conditions of use.</p>

<p>-Undesirable effects and serious undesirable effects</p>

<p>In the event of unintentional and serious adverse effects, corrective measures are taken and the safety assessment will be updated and added to this data file.</p>

<p>Additional supporting safety data and evidence of claims were evaluated. There is no claim that must be proven and there is no supporting safety data about the product. GMP (Good Manufacturing Practices) is a standard that covers all production stages, from the processing of raw materials to the establishment, design, manufacture, packaging, storage and distribution of the product, in order to ensure the safe production of cosmetic products. This product was not assessed for compliance with regulations, other than as described above, by the undersigned.</p>

<p>It was assumed that all ingredients assessed in the product were disclosed and are accurate as listed in the report table.</p>

<p>Based upon the information supplied, unless otherwise stated in this report,it was assumed that neither this product, nor the ingredients used in the product, contained any impurities/contaminants that would cause toxicity in a consumer.</p>

<p>This evaluation is relevant solely to the conditions described herein.</p>

<p>The safety assessment was issued personally and is not transferable.</p>
    
    <h3>B.4. Assessor’s credentials and approval of Part B</h3>

    ${infoTable([
      [copy.evaluator, "Dilsun KARABULUT SEFER \n OZECO GROUP ULUSLARARASI DANIŞMANLIK TİCARET LİMİTED ŞİRKETİ \n Şehit Osman Avcı, Malazgirt 1071. Cad. No:49 A İç Kapı No:13, 06820 Eryaman/Ankara +90 (850) 308 33 51 / +90 533 450 69 05"],
      [copy.qualification, "Gazi University Faculty Of Engineering And Architecture/ Chemical Engineer (Diploma no: 2267)\n See Annex \n– Qualification of Safety Assessor \n– University Diploma \n–University Diploma Supplement"],
      [copy.reportDate, todayByLanguage(language)],
      [copy.signature, '<div class="signature"></div>']
    ])}
    
  </section>

  <section class="page-break">
    ${screenHeader}
    <h2>EK-1 KOZMETİK ÜRÜNÜN FORMÜLASYON ve DEĞERLENDİRMESİ</h2>
    <table class="compact">
      <thead><tr><th>Bileşen</th><th>CAS No</th><th>EC No</th><th>Fonksiyon</th><th>Yönetmelik</th><th>C (%)</th><th>A</th><th>Dap</th><th>SED</th><th>NO(A)EL</th><th>MOS</th><th>Değerlendirme</th></tr></thead>
      <tbody>${formulaRows(formulResults, a, copy)}</tbody>
    </table>
    <h3>Üründe Kullanılan Koruyucu Bileşenler</h3>
    <table class="compact">
      <thead><tr><th>INCI Name</th><th>CAS Number</th><th>Bitmiş Üründeki Max Konsantrasyon (%)</th><th>A (Koruyucular İçin)</th><th>SED</th><th>NO(A)EL</th><th>MOS</th></tr></thead>
      <tbody>${preservativeRows(formulResults, copy)}</tbody>
    </table>
    <h3>Alerjen Bileşenlerin Bilgisi</h3>
    <table class="compact">
      <thead><tr><th>INCI Name</th><th>CAS Number</th><th>EINECS/ELICS Numbers</th><th>Konsantrasyon (%)</th><th>A</th><th>SED</th><th>NO(A)EL</th><th>MOS</th></tr></thead>
      <tbody>${allergenRows(formulResults, a, copy)}</tbody>
    </table>
<p class="muted">*C: Konsantrasyon. Üst değer üzerinden değerlendirmeye alınmıştır. </p>
<p class="muted">*N/A: Hammaddenin NOAEL değerine ulaşılamadığından MoS hesabı yapılamamıştır. Hammadde yasaklı ürünler listesinde değildir ve limit dahilinde kullanılmıştır. Dolayısıyla uygun olarak değerlendirilmiştir.</p>
<p class="muted">*UYGUN: MoS> 100 olduğundan bu hammaddenin bu konsantrasyonda bu ürün içinde kullanımı güvenlidir.</p>
    <div style="page-break-after: always;"></div>

    <h2>EK-2 KOZMETİK YÖNETMELİK EKLERİNE UYGUNLUK KONTROLÜ</h2>
    <table class="compact">
      <thead><tr><th>Ek No</th><th>Maddenin INCI Adı</th><th>Ürün Tipi, Vücut Bölgeleri</th><th>Kullanıma Hazır Ürünlerdeki Maksimum Konsantrasyon</th><th>Diğer</th><th>Etiket Üzerinde Belirtilmesi Gereken Kullanma Talimatı ve Tedbirler</th><th>Bitmiş Üründeki Konsantrasyonu</th><th>Değerlendirme</th></tr></thead>
      <tbody>${regulationRows(formulResults, copy)}</tbody>
    </table>
<div style="page-break-after: always;"></div>

    <h2>EK-3 BİLEŞENLERİN FİZİKOKİMYASAL VE TOKSİKOLOJİK ÖZELLİKLERİ</h2>
    ${ingredientProfiles(formulResults, copy)}
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
