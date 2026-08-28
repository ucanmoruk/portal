import { JetBrains_Mono } from "next/font/google";
import { ttInterphases } from "@/app/fonts/reportFonts";
import OnayToolbar from "../OnayToolbar";
import type { ReportFormatProps, KarekodInfo } from "../reportTypes";
import { disRaporLabel } from "@/lib/disKod";
import { isEnglishFormat, translateReportUnit } from "./reportLocale";
import { DEFAULT_STABILITE_VERI, type StabiliteVeri } from "@/lib/stabiliteDefault";

const jetbrains = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-rapor",
});

function fmtTarih(s: string | null | undefined): string {
  if (!s) return "—";
  const v = String(s);
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return v.slice(0, 10);
}

function toMMYY(s: string): string {
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return s;
  return `${m[2]}-${m[3].slice(2)}`;
}

function degerlendirmeLabel(d: string | null, english = false): { text: string; cls: string } {
  if (!d || !d.trim()) return { text: "—", cls: "deg-other" };
  const v = d.trim();
  const normalized = v.toLocaleUpperCase("tr-TR");
  if (v === "Uygun" || normalized === "PASS") return { text: english ? "PASS" : "UYGUN", cls: "deg-gecer" };
  if (v === "Uygun Değil" || normalized === "FAIL") return { text: english ? "FAIL" : "UYGUN DEĞİL", cls: "deg-kaldi" };
  if (v === "Değerlendirilemez" || v === "D.Y." || normalized === "N/A") return { text: english ? "N/A" : "D.Y.", cls: "deg-other" };
  return { text: v, cls: "deg-other" };
}

