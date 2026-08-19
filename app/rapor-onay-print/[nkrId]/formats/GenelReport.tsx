import { Fragment } from "react";
import { JetBrains_Mono } from "next/font/google";
import { ttInterphases } from "@/app/fonts/reportFonts";
import OnayToolbar from "../OnayToolbar";
import type { ReportFormatProps } from "../reportTypes";
import { disRaporLabel } from "@/lib/disKod";
import { isEnglishFormat, translateReportUnit } from "./reportLocale";

type ResultDisplayRow =
  | { kind: "main"; serviceIndex: number; service: ReportFormatProps["hizmetler"][number] }
  | {
      kind: "alt";
      serviceIndex: number;
      altIndex: number;
      alt: NonNullable<ReportFormatProps["hizmetler"][number]["altParametreler"]>[number];
    };

const jetbrains = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-rapor",
});

function splitIntoWeightedPages<T>(rows: T[], maxWeightPerPage: number, getWeight: (row: T) => number): T[][] {
  if (rows.length === 0) return [];

  const pages: T[][] = [];
  let current: T[] = [];
  let currentWeight = 0;

  for (const row of rows) {
    const weight = Math.max(1, getWeight(row));
    if (current.length > 0 && currentWeight + weight > maxWeightPerPage) {
      pages.push(current);
      current = [];
      currentWeight = 0;
    }
    current.push(row);
    currentWeight += weight;
  }

  if (current.length > 0) pages.push(current);
  return pages;
}

function wrapWeight(value: unknown, charsPerLine: number): number {
  const text = nonEmpty(value).replace(/\s+/g, " ");
  if (!text || text === "-") return 1;
  return Math.max(1, Math.ceil(text.length / charsPerLine));
}

function fmtTarih(s: string | null | undefined): string {
  if (!s) return "—";
  const v = String(s);
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return v.slice(0, 10);
}

// DD.MM.YYYY → MM-YY (eşleşmezse olduğu gibi döner)
function toMMYY(s: string): string {
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return s;
  return `${m[2]}-${m[3].slice(2)}`;
}

// Test sonucu değerlendirme metnine göre etiket
function degerlendirmeLabel(d: string | null, english = false): { text: string; cls: string } {
  if (!d || !d.trim()) return { text: "—", cls: "deg-other" };
  const v = d.trim();
  if (english) {
    if (v === "Pass" || v === "Uygun") return { text: "PASS", cls: "deg-gecer" };
    if (v === "Fail" || v === "Uygun Değil") return { text: "FAIL", cls: "deg-kaldi" };
    if (v === "N/A" || v === "D.Y." || v === "Değerlendirilemez") return { text: "N/A", cls: "deg-other" };
    return { text: v, cls: "deg-other" };
  }
  if (v === "Uygun") return { text: "UYGUN", cls: "deg-gecer" };
  if (v === "Uygun Değil") return { text: "UYGUN DEĞİL", cls: "deg-kaldi" };
  if (v === "Değerlendirilemez" || v === "D.Y.") return { text: "D.Y.", cls: "deg-other" };
  return { text: v, cls: "deg-other" };
}

function nonEmpty(value: unknown): string {
  return String(value ?? "").trim();
}