function normalizeTrText(value: string): string {
  return value
    .trim()
    .replace(/Ü/g, "U").replace(/ü/g, "u")
    .replace(/İ/g, "I").replace(/ı/g, "i")
    .replace(/Ö/g, "O").replace(/ö/g, "o")
    .replace(/Ç/g, "C").replace(/ç/g, "c")
    .replace(/Ş/g, "S").replace(/ş/g, "s")
    .replace(/Ğ/g, "G").replace(/ğ/g, "g")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function translateStabilityText(value: string | null | undefined, english: boolean): string {
  const raw = String(value ?? "").trim();
  if (!english || !raw) return raw;
  const normalized = normalizeTrText(raw);
  const direct: Record<string, string> = {
    "KOB/G": "cfu/g",
    "BULUNMAMALI": "Absent",
    "TESPIT EDILMEDI": "Not Detected",
    "DEGISIM GOZLENMEMELI": "No change should be observed",
    "DEGISIM GORULMEDI": "No change observed",
    "GOZLENMEDI": "Not observed",
    "CATLAMA, SIZDIRMA OLMAMALI": "No cracking or leakage should occur",
    "FAZ AYRIMI OLMAMALI": "No phase separation should occur",
    "ORGANOLEPTIK": "Organoleptic",
  };
  return direct[normalized] ?? raw;
}

function translateStabilityAnalysisName(value: string | null | undefined, english: boolean): string {
  const raw = String(value ?? "").trim();
  if (!english || !raw) return raw;
  const normalized = normalizeTrText(raw);
  const direct: Record<string, string> = {
    "AEROBIK KOLONI SAYIMI": "Aerobic Colony Count",
    "TOPLAM AEROBIK MEZOFILIK BAKTERI SAYIMI": "Total Aerobic Mesophilic Bacteria Count",
    "KUF - MAYA SAYIMI": "Yeast and Mold Count",
    "KUF-MAYA SAYIMI": "Yeast and Mold Count",
    "MAYA VE KUF SAYIMI": "Yeast and Mold Count",
    "PSEUDOMONAS AERUGINOSA": "Pseudomonas aeruginosa",
    "PSEUDOMONAS AERUGINOSA ARANMASI": "Detection of Pseudomonas aeruginosa",
    "CANDIDA ALBICANS ARANMASI": "Detection of Candida albicans",
    "STAPHYLOCOCCUS AUREUS": "Staphylococcus aureus",
    "STAPHYLOCOCCUS AUREUS ARANMASI": "Detection of Staphylococcus aureus",
    "ESCHERICHIA COLI ARANMASI": "Detection of Escherichia coli",
    "RENK": "Color",
    "KOKU": "Odor",
    "GORUNUM": "Appearance",
    "AMBALAJ": "Packaging",
    "FAZ AYRIMI": "Phase Separation",
    "PH TAYINI": "pH Determination",
    "YOGUNLUK TAYINI": "Density Determination",
    "VISKOZITE": "Viscosity",
    "HOMOJENITE": "Homogeneity",
  };
  if (direct[normalized]) return direct[normalized];
  if (normalized.includes("KUF") && normalized.includes("MAYA")) return "Yeast and Mold Count";
  if (normalized.includes("AEROBIK") && normalized.includes("SAYIM")) return "Aerobic Colony Count";
  if (normalized.includes("PSEUDOMONAS")) return "Detection of Pseudomonas aeruginosa";
  if (normalized.includes("CANDIDA")) return "Detection of Candida albicans";
  if (normalized.includes("STAPHYLOCOCCUS")) return "Detection of Staphylococcus aureus";
  if (normalized.includes("ESCHERICHIA") || normalized.includes(" E COLI") || normalized === "E.COLI") return "Detection of Escherichia coli";
  if (normalized.includes("PH")) return "pH Determination";
  if (normalized.includes("YOGUNLUK")) return "Density Determination";
  return raw;
}

function translateStabilityEvaluation(value: string | null | undefined, english: boolean): string {
  const raw = String(value ?? "").trim();
  if (!english || !raw) return raw;
  const normalized = normalizeTrText(raw);
  if (normalized.includes("90 GUNLUK") && normalized.includes("STABIL")) {
    return "As a result of the 90-day accelerated stability test, the product was observed to comply with the relevant limits and remain stable.";
  }
  return raw;
}

interface ChallengeText {
  reportTitle: string;
  annexTitle: string;
  reportNo: string;
  acceptanceDate: string;
  issueDate: string;
  customerInfo: string;
  sampleInfo: string;
  quantity: string;
  productionDate: string;
  expiryDate: string;
  lotNo: string;
  testResults: string;
  analysisName: string;
  method: string;
  result: string;
  assessment: string;
  preservativeTest: string;
  seeAnnex: string;
  explanations: string;
  period: string;
  explanation: string;
  revisionNote: string;
  preparedBy: string;
  approvedBy: string;
  signed: string;
  reporter: string;
  manager: string;
  qrAlt: string;
  qrTitle: string;
  codeTitle: string;
  footerNote: string;
  page: string;
  challengeResults: string;
  protocolLabel: string;
  protocol: string;
  parameter: string;
  inoculation: string;
  sampleCount: string;
  reduction: string;
  limits: string;
  microorganism: string;
  samplingTime: string;
  criterionA: string;
  criterionB: string;
  criteriaNoteA: string;
  criteriaNoteB: string;
  criteriaNoteC: string;
  evaluation: string;
  finalEvaluation: string;
  end: string;
}

// Sağdaki 3 satırlık akreditasyon kutusu (AB-2015-T / Rapor Kodu / MM-YY)
function AkrediteBox({ kod, yayinTarihi, fontSize }: {
  kod: string;
  yayinTarihi: string;
  fontSize: number;
}) {
  return (
    <table className="akredite-box">
      <tbody>
        <tr><td>AB-2015-T</td></tr>
        <tr><td className="akredite-code-cell" style={{ "--akr-code-font-size": `${fontSize}px` } as React.CSSProperties}>{kod}</td></tr>
        <tr><td>{toMMYY(yayinTarihi)}</td></tr>
      </tbody>
    </table>
  );
}

// Header bloğu — her iki sayfada da aynı şekilde gösterilen üst kısım
// title:           sayfa başlığı (varsayılan "DENEY RAPORU")
// showAkredite:     sağdaki 3 satırlık akreditasyon kutusunu göster (varsayılan true)
// showAkrediteLogo: sağ üstteki TÜRKAK/ilac-MRA logosunu göster (varsayılan = showAkredite)
// akrediteInHeader: kutuyu başlık satırı yerine logo satırında (logonun karşısında)
//                   göster — logo, kutuyla aynı satırda dikey ortalanarak biraz aşağı iner
function HeaderBlock({
  title,
  showAkredite = true,
  showAkrediteLogo = showAkredite,
  akrediteInHeader = false,
  showKabulTarihi = true,
  raporKodu,
  kabulTarihi,
  yayinTarihi,
  akrKodFontSize,
  text,
}: {
  title: string;
  showAkredite?: boolean;
  showAkrediteLogo?: boolean;
  akrediteInHeader?: boolean;
  showKabulTarihi?: boolean;
  raporKodu: string;
  kabulTarihi: string;
  yayinTarihi: string;
  akrKodFontSize: number;
  text: Pick<ChallengeText, "reportNo" | "acceptanceDate" | "issueDate">;
}) {
  return (
    <>
      <div className="header">
        <div className="header-logo">
          <img src="/unique-logo-wide.png" alt="UNIQUE ANALYSE" />
        </div>
        {showAkrediteLogo && (
          <div className="header-akredite">
            <img src="/turkak-ilac.jpg" alt="TÜRKAK AB-2015-T · ilac-MRA" />
          </div>
        )}
        {showAkredite && akrediteInHeader && (
          <AkrediteBox kod={raporKodu} yayinTarihi={yayinTarihi} fontSize={akrKodFontSize} />
        )}
      </div>

      <div className="title-row" style={akrediteInHeader ? { marginTop: "6mm" } : undefined}>
        <div className="report-title">{title}</div>
        {showAkredite && !akrediteInHeader && (
          <AkrediteBox kod={raporKodu} yayinTarihi={yayinTarihi} fontSize={akrKodFontSize} />
        )}
      </div>

      <table className="meta-table">
        <tbody>
          <tr>
            <td style={{ paddingBottom: "4px", width: "20%" }}><strong>{text.reportNo}</strong></td>
            <td style={{ paddingBottom: "4px", width: "50%" }}>{raporKodu}</td>
            {showKabulTarihi ? (
              <>
                <td style={{ paddingBottom: "4px" }}></td>
                <td style={{ paddingBottom: "4px" }}></td>
              </>
            ) : (
              <>
                <td style={{ paddingBottom: "4px" }}><strong>{text.issueDate}</strong> </td>
                <td style={{ paddingBottom: "4px" }}>{yayinTarihi}</td>
              </>
            )}
          </tr>
          {showKabulTarihi && (
            <tr>
              <td style={{ paddingBottom: "4px", width: "20%" }}><strong>{text.acceptanceDate}</strong> </td>
              <td style={{ paddingBottom: "4px" }}>{kabulTarihi}</td>
              <td style={{ paddingBottom: "4px" }}><strong>{text.issueDate}</strong> </td>
              <td style={{ paddingBottom: "4px" }}>{yayinTarihi}</td>
            </tr>
          )}
        </tbody>
      </table>
      <div style={{ marginTop: "4px", borderBottom: "2px solid #000000" }}></div>
    </>
  );
}

// İmza bloğu — son sayfada (2. sayfa)
function ApprovalBlock({ hazirlayanAd, karekod, text }: { hazirlayanAd: string; karekod: KarekodInfo | null; text: ChallengeText }) {
  return (
    <div className="approval-block">
      <div className="approval-cell" style={{ width: 200, paddingTop: "15px" }}>
        <div className="approval-cell-title" style={{ paddingLeft: "5px" }}>{text.preparedBy}</div>
        <div className="e-imza-pill" style={{ marginTop: 10 }}>✓ {text.signed}</div>
        <div className="approval-cell-body">
          <div className="approval-name">{hazirlayanAd} <span style={{ fontSize: "9px", color: "#646464" }}>{text.reporter}</span></div>
        </div>
      </div>
      <div className="approval-cell" style={{ width: 300, paddingTop: "15px" }}>
        <div className="approval-cell-title" style={{ paddingLeft: "5px" }}>{text.approvedBy}</div>
        <div className="e-imza-pill" style={{ marginTop: 10 }}>✓ {text.signed}</div>
        <div className="approval-cell-body">
          <div className="approval-name">Oğuzhan EKER <span style={{ fontSize: "9px", color: "#646464" }}>{text.manager}</span></div>
        </div>
      </div>
      <div className="approval-cell">
        <div className="approval-cell-title">
          <img src="/unique-seal.png" alt="UNIQUE ANALYSE" style={{ width: 90 }} />
        </div>
        <div className="approval-cell-body"></div>
      </div>
      <div className="approval-cell">
        <div className="approval-cell-title">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={karekod?.qrDataUrl || "/karekod.png"}
            alt={text.qrAlt}
            title={karekod?.url || text.qrTitle}
            style={{ width: 90 }}
          />
        </div>
        <div className="approval-cell-body">
          {karekod?.dogrulamaKod && (
            <div
              title={text.codeTitle}
              style={{
                textAlign: "center",
                fontSize: "9px",
                fontWeight: 700,
                letterSpacing: "0.14em",
                color: "#000",
                fontFamily: "monospace",
                padding: "1px 0",
              }}
            >
              {karekod.dogrulamaKod}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function StabiliteReport({
  nkrId,
  format,
  header,
  hizmetler,
  testBaslangic,
  testBitis,
  onay,
  meta,
  karekod,
}: ReportFormatProps) {
  const {
    revNo,
    revizeNot,
    kabulTarihi,
    yayinTarihi,
    hazirlayanAd,
    onaylayanAd,
    sirketAdi,
  } = meta;
  const isEnglish = isEnglishFormat(format);
  const text: ChallengeText = isEnglish
    ? {
        reportTitle: "TEST REPORT",
        annexTitle: "TEST REPORT - ANNEX 1",
        reportNo: "Report No - Rev. No:",
        acceptanceDate: "Sample Acceptance Date:",
        issueDate: "Report Issue Date:",
        customerInfo: "CUSTOMER INFORMATION",
        sampleInfo: "SAMPLE INFORMATION",
        quantity: "Quantity:",
        productionDate: "Production Date:",
        expiryDate: "Expiry Date:",
        lotNo: "Serial/Lot No/Product Code:",
        testResults: "TEST RESULTS",
        analysisName: "Analysis Name",
        method: "Method",
        result: "Result",
        assessment: "Assessment",
        preservativeTest: "*Preservative Efficacy Test",
        seeAnnex: "See Annex-1",
        explanations: "EXPLANATIONS",
        period: "Analysis Period:",
        explanation:
          "The stability study requested by the customer was evaluated according to the relevant cosmetic product stability requirements.",
        revisionNote: "Revision Note:",
        preparedBy: "Prepared By",
        approvedBy: "Approved By",
        signed: "E-Signed",
        reporter: "Reporter",
        manager: "D. Laboratory Manager",
        qrAlt: "Report Verification QR Code",
        qrTitle: "Report verification",
        codeTitle: "Verification Code - this code is used for manual verification",
        footerNote:
          "\"*\" marked analyses are accredited by TURKAK according to TS EN ISO/IEC 17025. Sampling was not performed by our laboratory. Test Reports without signature and seal are invalid. This Analysis Report may not be partially copied, reproduced or used for any other purpose without the written permission of " +
          sirketAdi +
          ". Test results are valid for the sample specified above and may not represent the lot to which the sample belongs. Descriptive information in the test report that affects the validity of the results was declared by the customer. Our laboratory is not responsible for the accuracy of this information or any losses/legal obligations arising from its use. Decision Rule: The customer requested that the conformity statement be given without including measurement uncertainty. For microbiological analyses, the decision rule for conformity assessment is applied without considering measurement uncertainty.",
        page: "Page",
        challengeResults: "*PRESERVATIVE EFFICACY TEST RESULTS",
        protocolLabel: "Protocol:",
        protocol:
          "The test includes preparing the appropriate microorganisms at specified inoculum levels and counting them after inoculation into the sample at defined time intervals. Under the test conditions, the adequacy of the product's preservative efficacy is determined by observing whether there is a significant decrease or increase in the number of microorganisms inoculated into the sample on days 7, 14 and 28.",
        parameter: "Parameter",
        inoculation: "Inoculation (Cfu) N",
        sampleCount: "Sample Count cfu/g",
        reduction: "Reduction (Log)",
        limits: "LIMITS",
        microorganism: "Microorganism",
        samplingTime: "Sampling Time",
        criterionA: "Criterion A",
        criterionB: "Criterion B",
        criteriaNoteA: "a. The acceptable deviation in this test is considered 0.5 log.",
        criteriaNoteB: "b. NI: No increase in count from the previous inoculation period.",
        criteriaNoteC: "c. When lgNₒ = lgNₓ, Rₓ = 0 (no increase after the initial count).",
        evaluation: "EVALUATION",
        finalEvaluation:
          "The tested sample meets the preservative efficacy requirements according to the limits specified in ISO 11930:2019/Amd 1:2022. Test result:",
        end: "* End of Report *",
      }
    : {
        reportTitle: "DENEY RAPORU",
        annexTitle: "DENEY RAPORU - EK.1",
        reportNo: "Rapor No - Rev. No:",
        acceptanceDate: "Numune Kabul Tarihi:",
        issueDate: "Rapor Yayın Tarihi:",
        customerInfo: "MÜŞTERİ BİLGİLERİ",
        sampleInfo: "NUMUNE BİLGİLERİ",
        quantity: "Miktar:",
        productionDate: "Üretim Tarihi:",
        expiryDate: "Son Kullanım Tarihi:",
        lotNo: "Seri/Lot No/Ürün Kodu:",
        testResults: "TEST SONUÇLARI",
        analysisName: "Analiz Adı",
        method: "Metot",
        result: "Sonuç",
        assessment: "Değerlendirme",
        preservativeTest: "*Koruyucu Etkinlik Testi",
        seeAnnex: "Bkz. Ek-1",
        explanations: "AÇIKLAMALAR",
        period: "Analiz Periyodu:",
        explanation:
          "Müşteri talebi doğrultusunda yapılan stabilite çalışması ilgili kozmetik ürün stabilite gerekliliklerine göre değerlendirilmiştir.",
        revisionNote: "Revizyon Açıklaması:",
        preparedBy: "Raporu Hazırlayan",
        approvedBy: "Onaylayan",
        signed: "E-İmzalıdır",
        reporter: "Raportör",
        manager: "Laboratuvar Müdürü V.",
        qrAlt: "Rapor Doğrulama Karekodu",
        qrTitle: "Rapor doğrulama",
        codeTitle: "Doğrulama Kodu — manuel doğrulamada bu kod kullanılır",
        footerNote:
          "“*” işaretli analizler TÜRKAK tarafından TS EN ISO/IEC 17025'e göre akredite kapsamımızda yer almaktadır.Numune alma işlemi tarafımızdan yapılmamıştır. İmzasız ve mühürsüz Deney Raporları geçersizdir. " +
          sirketAdi +
          "'nin yazılı izni olmadan bu Analiz Raporu kısmen kopyalanamaz, çoğaltılamaz veya herhangi bir başka amaçla kullanılamaz.Test sonuçları, yukarıda belirtilen numune için geçerlidir. Numunenin ait olduğu lotu temsil etmeyebilir.Deney raporunda yer alan ve sonuçların geçerliliğini etkileyen tanımsal bilgiler müşteri tarafından beyan edilmiştir. Bu bilgilerin doğruluğundan ve kullanımına bağlı oluşabilecek tüm kayıplardan/yasal zorunluluklardan laboratuvarımız sorumlu değildir. Karar Kuralı: Müşteri, “Ölçüm belirsizliği dahil edilmeden” uygunluk beyanı verilmesini istediğini belirtmiştir. Mikrobiyolojik analizler için uygunluk değerlendirilmesine ilişkin karar kuralı, ölçüm belirsizliği dikkate alınmaksızın uygulanır.",
        page: "Sayfa",
        challengeResults: "*KORUYUCU ETKİNLİK TESTİ SONUÇLARI",
        protocolLabel: "Protokol:",
        protocol:
          "Test, uygun mikroorganizmaların belirli inokulum seviyelerinde hazırlanması ve belirli zaman aralıklarında numuneye bu mikroorganizmalardan ekim yapılarak sayılmasını kapsar. Test koşulları içinde 7. , 14. ve 28. günlerde numuneye ekim yapılan mikroorganizma sayısında belirgin bir düşüş veya artışın gözlenip gözlenmediğine bakılarak ürünün koruyucu özelliğinin yeterliliğine karar verilir.",
        parameter: "Parametre",
        inoculation: "İnokülasyon (Cfu) N",
        sampleCount: "Numune Sayımı kob/g",
        reduction: "Düşüş (Log)",
        limits: "LİMİTLER",
        microorganism: "Mikroorganizma",
        samplingTime: "Örnekleme Süresi",
        criterionA: "Kriter A",
        criterionB: "Kriter B",
        criteriaNoteA: "a. Bu testte kabul edilebilir sapma 0,5 log kabul edilir.",
        criteriaNoteB: "b. NI : Önceki ekim süresinden itibaren sayımda artış yok.",
        criteriaNoteC: "c. lgNₒ = lgNₓ   olduğunda  Rₓ =0  (başlangıç sayımından sonra artış yok).",
        evaluation: "DEĞERLENDİRME",
        finalEvaluation:
          "Test edilen numune, ISO 11930:2019/Amd 1:2022 standardında belirtilen limitlere göre koruyucu etkinlik gerekliliklerini sağlamaktadır. Test sonucu:",
        end: "* Rapor Sonu *",
      };

  // Stabilite verisi: kalıcı kayıt (meta.stabiliteVeri) varsa onu, yoksa
  // örnek rapordan türetilmiş varsayılanı kullan. (Giriş ekranı 2. adımda.)
  const veri: StabiliteVeri = ((meta as any)?.stabiliteVeri as StabiliteVeri) || DEFAULT_STABILITE_VERI;

  // Test raporunda DAİMA dış kod gösterilir (ÜGAM/RR26/XXXX/NN — Challenge için RR=CH).
  // DisKod yoksa (eski kayıt / migration 018 koşulmamış) iç koda düş.
  const revNum = parseInt(revNo, 10) || 0;
  const raporKodu = onay?.disRaporKodu
    ? disRaporLabel(onay.disRaporKodu, revNum)
    : `${header.RaporNo} / ${revNo}`;

  // Bu rapora dahil edilen analizlerden en az biri akredite mi?
  // Akredite analiz yoksa TÜRKAK logosu ve sağdaki 3-satırlık kutu gizlenir.
  const hasAkredite =
    veri.testler.some((t) => t.akredite) ||
    hizmetler.some((h) => String(h.Akreditasyon || "").trim().toLowerCase() === "var");

  // .akredite-box hücreleri SABIT 20mm × 8mm. AB-2015-T ve MM-YY normal boyutta
  // kalır; SADECE rapor kodu hücresi uzunsa font küçültülür — kutuya dokunulmaz.
  const _kodLen = raporKodu.length;
  const akrKodFontSize =
    _kodLen <= 10 ? 10.5 : _kodLen <= 14 ? 8.5 : _kodLen <= 18 ? 7 : 6;

  return (
    <>
      <style>{`
        @page { size: A4; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .root {
          /* ── Tasarım belirteçleri (tek noktadan yönetim) ── */
          --ink:        #141414;  /* birincil metin */
          --ink-strong: #000000;  /* başlık / vurgu */
          --ink-soft:   #555555;  /* ikincil metin */
          --ink-faint:  #8a8a8a;  /* tarih / üçüncül */
          --rule:       #000000;  /* tam çizgiler */
          --rule-soft:  #dcdcdc;  /* ince ayraçlar */
          --accent:     #4A46E5;  /* e-imza */
          --accent-bg:  #eef0fd;
          --accent-bd:  #c7c9f5;

          /* Gövde metinleri TT Interphases Pro, teknik/başlık alanları JetBrains Mono. */
          font-family: var(--font-tt-interphases), var(--font-rapor), 'JetBrains Mono', 'Cascadia Mono', Consolas, 'Courier New', monospace;
          background: #e9ecef;
          color: var(--ink);
          font-size: 10px;
          line-height: 1.5;
          letter-spacing: 0;
          font-variant-ligatures: none;
          -webkit-font-smoothing: antialiased;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          min-height: 100vh;
        }
        .page {
          max-width: 210mm;
          min-height: 296mm;
          margin: 24px auto;
          background: #fff;
          padding: 8mm;
          box-shadow: 0 4px 24px rgba(0,0,0,0.08);
          display: flex;
          flex-direction: column;
        }
        .page.break { page-break-after: always; }
        .report-title,
        .akredite-box td,
        .meta-table strong,
        .info-table th,
        .results-title,
        .results thead th,
        .notlar-title,
        .approval-cell-title,
        .approval-name,
        .endof {
          font-family: var(--font-rapor), 'JetBrains Mono', 'Cascadia Mono', Consolas, 'Courier New', monospace;
        }

        /* ───── HEADER ───── */
        .header {
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: center;
          gap: 16mm;
          padding-bottom: 4mm;
        }
        .header-logo img {
          width: 84mm;
          height: auto;
          object-fit: contain;
        }
        .header-akredite img {
          height: 30mm;
          width: auto;
          object-fit: contain;
          transform: translateX(9px);
        }

        /* ───── DENEY RAPORU BAŞLIK ───── */
        .title-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .report-title {
          font-size: 26px;
          font-weight: 800;
          letter-spacing: -0.04em;
          color: var(--ink-strong);
        }
        .akredite-box {
          border-collapse: collapse;
          width: 20mm;
          table-layout: fixed;
        }
        .akredite-box td {
          border: 1px solid var(--rule);
          width: 20mm;
          height: 8mm;
          text-align: center;
          vertical-align: middle;
          font-size: 10.5px;
          letter-spacing: -0.02em;
          padding: 0 1px;
          overflow: hidden;
          word-break: break-all;
          line-height: 1.1;
        }
        .akredite-box .akredite-code-cell {
          font-family: var(--font-tt-interphases), var(--font-rapor), 'JetBrains Mono', 'Cascadia Mono', Consolas, 'Courier New', monospace !important;
          letter-spacing: 0 !important;
          font-size: var(--akr-code-font-size) !important;
        }

        /* ───── ÜST META BAR (Rapor No/Rev · Kabul · Yayın) ───── */
        .meta-box {
          display: grid;
          grid-template-columns: 1fr 1fr;
          margin-top: 2mm;
          font-size: 10.5px;
        }
        .meta-table {
          font-size: 10.5px;
          letter-spacing: 0;
          margin-top: 6mm;
        }
        .meta-table strong { font-weight: 700; }

        /* ───── MÜŞTERİ / NUMUNE TABLOSU (2 sütun) ───── */
        .info-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 5mm;
          font-size: 10px;
        }
        .info-table th {
          background: #ffffff;
          color: var(--ink-strong);
          font-size: 11.5px;
          letter-spacing: -0.03em;
          font-weight: 700;
          text-align: left;
          width: 55%;
          padding-bottom: 3px;
          border-bottom: 1px solid var(--rule-soft);
        }
        .info-table td {
          vertical-align: top;
          line-height: 1.6;
          padding-top: 3px;
        }
        .info-table .firma-ad {
          font-size: 11px;
          font-weight: 600;
          padding-top: 5px;
          letter-spacing: 0;
        }
        .info-table .info-line {
          color: var(--ink);
          font-size: 9.5px;
          letter-spacing: 0;
        }

        /* ───── TEST SONUÇLARI SECTION ───── */
        .results-section {
          margin-top: 5mm;
        }
        .results-title {
          color: var(--ink-strong);
          font-size: 11.5px;
          font-weight: 700;
          text-align: left;
          letter-spacing: -0.03em;
          padding-bottom: 3px;
          border-bottom: 1px solid var(--rule-soft);
        }
        .results-subtitle {
          font-size: 9.5px;
          color: var(--ink);
          padding-top: 4px;
          padding-bottom: 10px;
          letter-spacing: 0;
        }
        .results {
          border-collapse: collapse;
          width: 100%;
          margin-top: 3mm;
        }
        .results tr:last-child td {
          padding-bottom: 7px;
          border-bottom: 1.5px solid var(--rule);
        }
        .results thead th {
          background: #ffffff;
          font-weight: 600;
          color: var(--ink-strong);
          padding-top: 6px;
          padding-bottom: 6px;
          border-bottom: 2px solid var(--rule);
          text-align: left;
          font-size: 10.5px;
          letter-spacing: -0.03em;
        }
        .results tbody td {
          padding-top: 7px;
          padding-bottom: 6px;
          vertical-align: middle;
          font-size: 10px;
          text-align: left;
          letter-spacing: 0;
          border-bottom: 1px solid var(--rule-soft);
          font-family: var(--font-tt-interphases);
        }
        .results tbody td.center { text-align: left; }
        .results tbody td.muted { color: var(--ink-soft); font-size: 8.5px; }
        .results tbody td.bold { font-weight: 700; }
        .deg-gecer { color: var(--ink-strong); font-weight: 700; text-align: center; letter-spacing: 0.02em; }
        .deg-kaldi { color: var(--ink-strong); font-weight: 700; text-align: center; letter-spacing: 0.02em; }
        .deg-other { color: var(--ink-strong); font-weight: 700; text-align: center; }

        /* ───── NOTLAR / AÇIKLAMALAR ───── */
        .notlar {
          margin-top: 5mm;
          font-size: 9px;
          color: var(--ink);
          line-height: 1.55;
        }
        .notlar-title {
          color: var(--ink-strong);
          font-size: 11.5px;
          font-weight: 700;
          letter-spacing: -0.03em;
        }
        .notlar-body {
        }
        .notlar-body p { margin-bottom: 4px; }
        .notlar-body p:last-child { margin-bottom: 0; }
        .notlar-body .legend {
          font-weight: 700;
          color: var(--ink);
        }

        /* ───── ONAY BLOĞU ───── */
        .approval-block {
          margin-top: auto;
          padding-top: 10mm;
          display: grid;
          grid-template-columns: 1fr 1fr 1fr 1fr;
          gap: 6mm;
          align-items: end;
        }
        .approval-cell {
          min-height: 28mm;
          display: flex;
          flex-direction: column;
        }
        .approval-cell-title {
          color: var(--ink-strong);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: -0.03em;
          text-align: left;
        }
        .approval-cell-body {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: flex-start;
          padding: 5px;
          text-align: left;
        }
        .e-imza-pill {
          display: inline-flex;
          align-items: center;
          width: fit-content;
          gap: 4px;
          background: var(--accent-bg);
          color: var(--accent);
          border: 1px solid var(--accent-bd);
          padding: 2px 9px;
          border-radius: 999px;
          font-size: 9px;
          font-weight: 600;
          letter-spacing: -0.01em;
        }
        .approval-name {
          font-weight: 700;
          font-size: 10px;
          letter-spacing: 0;
          margin-top: 2mm;
          text-align: left;
          width: 100%;
        }
        .approval-date {
          font-size: 8.5px;
          color: var(--ink-faint);
          margin-top: 1px;
        }
        .approval-role {
          font-size: 9px;
          color: var(--ink-soft);
          margin-top: 1px;
        }

        /* ───── FOOTER ───── */
        .footer {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          font-size: 9px;
          color: var(--ink-soft);
          margin-top: 4mm;
          padding-top: 3mm;
        }

        .FooterNot {
          font-size: 8px;
          line-height: 1.3;
          color: var(--ink-soft);
          text-align: justify;
        }

        .endof {
          padding-top: 10mm;
          font-weight: 800;
          font-size: 10px;
          letter-spacing: 0.04em;
          text-align: center;
        }

        /* ───── ALT BİLGİ (genel kapsayıcı) ───── */
        .rapor-altbilgi {
          width: 100%;
          font-size: 8.5px;
          color: var(--ink-soft);
          padding-top: 7px;
          position: relative;
          box-sizing: border-box;
          font-family: var(--font-tt-interphases), var(--font-rapor), 'JetBrains Mono', 'Cascadia Mono', Consolas, 'Courier New', monospace;
        }
        .sirket-bilgisi {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 8px;
          text-align: left;
          font-size: 8px;
          margin-bottom: 4px;
          line-height: 1.2;
          white-space: nowrap;
        }
        .sirket-bilgisi span {
          text-align: right;
        }
        .dokuman-bilgisi {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }
        .sol-alt {
          text-align: left;
          font-size: 8px;
        }
        .sag-alt {
          text-align: right;
          font-weight: 700;
        }

         .endof {
          padding-top: 10mm;
          font-weight: 800;
          font-size: 10px;
          letter-spacing: 0.04em;
          text-align: center;
        }

        @media print {
          body { background: #fff; }
          html, body {
            margin: 0;
            padding: 0;
            min-height: 0;
            height: auto;
            overflow: visible;
          }
          .root {
            min-height: 0;
            background: #fff;
          }
          .onay-toolbar,
          button,
          input,
          textarea,
          select {
            display: none !important;
          }
          /* HER SAYFA SABIT A4: height 297mm + overflow:hidden — alt bilgi
             satırı (Sayfa No vb.) bir sonraki yaprağa atmaz. EK-1 sayfası
             page.break ile zorlanır. (Genel tasarımındaki page-break-after:avoid
             KOPYALANMAZ — 2 sayfalı yapıyı bozardı.) */
          .page {
            width: 210mm; max-width: 210mm;
            height: 296mm; min-height: 296mm; max-height: 296mm;
            margin: 0 auto; box-shadow: none; padding: 8mm;
            overflow: hidden;
            page-break-inside: avoid;
          }
          .page.break { page-break-after: always; }
        }
      `}</style>

      <div className={`root ${ttInterphases.variable} ${jetbrains.variable}`}>
        <OnayToolbar
          nkrId={nkrId}
          format={format}
          initialOnay={onay}
          raporNo={header.RaporNo}
          sampleName={header.Numune_Adi}
          sampleNameEn={header.Numune_Adi_En}
        />

        {/* ═══════════════════════════════════════════════════════════
            SAYFA 1 — GENEL FORMAT TASARIMI
            ═══════════════════════════════════════════════════════════ */}
        <div className="page break">
          <HeaderBlock title={text.reportTitle} text={text} showAkredite={hasAkredite} raporKodu={raporKodu} kabulTarihi={kabulTarihi} yayinTarihi={yayinTarihi} akrKodFontSize={akrKodFontSize} />

          {/* ───── MÜŞTERİ / NUMUNE BİLGİLERİ (2 sütun) ───── */}
          <table className="info-table" style={{ marginTop: 20 }}>
            <thead>
              <tr>
                <th>{text.customerInfo}</th>
                <th>{text.sampleInfo}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div className="firma-ad">{header.FirmaAd || "—"}</div>
                  <div className="info-line" style={{ width: "90%" }}>{header.FirmaAdres}</div>
                  <div className="info-line">{header.FirmaYetkili || "—"}</div>
                  <div className="info-line">{header.FirmaEmail}</div>
                </td>
                <td>
                  <div className="firma-ad">{isEnglish ? header.Numune_Adi_En || header.Numune_Adi : header.Numune_Adi}</div>
                  {(header.TesteMiktar || header.TesteMiktarBirim) && (
                    <div className="info-line">
                      <span className="info-label">{text.quantity} </span>
                      {header.TesteMiktar} {translateReportUnit(header.TesteMiktarBirim, isEnglish)}
                    </div>
                  )}
                  <div className="info-line"><span className="info-label">{text.productionDate} </span>{String(header.UretimTarihi || "—")}</div>
                  <div className="info-line"><span className="info-label">{text.expiryDate} </span>{String(header.SKT || "—")}</div>
                  <div className="info-line"><span className="info-label">{text.lotNo} </span>{header.SeriNo || "—"}</div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* ───── TEST SONUÇLARI ───── */}
          <div className="results-section" style={{ marginTop: 30 }}>
            <div className="results-title">{text.testResults}</div>
            <div className="notlar-body"> </div>
            <table className="results">
              <thead>
                <tr>
                  <th style={{ width: 120 }}>{text.analysisName}</th>
                  <th style={{ width: 150, paddingLeft: 5 }}>{text.method}</th>
                  <th style={{ width: 70 }}>{text.result}</th>
                  <th style={{ width: 100, textAlign: "center" }}>{text.assessment}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ paddingRight: 10 }}>{isEnglish ? "*Stability Test" : "*Stabilite Testi"}</td>
                  <td className="center" style={{ paddingLeft: 5 }}>
                    {veri.gunler.length
                      ? `${Math.max(...veri.gunler)} ${isEnglish ? "days (accelerated)" : "günlük (hızlandırılmış)"}`
                      : "-"}
                  </td>
                  <td className="center">{text.seeAnnex}</td>
                  <td className="deg-gecer" style={{ textAlign: "center" }}>{degerlendirmeLabel("Uygun", isEnglish).text}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ───── NOTLAR ───── */}
          <div className="notlar">
            <div className="results-title" style={{ marginBottom: "7px" }}>{text.explanations}</div>
            {testBaslangic && testBitis ? (
              <>
                {text.period}{" "}
                <strong>{fmtTarih(testBaslangic)} - {fmtTarih(testBitis)}</strong>{" "}
              </>
            ) : null}
            <br />{text.explanation}
            {revizeNot && (
              <div style={{ marginTop: 8, fontWeight: "bold" }}>
                <br />{text.revisionNote} {revizeNot}
              </div>
            )}
          </div>

          {/* ───── İMZA BLOĞU ───── */}
          <ApprovalBlock hazirlayanAd={hazirlayanAd} karekod={karekod} text={text} />

          {/* ───── FOOTER NOTU ───── */}
          <div className="FooterNot">
            {text.footerNote}
          </div>

          <div style={{ marginTop: "10px" }}></div>

          {/* ───── ALT BİLGİ ───── */}
          <div className="rapor-altbilgi">
            <div className="sirket-bilgisi">
              <strong>UNIQUE ANALİZ BELGELENDİRME ve GÖZETİM HİZMETLERİ LTD. ŞTİ.</strong>
              <span>Atatürk Mah. Hadımköy Yolu Cad. No:10 İç Kapı No:7 Esenyurt / İstanbul | info@uniqueanalyse.com</span>
            </div>

            <div className="dokuman-bilgisi">
              <div className="sol-alt">
                Ek-1.PR.20/Rev.02/12.06.2026
              </div>
              <div className="sag-alt">
                {text.page}: 1 / 2
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            SAYFA 2 — CHALLENGE TABLOLARI (EK.1)
            ═══════════════════════════════════════════════════════════ */}
        <div className="page">
          <HeaderBlock title={text.annexTitle} text={text} showAkredite={hasAkredite} showAkrediteLogo={false} akrediteInHeader showKabulTarihi={false} raporKodu={raporKodu} kabulTarihi={kabulTarihi} yayinTarihi={yayinTarihi} akrKodFontSize={akrKodFontSize} />

          <div className="results-section">
            {veri.gunler.map((g) => (
              <div key={g} style={{ marginBottom: 16 }}>
                <div className="results-title">{g}. {isEnglish ? "Day Results" : "Gün Sonuçları"}</div>
                <table className="limit-table" style={{ width: "100%", marginTop: 8, borderCollapse: "collapse", tableLayout: "auto", fontSize: "8.5px", lineHeight: 1.15 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", verticalAlign: "middle", borderBottom: "1px solid #000", padding: "3px 5px" }}>{isEnglish ? "Analysis" : "Analiz"}</th>
                      <th style={{ textAlign: "center", verticalAlign: "middle", borderBottom: "1px solid #000", padding: "3px 4px" }}>{isEnglish ? "Unit" : "Birim"}</th>
                      <th style={{ textAlign: "left", verticalAlign: "middle", borderBottom: "1px solid #000", padding: "3px 5px" }}>{isEnglish ? "Method" : "Metot"}</th>
                      <th style={{ textAlign: "center", verticalAlign: "middle", borderBottom: "1px solid #000", padding: "3px 4px" }}>Limit</th>
                      {veri.sicakliklar.map((s) => (
                        <th key={s} style={{ textAlign: "center", verticalAlign: "middle", borderBottom: "1px solid #000", borderLeft: "1px solid #ccc", padding: "3px 4px" }}>{s}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {veri.testler.map((t, i) => (
                      <tr key={i} style={{ textAlign: "center" }}>
                        <td style={{ border: "1px solid #ccc", borderLeft: "none", textAlign: "left", padding: "3px 5px" }}>{t.akredite ? "*" : ""}{isEnglish ? (t.adEn || translateStabilityAnalysisName(t.ad, true)) : t.ad}</td>
                        <td style={{ border: "1px solid #ccc", padding: "3px 4px" }}>{isEnglish ? (t.birimEn || translateStabilityText(t.birim, true)) : (t.birim || "-")}</td>
                        <td style={{ border: "1px solid #ccc", textAlign: "left", padding: "3px 5px" }}>{isEnglish ? (t.metotEn || translateStabilityText(t.metot, true)) : (t.metot || "-")}</td>
                        <td style={{ border: "1px solid #ccc", padding: "3px 4px" }}>{isEnglish ? (t.limitEn || translateStabilityText(t.limit, true)) : (t.limit || "-")}</td>
                        {veri.sicakliklar.map((s) => (
                          <td key={s} style={{ border: "1px solid #ccc", borderLeft: "1px solid #ccc", padding: "3px 4px" }}>
                            {isEnglish
                              ? (t.sonuclarEn?.[`${g}|${s}`] || translateStabilityText(t.sonuclar?.[`${g}|${s}`], true) || "-")
                              : (t.sonuclar?.[`${g}|${s}`] || "-")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          <div className="results-title" style={{ marginTop: "20px" }}>{isEnglish ? "EVALUATION" : "DEĞERLENDİRME"}</div>
          <p>{isEnglish ? (veri.degerlendirmeEn || translateStabilityEvaluation(veri.degerlendirme, true)) : veri.degerlendirme}</p>

          {/* ───── İMZA BLOĞU (2 hücre: Raporu Hazırlayan · Onaylayan) ─────  */}
          <div className="endof">{text.end}</div>
 

<div className="approval-cell-title" style={{marginTop: "auto", display: "flex", justifyContent: "flex-end" }}>
          <img src="/unique-seal.png" alt="UNIQUE ANALYSE" style={{ width: 80 }} />
        </div>
 {/* ───── ALT BİLGİ ───── */}
          <div className="footer" style={{ marginTop: "auto" }}>

          <div className="rapor-altbilgi">
            <div className="sirket-bilgisi">
              <strong>UNIQUE ANALİZ BELGELENDİRME ve GÖZETİM HİZMETLERİ LTD. ŞTİ.</strong>
              <span>Atatürk Mah. Hadımköy Yolu Cad. No:10 İç Kapı No:7 Esenyurt / İstanbul | info@uniqueanalyse.com</span>
            </div>

            <div className="dokuman-bilgisi">
              <div className="sol-alt">
                Ek-1.PR.20/Rev.02/12.06.2026
              </div>
              <div className="sag-alt">
                {text.page}: 2 / 2
              </div>
            </div>
          </div>
        </div>



        </div>
      </div>
    </>
  );
}