export default function GenelReport({
  nkrId,
  format,
  header,
  hizmetler,
  testBaslangic,
  testBitis,
  onay,
  meta,
  karekod,
  edit,
  hideToolbar,
}: ReportFormatProps) {
  const editing = Boolean(edit);
  const isEnglish = isEnglishFormat(nonEmpty(format));
  const text = isEnglish
    ? {
        reportTitle: "TEST REPORT",
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
        testResultsContinued: "TEST RESULTS (CONTINUED)",
        analysisName: "Analysis Name",
        unit: "Unit",
        result: "Result",
        uncertainty: "M.U.",
        method: "Method",
        limit: "Limit",
        assessment: "Assessment",
        emptyRows: "No services were found for this report format.",
        addRow: "+ Add Row",
        notes: "EXPLANATIONS",
        period: "Analysis Period:",
        revisionNote: "Revision Note:",
        end: "* End of Report *",
        preparedBy: "Prepared By",
        approvedBy: "Approved By",
        signed: "E-Signed",
        reporter: "Reporter",
        manager: "D. Laboratory Manager",
        page: "Page",
        continued: "continued",
        qrAlt: "Report Verification QR Code",
        qrTitle: "Report verification",
        codeTitle: "Verification Code - this code is used for manual verification",
        defaultExplanation: "Test results were evaluated according to customer specification.",
        editPlaceholder: "Explanation text - if left blank, the default sentence is used.",
        footerNote:
          "\"*\" marked analyses are accredited by TURKAK according to TS EN ISO/IEC 17025. Sampling was not performed by our laboratory. Test Reports without signature and seal are invalid. This Analysis Report may not be partially copied, reproduced or used for any other purpose without the written permission of " +
          meta.sirketAdi +
          ". Test results are valid for the sample specified above and may not represent the lot to which the sample belongs. Descriptive information in the test report that affects the validity of the results was declared by the customer. Our laboratory is not responsible for the accuracy of this information or any losses/legal obligations arising from its use. Decision Rule: The customer requested that the conformity statement be given without including measurement uncertainty. For microbiological analyses, the decision rule for conformity assessment is applied without considering measurement uncertainty.",
      }
    : {
        reportTitle: "DENEY RAPORU",
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
        testResultsContinued: "TEST SONUÇLARI (DEVAM)",
        analysisName: "Analiz Adı",
        unit: "Birim",
        result: "Sonuç",
        uncertainty: "Ö.B.",
        method: "Metot",
        limit: "Limit",
        assessment: "Değerlendirme",
        emptyRows: "Bu rapor formatına ait hizmet bulunamadı.",
        addRow: "+ Satır Ekle",
        notes: "AÇIKLAMALAR",
        period: "Analiz Periyodu:",
        revisionNote: "Revizyon Açıklaması:",
        end: "* Rapor Sonu *",
        preparedBy: "Raporu Hazırlayan",
        approvedBy: "Onaylayan",
        signed: "E-İmzalıdır",
        reporter: "Raportör",
        manager: "Laboratuvar Müdürü V.",
        page: "Sayfa",
        continued: "devam",
        qrAlt: "Rapor Doğrulama Karekodu",
        qrTitle: "Rapor doğrulama",
        codeTitle: "Doğrulama Kodu — manuel doğrulamada bu kod kullanılır",
        defaultExplanation: "Test sonuçları müşteri spesifikasyonuna göre değerlendirilmiştir.",
        editPlaceholder: "Açıklama metni — boş bırakılırsa varsayılan cümle kullanılır.",
        footerNote:
          "“*” işaretli analizler TÜRKAK tarafından TS EN ISO/IEC 17025'e göre akredite kapsamımızda yer almaktadır.Numune alma işlemi tarafımızdan yapılmamıştır. İmzasız ve mühürsüz Deney Raporları geçersizdir. " +
          meta.sirketAdi +
          "'nin yazılı izni olmadan bu Analiz Raporu kısmen kopyalanamaz, çoğaltılamaz veya herhangi bir başka amaçla kullanılamaz.Test sonuçları, yukarıda belirtilen numune için geçerlidir. Numunenin ait olduğu lotu temsil etmeyebilir.Deney raporunda yer alan ve sonuçların geçerliliğini etkileyen tanımsal bilgiler müşteri tarafından beyan edilmiştir. Bu bilgilerin doğruluğundan ve kullanımına bağlı oluşabilecek tüm kayıplardan/yasal zorunluluklardan laboratuvarımız sorumlu değildir. Karar Kuralı: Müşteri, “Ölçüm belirsizliği dahil edilmeden” uygunluk beyanı verilmesini istediğini belirtmiştir. Mikrobiyolojik analizler için uygunluk değerlendirilmesine ilişkin karar kuralı, ölçüm belirsizliği dikkate alınmaksızın uygulanır.",
      };
  const {
    revNo,
    revizeNot,
    kabulTarihi,
    yayinTarihi,
    hazirlayanAd,
    hazirlayanUnvan,
    onaylayanAd,
    onaylayanUnvan,
    docKodu,
    sirketAdi,
  } = meta;

  // Test raporunda DAİMA dış kod gösterilir (ÜGAM/RR26/XXXX/NN).
  // DisKod yoksa (eski kayıt / migration 018 koşulmamış) iç koda düş.
  const revNum = parseInt(revNo, 10) || 0;
  const raporKodu = onay?.disRaporKodu
    ? disRaporLabel(onay.disRaporKodu, revNum)
    : `${header.RaporNo} / ${revNo}`;

  // Bu rapora dahil edilen analizlerden en az biri akredite mi?
  // Akredite analiz yoksa TÜRKAK logosu ve sağdaki 3-satırlık kutu gizlenir.
  const hasAkredite = hizmetler.some(
    (h) => String(h.Akreditasyon || "").trim().toLowerCase() === "var"
  );

  // .akredite-box hücreleri SABIT 20mm × 8mm. AB-2015-T ve MM-YY normal boyutta
  // kalır; SADECE rapor kodu hücresi uzunsa font küçültülür — kutuya dokunulmaz.
  const _kodLen = raporKodu.length;
  const akrKodFontSize =
    _kodLen <= 10 ? 10.5 : _kodLen <= 14 ? 8.5 : _kodLen <= 18 ? 7 : 6;

  // AÇIKLAMALAR serbest metni — düzenleme ekranından girilir (header.Aciklamalar).
  // Girilmemişse varsayılan cümleye düşer. Satır sonları korunur.
  const aciklamaText =
    (header.Aciklamalar ?? "").trim() ||
    text.defaultExplanation;
  const aciklamaSatirlar = aciklamaText.split(/\r?\n/);
  const documentCode = docKodu || "Ek-1.PR.20/Rev.02/12.06.2026";

  const resultRows: ResultDisplayRow[] = hizmetler.flatMap((h, serviceIndex) => {
    const rows: ResultDisplayRow[] = [{ kind: "main", serviceIndex, service: h }];
    for (const [altIndex, alt] of (h.altParametreler || []).entries()) {
      rows.push({ kind: "alt", serviceIndex, altIndex, alt });
    }
    return rows;
  });
  const resultRowWeight = (row: ResultDisplayRow): number => {
    if (row.kind === "alt") {
      const resultWeight = wrapWeight(isEnglish ? row.alt.SonucEn || row.alt.Sonuc : row.alt.Sonuc, 18);
      const limitWeight = wrapWeight(isEnglish ? row.alt.LimitEn || row.alt.Limit : row.alt.Limit, 22);
      return Math.max(1, resultWeight, limitWeight);
    }

    const h = row.service;
    const resultWeight = wrapWeight(isEnglish ? h.SonucEn || h.Sonuc : h.Sonuc, 18);
    const methodWeight = wrapWeight(isEnglish ? h.MetotEn || h.Metot : h.Metot, 22);
    const limitWeight = wrapWeight(isEnglish ? h.LimitEn || h.LimitDeger : h.LimitDeger, 22);
    return Math.max(1, resultWeight, methodWeight, limitWeight);
  };
  // ═══════════════════════ UZUN RAPOR BÖLME KURALLARI ═══════════════════════
  // Bu kurallar TÜM uzun raporlarda (Genel/GenelEn) tutarlı uygulanır:
  //
  // 1) FOOTER'lar sayfa tipine göre AYRI ve NET (footer'lara dokunulmaz):
  //    • İlk sayfa footer'ı (page1-footer, pinned): Hazırlayan + Onaylayan imza,
  //      seal, QR kod, FooterNot (dipnot), doküman footer (firma/adres/dok no/sayfa).
  //    • Devam sayfaları footer'ı (pinned): sağ altta seal + doküman footer
  //      (firma/adres/dok no/sayfa). İmza/QR/dipnot YOK.
  //
  // 2) Analiz tablosu (ve altındaki AÇIKLAMALAR) footer'a TEMAS ETMEDEN bölünür:
  //    Her sayfada footer'a ayrılmış sabit alan (main-page/continuation padding-bottom)
  //    bir "padding tamponu" oluşturur; uzun Sonuç/Limit/Metot metinleri daha yüksek
  //    ağırlık sayılır → tablo imza/QR başlıklarına yaklaşınca satırlar sonraki sayfaya iner.
  //
  //    - İlk sayfa    : en fazla FIRST_PAGE_WEIGHT ağırlık (büyük footer → az içerik)
  //    - Devam sayfası : en fazla CONTINUATION_PAGE_WEIGHT ağırlık (küçük footer → çok içerik)
  //    - AÇIKLAMALAR + "Rapor Sonu" bölünmüş raporlarda SON sayfada, tablonun en altında.
  //    - Devam sayfalarında satır/font boyutu ilk sayfayla AYNI (küçültme yok).
  //
  // NOT: Bu satır-sayısı + padding tampon yaklaşımı, SSR/PDF (Chromium) ortamında
  // ölçüm gerektirmeden güvenli bölme sağlar. Değerler değişirse tüm raporlar aynı
  // şekilde davranır.
  // ═══════════════════════════════════════════════════════════════════════════
  // Page 1'e imza/footer bloğu için ~78mm ayrıldığından, başlık sonrası yaklaşık
  // 12 normal satır sığar. Uzun hücreler birden fazla satır ağırlığı tüketir; böylece
  // tek bir uzun Sonuç metni tabloyu footer üstüne bindirmez.
  const FIRST_PAGE_WEIGHT = 12;
  const CONTINUATION_PAGE_WEIGHT = 20;
  const firstPageRows = editing
    ? resultRows
    : splitIntoWeightedPages(resultRows, FIRST_PAGE_WEIGHT, resultRowWeight)[0] ?? [];
  const firstPageResultCount = firstPageRows.length;
  const remainingResultRows = editing ? [] : resultRows.slice(firstPageResultCount);
  const continuationPages = splitIntoWeightedPages(remainingResultRows, CONTINUATION_PAGE_WEIGHT, resultRowWeight);
  const totalReportPages = 1 + continuationPages.length;

  // Düzenleme modu yardımcıları — `edit` yoksa hepsi no-op, metin olduğu gibi basılır.
  const editText = (
    value: string,
    onChange: (v: string) => void,
    opts?: { center?: boolean; placeholder?: string },
  ) => (
    <input
      className="rd-edit"
      value={value}
      placeholder={opts?.placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={opts?.center ? { textAlign: "center" } : undefined}
    />
  );

  const renderResultRows = (rows: ResultDisplayRow[]) => {
    if (hizmetler.length === 0) {
      return (
        <tr>
          <td colSpan={editing ? 9 : 8} style={{ textAlign: "center", color: "#6e6e73", padding: "30px" }}>
            {editing ? "Henüz satır yok — aşağıdan “Satır Ekle” ile ekleyin." : text.emptyRows}
          </td>
        </tr>
      );
    }

    return rows.map((row) => {
      if (row.kind === "alt") {
        const altName = isEnglish ? nonEmpty(row.alt.BilesenAdiEn) || row.alt.BilesenAdi : row.alt.BilesenAdi;
        const adeg = degerlendirmeLabel((isEnglish ? row.alt.Degerlendirme : row.alt.Degerlendirme) || null, isEnglish);
        return (
          <tr key={`${row.serviceIndex}-alt-${row.altIndex}`} className="alt-param-row">
            <td style={{ paddingLeft: 18, paddingRight: 10 }}>↳ {altName || "-"}</td>
            <td className="center">{(isEnglish ? row.alt.BirimEn || row.alt.Birim : row.alt.Birim) || "-"}</td>
            <td className="center result-cell">{(isEnglish ? row.alt.SonucEn || row.alt.Sonuc : row.alt.Sonuc) || "-"}</td>
            <td className="center" style={{ paddingLeft: 5 }}>{(isEnglish ? row.alt.LOQEn || row.alt.LOQ : row.alt.LOQ) || "-"}</td>
            <td className="center muted" style={{ paddingLeft: 5 }}>-</td>
            <td className="center" style={{ paddingLeft: 5 }}>-</td>
            <td className="center limit-cell">{(isEnglish ? row.alt.LimitEn || row.alt.Limit : row.alt.Limit) || "-"}</td>
            <td className={adeg.cls} style={{ textAlign: "center" }}>{row.alt.Degerlendirme ? adeg.text : "-"}</td>
            {editing && <td />}
          </tr>
        );
      }

      const h = row.service;
      const i = row.serviceIndex;
      const isAkr = String(h.Akreditasyon || "").trim().toLowerCase() === "var";
      const degValue = isEnglish ? h.DegerlendirmeEn || h.Degerlendirme : h.Degerlendirme;
      const deg = degerlendirmeLabel(degValue || null, isEnglish);
      const serviceName = isEnglish ? nonEmpty(h.AdEn) || h.Ad : h.Ad;
      return (
        <tr key={`${i}-main`}>
          <td style={{ paddingRight: 10 }}>
            {edit
              ? editText(
                  (isEnglish ? h.AdEn || h.Ad : h.Ad) || "",
                  (v) => edit.onRowChange(i, isEnglish ? { AdEn: v } : { Ad: v }),
                  { placeholder: text.analysisName },
                )
              : <>{isAkr ? "*" : ""}{serviceName}</>}
          </td>
          <td className="center">{edit ? editText((isEnglish ? h.BirimEn || h.Birim : h.Birim) || "", (v) => edit.onRowChange(i, isEnglish ? { BirimEn: v } : { Birim: v }), { center: true }) : ((isEnglish ? h.BirimEn || h.Birim : h.Birim) || "-")}</td>
          <td className="center result-cell">{edit ? editText((isEnglish ? h.SonucEn || h.Sonuc : h.Sonuc) || "", (v) => edit.onRowChange(i, isEnglish ? { SonucEn: v } : { Sonuc: v }), { center: true }) : ((isEnglish ? h.SonucEn || h.Sonuc : h.Sonuc) || "-")}</td>
          <td className="center" style={{ paddingLeft: 5 }}>{edit ? editText((isEnglish ? h.LOQEn || h.LOQ : h.LOQ) || "", (v) => edit.onRowChange(i, isEnglish ? { LOQEn: v } : { LOQ: v }), { center: true }) : ((isEnglish ? h.LOQEn || h.LOQ : h.LOQ) || "-")}</td>
          <td className="center" style={{ paddingLeft: 5 }}>{edit ? editText(h.OlcumBelirsizligi || "", (v) => edit.onRowChange(i, { OlcumBelirsizligi: v }), { center: true }) : (h.OlcumBelirsizligi || "-")}</td>
          <td className="center method-cell" style={{ paddingLeft: 5 }}>{edit ? editText((isEnglish ? h.MetotEn || h.Metot : h.Metot) || "", (v) => edit.onRowChange(i, isEnglish ? { MetotEn: v } : { Metot: v }), { center: true }) : ((isEnglish ? h.MetotEn || h.Metot : h.Metot) || "-")}</td>
          <td className="center limit-cell">{edit ? editText((isEnglish ? h.LimitEn || h.LimitDeger : h.LimitDeger) || "", (v) => edit.onRowChange(i, isEnglish ? { LimitEn: v } : { LimitDeger: v }), { center: true }) : ((isEnglish ? h.LimitEn || h.LimitDeger : h.LimitDeger) || "-")}</td>
          {edit ? (
            <td style={{ textAlign: "center" }}>
              <select
                className="rd-edit"
                value={(isEnglish ? h.DegerlendirmeEn || h.Degerlendirme : h.Degerlendirme) || ""}
                onChange={(e) => edit.onRowChange(i, isEnglish ? { DegerlendirmeEn: e.target.value } : { Degerlendirme: e.target.value })}
                style={{ textAlign: "center" }}
              >
                <option value="">-</option>
                {isEnglish ? (
                  <>
                    <option value="Pass">Pass</option>
                    <option value="Fail">Fail</option>
                    <option value="N/A">N/A</option>
                  </>
                ) : (
                  <>
                    <option value="Uygun">Uygun</option>
                    <option value="Uygun Değil">Uygun Değil</option>
                    <option value="D.Y.">D.Y.</option>
                  </>
                )}
              </select>
            </td>
          ) : (
            <td className={deg.cls} style={{ textAlign: "center" }}>{deg.text}</td>
          )}
          {editing && (
            <td style={{ textAlign: "center" }}>
              <button type="button" className="rd-row-act" title="Satırı sil" onClick={() => edit?.onRemoveRow(i)}>✕</button>
            </td>
          )}
        </tr>
      );
    });
  };

  const renderResultsTable = (rows: ResultDisplayRow[], opts?: { continued?: boolean }) => {
    const parentContext =
      opts?.continued && rows[0]?.kind === "alt"
        ? (isEnglish ? nonEmpty(hizmetler[rows[0].serviceIndex]?.AdEn) || hizmetler[rows[0].serviceIndex]?.Ad : hizmetler[rows[0].serviceIndex]?.Ad)
        : "";

    return (
      <table className="results">
        <thead>
          <tr>
            <th style={{ width: "auto", minWidth: 210 }}>{text.analysisName}</th>
            <th style={{ width: 50 }}>{text.unit}</th>
            <th style={{ width: 110 }}>{text.result}</th>
            <th style={{ width: 50, paddingLeft: 5 }}>LOQ</th>
            <th style={{ width: 50, paddingLeft: 5 }}>{text.uncertainty}</th>
            <th style={{ width: 110, paddingLeft: 5 }}>{text.method}</th>
            <th style={{ width: 96 }}>{text.limit}</th>
            <th style={{ width: 82, textAlign: "center" }}>{text.assessment}</th>
            {editing && <th style={{ width: 40 }}></th>}
          </tr>
        </thead>
        <tbody>
          {parentContext && (
            <tr className="continued-parent-row">
              <td colSpan={editing ? 9 : 8}>{parentContext} ({text.continued})</td>
            </tr>
          )}
          {renderResultRows(rows)}
        </tbody>
      </table>
    );
  };

  const renderDocumentFooter = (page: number) => (
    <div className={`rapor-altbilgi ${page > 1 ? "continuation-footer" : ""}`}>
      <div className="sirket-bilgisi">
        <strong>UNIQUE ANALİZ BELGELENDİRME ve GÖZETİM HİZMETLERİ LTD. ŞTİ.</strong>
        <span>Atatürk Mah. Hadımköy Yolu Cad. No:10 İç Kapı No:7 Esenyurt / İstanbul | info@uniqueanalyse.com</span>
      </div>

      <div className="dokuman-bilgisi">
        <div className="sol-alt">
          {documentCode}
        </div>
        <div className="sag-alt">
          {text.page}: {page} / {totalReportPages}
        </div>
      </div>
    </div>
  );

  const renderContinuationHeader = () => (
    <>
      <div className="header continuation-header">
        <div className="header-logo">
          <img src="/unique-logo-wide.png" alt="UNIQUE ANALYSE" />
        </div>
        {hasAkredite && (
          <div className="header-akredite">
            <img src="/turkak-ilac.jpg" alt="TÜRKAK AB-2015-T · ilac-MRA" />
          </div>
        )}
      </div>

      <div className="title-row continuation-title" style={!hasAkredite ? { marginTop: "10mm" } : undefined}>
        <div className="report-title">{text.reportTitle}</div>
        {hasAkredite && (
          <table className="akredite-box">
            <tbody>
              <tr><td>AB-2015-T</td></tr>
              <tr>
                <td
                  className="akredite-code-cell"
                  style={{ "--akr-code-font-size": `${akrKodFontSize}px` } as React.CSSProperties}
                >
                  {raporKodu}
                </td>
              </tr>
              <tr><td>{toMMYY(yayinTarihi)}</td></tr>
            </tbody>
          </table>
        )}
      </div>

      <table className="meta-table continuation-meta">
        <tbody>
          <tr>
            <td style={{ paddingBottom: "4px", width: "20%"}}><strong>{text.reportNo}</strong></td>
            <td style={{ paddingBottom: "4px", width: "80%" }}>{raporKodu}</td>
          </tr>
        </tbody>
      </table>
      <div className="continuation-rule" />
    </>
  );

  // Rapor bölünmüşse AÇIKLAMALAR/EXPLANATIONS + "* Rapor Sonu *" son devam
  // sayfasında, analiz tablosunun en altında gösterilir (tüm formatlarda).
  const moveNotesToLast = continuationPages.length > 0;

  const renderNotesBlock = () => (
    <>
      <div className="notlar">
      <div className="results-title" style={{marginBottom: "7px"}}>{text.notes}</div>
          {testBaslangic && testBitis ? (
            <>
              {text.period}{" "}
              <strong>{fmtTarih(testBaslangic)} - {fmtTarih(testBitis)}</strong>{" "}
            </>
          ) : null}
        {edit ? (
          <textarea
            className="rd-edit-area"
            style={{ marginTop: 6 }}
            value={header.Aciklamalar ?? ""}
            placeholder={text.editPlaceholder}
            onChange={(e) => edit.onHeaderChange({ Aciklamalar: e.target.value })}
          />
        ) : (
          aciklamaSatirlar.map((satir, i) => (
            <Fragment key={i}>
              <br />{satir}
            </Fragment>
          ))
        )}
        {revizeNot && (
          <div style={{ marginTop: 8, fontWeight: "bold" }}>
            <br />{text.revisionNote} {revizeNot}
          </div>
        )}
      </div>

      <div className="endof">{text.end}</div>
    </>
  );

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
          margin: 24px auto 64px;
          background: #fff;
          padding: 8mm;
          box-shadow: 0 4px 24px rgba(0,0,0,0.08);
          display: flex;
          flex-direction: column;
          position: relative;
        }
        .page + .page {
          margin-top: 24px;
        }
        .report-title,
        .akredite-box td,
        .meta-table strong,
        .info-table th,
        .results-title,
        .results-subtitle,
        .results thead th,
        .notlar-title,
        .approval-cell-title,
        .continuation-summary-title,
        .continuation-summary-label,
        .endof {
          font-family: var(--font-rapor), 'JetBrains Mono', 'Cascadia Mono', Consolas, 'Courier New', monospace;
        }
        .continuation-header {
          padding-bottom: 4mm;
        }
        .continuation-title {
          margin-top: 0;
        }
        .continuation-meta {
          margin-top: 5mm;
        }
        .continuation-rule {
          margin-top: 4px;
          border-bottom: 2px solid #000000;
        }
        .continuation-page {
          padding-bottom: 49mm;
        }
        .long-report-layout .continuation-header {
          padding-bottom: 2mm;
        }
        .long-report-layout .continuation-meta {
          margin-top: 3mm;
        }
        .long-report-layout .results-section.continued {
          margin-top: 4mm;
        }
        .long-report-layout .continuation-page .results {
          margin-top: 2mm;
        }
        .long-report-layout .continuation-page .results thead th {
          padding-top: 4px;
          padding-bottom: 4px;
          font-size: 9px;
          line-height: 1.15;
        }
        .long-report-layout .continuation-page .results tbody td {
          padding-top: 4px;
          padding-bottom: 4px;
          font-size: 8.6px;
          line-height: 1.18;
        }
        .long-report-layout .continuation-page .results tbody tr.alt-param-row td {
          padding-top: 2px;
          padding-bottom: 2px;
          font-size: 7.8px;
          line-height: 1.14;
        }
        .long-report-layout .continuation-page .results tbody tr.continued-parent-row td {
          padding-top: 3px;
          padding-bottom: 3px;
          font-size: 8.4px;
          line-height: 1.14;
        }
        .long-report-layout .continuation-page {
          padding-bottom: 41mm;
        }
        .long-report-layout .continuation-seal {
          bottom: 24mm;
        }
        .long-report-layout .continuation-seal img {
          width: 78px;
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
          font-size: 11px;
          letter-spacing: -0.02em;
          padding: 0 1px;
          overflow: hidden;
          word-break: break-all;
          line-height: 1.1;
          font-family: var(--font-tt-interphases);
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
          font-size: 12px;
          font-weight: 600;
          padding-top: 5px;
          letter-spacing: 0;
        }
        .info-table .info-line {
          color: var(--ink);
          font-size: 11px;
          letter-spacing: 0;
        }

        /* ───── TEST SONUÇLARI SECTION ───── */
        .results-section {
          margin-top: 5mm;
        }
        .results-section.continued {
          margin-top: 8mm;
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
          table-layout: fixed;
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
          font-size: 11px;
          letter-spacing: -0.03em;
          white-space: nowrap;
        }
        .results tbody td {
          padding-top: 7px;
          padding-bottom: 6px;
          vertical-align: top;
          font-size: 11px;
          text-align: left;
          letter-spacing: 0;
          border-bottom: 1px solid var(--rule-soft);
          font-family: var(--font-tt-interphases);
          white-space: nowrap;
        }
        .results tbody td.center { text-align: left; }
        /* Sonuç/limit/metot metinleri cümle uzunluğunda olabiliyor. Diğer
           kolonlar tek satırda kalsın; bu hücreler sarıp tabloyu sayfa içinde tutsun. */
        .results tbody td.result-cell,
        .results tbody td.limit-cell,
        .results tbody td.method-cell {
          white-space: normal;
          overflow-wrap: break-word;
          word-break: break-word;
          hyphens: auto;
          line-height: 1.22;
        }
        .results tbody td.muted { color: var(--ink-soft); font-size: 8.5px; }
        .results tbody td.bold { font-weight: 700; }
        /* Alt parametre (bileşen) satırları — ana analizin altında, daha hafif */
        .results tbody tr.alt-param-row td {
          font-size: 9px;
          color: var(--ink-soft);
          padding-top: 3px;
          padding-bottom: 3px;
          border-bottom: 1px dotted var(--rule-soft);
        }
        .results tbody tr.continued-parent-row td {
          font-size: 9px;
          font-weight: 700;
          color: var(--ink-strong);
          background: #f7f7f7;
          padding: 5px 8px;
          border-bottom: 1px solid var(--rule-soft);
        }
        .deg-gecer { color: var(--ink-strong); font-weight: 700; text-align: center; letter-spacing: 0.02em; }
        .deg-kaldi { color: var(--ink-strong); font-weight: 700; text-align: center; letter-spacing: 0.02em; }
        .deg-other { color: var(--ink-strong); font-weight: 700; text-align: center; }

        /* ───── NOTLAR / AÇIKLAMALAR ───── */
        .notlar {
          margin-top: 5mm;
          font-size: 11px;
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
          font-family: var(--font-rapor), 'JetBrains Mono', 'Cascadia Mono', Consolas, 'Courier New', monospace;
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
        .continuation-summary {
          border-bottom: 2px solid var(--rule);
          padding-bottom: 4mm;
          font-size: 9.5px;
          line-height: 1.55;
          color: var(--ink);
        }
        .continuation-summary-title {
          font-size: 11px;
          font-weight: 700;
          color: var(--ink-strong);
          margin-bottom: 1.5mm;
        }
        .continuation-summary-row {
          display: grid;
          grid-template-columns: 24mm 1fr;
          gap: 4mm;
        }
        .continuation-summary-label {
          font-weight: 700;
          color: var(--ink-strong);
        }
        .continuation-seal {
          position: absolute;
          right: 15mm;
          bottom: 28mm;
          display: flex;
          justify-content: flex-end;
        }
        .continuation-seal img {
          width: 90px;
          height: auto;
        }

        /* ───── ALT BİLGİ (genel kapsayıcı) ───── */
        .rapor-altbilgi {
          width: 100%;
          font-size: 10px;
          color: var(--ink-soft);
          padding-top: 7px;
          position: relative;
          box-sizing: border-box;
          font-family: var(--font-tt-interphases), var(--font-rapor), 'JetBrains Mono', 'Cascadia Mono', Consolas, 'Courier New', monospace;
        }
        .continuation-footer {
          position: absolute;
          left: 8mm;
          right: 8mm;
          bottom: 8mm;
          width: auto;
        }
        /* Page 1 sabit footer — imza + FooterNot + doküman footer birlikte pinned.
           main-page padding-bottom ile analiz tablosuna yer ayrılır (üst üste binmez). */
        .main-page {
          padding-bottom: 78mm;
        }
        .page1-footer {
          position: absolute;
          left: 8mm;
          right: 8mm;
          bottom: 8mm;
          width: auto;
        }
        .page1-footer .approval-block {
          margin-top: 0;
          padding-top: 4mm;
        }
        .page1-footer .FooterNot {
          margin-top: 4px;
          margin-bottom: 10px;
        }
        .page1-footer .rapor-altbilgi {
          padding-top: 7px;
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

        /* ───── DÜZENLEME MODU (WYSIWYG) — sadece düzenleme ekranında ───── */
        .rd-edit, .rd-edit-area {
          font: inherit;
          color: inherit;
          letter-spacing: inherit;
          width: 100%;
          border: 1px solid #c7c9f5;
          border-radius: 4px;
          background: #f6f7ff;
          padding: 1px 4px;
        }
        .rd-edit-area { resize: vertical; line-height: inherit; min-height: 60px; }
        .rd-edit:focus, .rd-edit-area:focus {
          outline: 2px solid #4A46E5;
          outline-offset: 0;
          background: #fff;
        }
        .rd-row-act {
          border: 1px solid #ff3b3033;
          background: #ff3b3014;
          color: #c00;
          border-radius: 6px;
          padding: 2px 7px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
        }
        .rd-add-btn {
          margin-top: 8px;
          border: 1px solid #0071e3;
          background: #0071e3;
          color: #fff;
          border-radius: 7px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
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
          .page {
            width: 210mm; max-width: 210mm;
            height: 296mm; min-height: 296mm; max-height: 296mm;
            margin: 0 auto; box-shadow: none;
            padding: 8mm;
            overflow: hidden;
            page-break-after: auto;
            break-after: auto;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          /* Page 1 sabit footer için alt rezerv — .page shorthand'ini ez. */
          .main-page {
            padding-bottom: 78mm;
          }
          .page + .page {
            margin-top: 0;
            page-break-before: always;
            break-before: page;
          }
          .continuation-page {
            padding-bottom: 49mm;
          }
          .long-report-layout .continuation-page {
            padding-bottom: 41mm;
          }
        }
      `}</style>

      <div className={`root ${ttInterphases.variable} ${jetbrains.variable}`}>
        {!hideToolbar && (
          <OnayToolbar
            nkrId={nkrId}
            format={format}
            initialOnay={onay}
            raporNo={header.RaporNo}
            sampleName={header.Numune_Adi}
            sampleNameEn={header.Numune_Adi_En}
          />
        )}

        <div className="page main-page">
          {/* ───── HEADER: Sol logo + (akredite varsa) Sağ Türkak/ilac-MRA ───── */}
          <div className="header">
            <div className="header-logo">
              <img src="/unique-logo-wide.png" alt="UNIQUE ANALYSE" />
            </div>
            {hasAkredite && (
              <div className="header-akredite">
                <img src="/turkak-ilac.jpg" alt="TÜRKAK AB-2015-T · ilac-MRA" />
              </div>
            )}
          </div>

          {/* ───── DENEY RAPORU BAŞLIK + (akredite varsa) akreditasyon kutusu ─────
              Akreditasyon yoksa sağda TÜRKAK logosu (30mm) olmadığından header
              alçalıp başlık logoya yapışıyor → bu durumda üstten boşluk ekle. */}
          <div className="title-row" style={!hasAkredite ? { marginTop: "16mm" } : undefined}>
            <div className="report-title">{text.reportTitle}</div>
            {hasAkredite && (
              <table className="akredite-box">
                <tbody>
                  <tr><td>AB-2015-T</td></tr>
                  <tr>
                    <td
                      className="akredite-code-cell"
                      style={{ "--akr-code-font-size": `${akrKodFontSize}px` } as React.CSSProperties}
                    >
                      {raporKodu}
                    </td>
                  </tr>
                  <tr><td>{toMMYY(yayinTarihi)}</td></tr>
                </tbody>
              </table>
            )}
          </div>

          {/* ───── ÜST META: Rapor No/Rev · Sayfa · Kabul · Yayın ───── */}

          <table className="meta-table">
            <tbody>
              <tr>
                <td style={{ paddingBottom: "4px" , width: "20%" }}><strong>{text.reportNo}</strong></td>
                <td style={{ paddingBottom: "4px" , width: "50%" }}>{raporKodu}</td>
                <td style={{ paddingBottom: "4px" }}><strong></strong></td>
                <td style={{ paddingBottom: "4px"  }}></td>
              </tr>
              <tr>
                <td style={{ paddingBottom: "4px" , width: "20%" }}><strong>{text.acceptanceDate}</strong> </td>
                <td style={{ paddingBottom: "4px"  }}>{kabulTarihi}</td>
                <td style={{ paddingBottom: "4px"  }}><strong>{text.issueDate}</strong> </td>
                <td style={{ paddingBottom: "4px"  }}>{yayinTarihi}</td>
              </tr>
            </tbody>
          </table>
          <div style={{marginTop: "4px", borderBottom: "2px solid #000000"}}></div>

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
                <td style={{ fontFamily: "var(--font-tt-interphases)" }}>
                  <div className="firma-ad">{header.FirmaAd || "—"}</div>
                  <div className="info-line" style={{ width: "90%" }}>{header.FirmaAdres}</div>
                  <div className="info-line">{header.FirmaYetkili || "—"}</div>
                  <div className="info-line">{header.FirmaEmail}</div>
                </td>
                <td style={{ fontFamily: "var(--font-tt-interphases)" }}>
                  <div className="firma-ad">
                    {edit
                      ? editText(
                          (isEnglish ? header.Numune_Adi_En || header.Numune_Adi : header.Numune_Adi) || "",
                          (v) => edit.onHeaderChange(isEnglish ? { Numune_Adi_En: v } : { Numune_Adi: v }),
                          { placeholder: isEnglish ? "Sample name" : "Numune adı" },
                        )
                      : (isEnglish ? header.Numune_Adi_En || header.Numune_Adi : header.Numune_Adi)}
                  </div>
                  {(header.TesteMiktar || header.TesteMiktarBirim) && (
                    <div className="info-line">
                      <span className="info-label">{text.quantity} </span>
                      {header.TesteMiktar} {translateReportUnit(header.TesteMiktarBirim, isEnglish)}
                    </div>
                  )}
                  <div className="info-line">
                    <span className="info-label">{text.productionDate} </span>
                    {String(header.UretimTarihi || "—")}
                  </div>
                  <div className="info-line">
                    <span className="info-label">{text.expiryDate} </span>
                    {String(header.SKT || "—")}
                  </div>
                  <div className="info-line">
                    <span className="info-label">{text.lotNo} </span>
                    {header.SeriNo || "—"}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* ───── TEST SONUÇLARI ───── */}
          <div className="results-section" style={{ marginTop: 30 }}>
            <div className="results-title" >{text.testResults}</div>
            <div className="notlar-body" > </div>
            {renderResultsTable(firstPageRows)}
            {edit && (
              <button type="button" className="rd-add-btn" onClick={() => edit.onAddRow()}>{text.addRow}</button>
            )}
          </div>

          {/* AÇIKLAMALAR + "* Rapor Sonu *" — rapor bölünmemişse page 1'de, analiz
              tablosunun hemen altında. Bölünmüşse son devam sayfasına taşınır. */}
          {!moveNotesToLast && renderNotesBlock()}

          {/* ───── PAGE 1 SABİT FOOTER (pinned) ─────
              İmza (Hazırlayan/Onaylayan) + seal + QR + FooterNot + doküman footer.
              Absolute konumlu → her zaman sayfanın altında; analiz tablosu bunların
              üstüne gelmez (main-page padding-bottom ile yer ayrılır). */}
          <div className="page1-footer">
            <div className="approval-block">
              <div className="approval-cell" style={{width:200, paddingTop:"15px"}}>
                <div className="approval-cell-title" style={{paddingLeft:"5px"}}>{text.preparedBy}</div>
                <div className="e-imza-pill" style={{marginTop:10}}>✓ {text.signed}</div>
                <div className="approval-cell-body">
                  <div className="approval-name">{hazirlayanAd} <span style={{fontSize:"9px" , color:"#646464"}}>{text.reporter}</span></div>
                </div>
              </div>
              <div className="approval-cell" style={{width:300, paddingTop:"15px"}}>
                <div className="approval-cell-title" style={{paddingLeft:"5px"}}>{text.approvedBy}</div>
                <div className="e-imza-pill" style={{marginTop:10}}>✓ {text.signed}</div>
                <div className="approval-cell-body">
                  <div className="approval-name">Oğuzhan EKER <span style={{fontSize:"9px" , color:"#646464"}}>{text.manager}</span></div>
                </div>
              </div>
              <div className="approval-cell">
                <div className="approval-cell-title">
                  <img src="/unique-seal.png" alt="UNIQUE ANALYSE" style={{width: 90}}/>
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

            <div className="FooterNot">{text.footerNote}</div>

            {renderDocumentFooter(1)}
          </div>




        </div>
        {continuationPages.map((rows, pageIndex) => {
          const pageNo = pageIndex + 2;
          const isLastContinuation = pageIndex === continuationPages.length - 1;
          return (
            <div className="page continuation-page" key={`continuation-${pageNo}`}>
              {renderContinuationHeader()}

              <div className="results-section continued">
                <div className="results-title">{text.testResultsContinued}</div>
                {renderResultsTable(rows, { continued: true })}
                {moveNotesToLast && isLastContinuation && renderNotesBlock()}
              </div>

              <div className="continuation-seal">
                <img src="/unique-seal.png" alt="UNIQUE ANALYSE" />
              </div>
              {renderDocumentFooter(pageNo)}
            </div>
          );
        })}
      </div>
    </>
  );
}
