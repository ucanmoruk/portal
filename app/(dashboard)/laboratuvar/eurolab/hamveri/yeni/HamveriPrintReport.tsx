"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Hamveri (EN 71-1) Yazdırma Raporu
//
// Bu dosyayı logo, kurumsal bilgiler, renk paleti, başlıklar ve yerleşim için
// serbestçe düzenleyebilirsiniz. Stiller bu dosyanın altındaki <style> bloğunda.
//
// Logo dosyası:   public/logo-teklif.png       (PRINT_LOGO_SRC sabiti)
// A4 sayfa:       210 x 297 mm
// Kenar boşl.:    @page margin → 12mm üst/alt, 14mm sol/sağ (CSS'in en üstünde)
// İçerik geniş.:  ~182 mm (A4 - 2 × 14mm)
//
// Marjinleri değiştirmek için sadece "@page { size: A4; margin: ...; }"
// satırını güncelleyin. İçerik otomatik olarak yeni alana göre yayılır.
//
// NOT: Tarayıcı yazdır penceresinde "Kenar Boşlukları / Margins" ayarı
//      "Yok (None)" seçilirse aşağıdaki @page margin tam olarak uygulanır.
//      "Varsayılan" seçilirse tarayıcının kendi marjinleri @page'i ezebilir.
// ─────────────────────────────────────────────────────────────────────────────

const PRINT_LOGO_SRC = "/logo-teklif.png";
const COMPANY_NAME = "UNIQUE ANALİZ BELGELENDİRME ve GÖZETİM HİZMETLERİ LTD. ŞTİ.";
const COMPANY_ADDRESS = "Atatürk Mah. Hadımköy Yolu Cad. No:10 İç Kapı No:7 Esenyurt / İstanbul";
const COMPANY_WEBSITE = "www.uqtest.com";
const COMPANY_EMAIL = "hello@uqtest.com";
const FORM_CODE = "HV-EN71-1";
const FORM_REV = "Rev. 00";
const FORM_ISSUE_DATE = "27.09.2023";
const REPORT_TITLE = "EN 71-1:2026 HAM VERİ FORMU";
const REPORT_SUBTITLE = "Mekanik ve Fiziksel Test Karar Defteri";

type Decision = "Bekliyor" | "Geçti" | "Kaldı" | "N/A" | string;

export type HamveriPrintRow = {
  id: string;
  title: string;
  source: string;
  group: string;
  clause: string;
  method: string;
  measuredValue: string;
  decision: Decision;
};

export type HamveriPrintReportProps = {
  reportNo: string;
  productName: string;
  brand: string;
  standard: string;
  ageGroupLabel: string;
  criticalAges: string[];
  purpose: string;
  status: string;
  materials: string[];
  toyTypes: string[];
  notes: string;
  stats: { total: number; passed: number; failed: number; na: number; waiting: number };
  rows: HamveriPrintRow[];
};

const decisionTone = (decision: Decision) => {
  if (decision === "Geçti") return "pass";
  if (decision === "Kaldı") return "fail";
  if (decision === "N/A") return "na";
  return "wait";
};

export default function HamveriPrintReport({
  reportNo,
  productName,
  brand,
  standard,
  ageGroupLabel,
  criticalAges,
  purpose,
  status,
  materials,
  toyTypes,
  notes,
  stats,
  rows,
}: HamveriPrintReportProps) {
  const today = new Date();
  const printDate = today.toLocaleDateString("tr-TR");
  const docCodeMonth = `${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getFullYear()).slice(-2)}`;

  return (
    <>
      <div id="hamveri-print-area">
        <header className="hp-header">
          <div className="hp-header-left">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={PRINT_LOGO_SRC} alt="Logo" className="hp-logo" />
          </div>
          <div className="hp-header-center">
            <div className="hp-doc-title">{REPORT_TITLE}</div>
            <div className="hp-doc-subtitle">{REPORT_SUBTITLE}</div>
          </div>
          <table className="hp-doc-code">
            <tbody>
              <tr><td>{FORM_CODE}</td></tr>
              <tr><td>{FORM_REV}</td></tr>
              <tr><td>{docCodeMonth}</td></tr>
            </tbody>
          </table>
        </header>

        <section className="hp-section">
          <div className="hp-section-title">NUMUNE VE ÜRÜN BİLGİLERİ</div>
          <table className="hp-info">
            <tbody>
              <tr>
                <td className="hp-label">Rapor No</td>
                <td className="hp-value hp-mono">{reportNo || "-"}</td>
                <td className="hp-label">Form Tarihi</td>
                <td className="hp-value">{printDate}</td>
              </tr>
              <tr>
                <td className="hp-label">Ürün / Numune Adı</td>
                <td className="hp-value" colSpan={3}>{productName || "-"}</td>
              </tr>
              <tr>
                <td className="hp-label">Marka</td>
                <td className="hp-value">{brand || "-"}</td>
                <td className="hp-label">Standart</td>
                <td className="hp-value">{standard}</td>
              </tr>
              <tr>
                <td className="hp-label">Yaş Grubu</td>
                <td className="hp-value">{ageGroupLabel || "-"}</td>
                <td className="hp-label">Kritik Yaş Kırılımları</td>
                <td className="hp-value">{criticalAges.length ? criticalAges.join(", ") : "-"}</td>
              </tr>
              <tr>
                <td className="hp-label">Kullanım Amacı</td>
                <td className="hp-value">{purpose || "-"}</td>
                <td className="hp-label">Genel Durum</td>
                <td className="hp-value hp-status">{status}</td>
              </tr>
              <tr>
                <td className="hp-label">Malzeme Bileşimi</td>
                <td className="hp-value" colSpan={3}>{materials.length ? materials.join(" • ") : "-"}</td>
              </tr>
              <tr>
                <td className="hp-label">Oyuncak Tipi</td>
                <td className="hp-value" colSpan={3}>{toyTypes.length ? toyTypes.join(" • ") : "-"}</td>
              </tr>
              <tr>
                <td className="hp-label">Not</td>
                <td className="hp-value" colSpan={3}>{notes || "-"}</td>
              </tr>
            </tbody>
          </table>
        </section>



        <section className="hp-section">
          <div className="hp-section-title">TEST KARAR DEFTERİ</div>
          <table className="hp-results">
            <colgroup>
              <col style={{ width: "5%" }} />
              <col style={{ width: "30%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "12%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                <th>Test</th>
                <th>Madde</th>
                <th>Yöntem</th>
                <th>Açıklama / Gözlem</th>
                <th>Karar</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="hp-empty">Test kaydı bulunamadı.</td></tr>
              ) : rows.map((row, index) => (
                <tr key={row.id}>
                  <td className="hp-center">{index + 1}</td>
                  <td>
                    <div className="hp-test-title">{row.title}</div>
                    <div className="hp-test-sub">{row.source} · {row.group}</div>
                  </td>
                  <td>{row.clause}</td>
                  <td>{row.method}</td>
                  <td>{row.measuredValue || "-"}</td>
                  <td className={`hp-center hp-decision hp-decision-${decisionTone(row.decision)}`}>
                    {row.decision}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="hp-signatures">
          <table>
            <thead>
              <tr>
                <th>Analist</th>
                <th>Kontrol Eden</th>
                <th>Laboratuvar Müdürü</th>
                <th>Tarih</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="hp-sign-cell">&nbsp;</td>
                <td className="hp-sign-cell">&nbsp;</td>
                <td className="hp-sign-cell">&nbsp;</td>
                <td className="hp-sign-cell">{printDate}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <footer className="hp-footer">
          <div className="hp-footer-row hp-footer-main">
            <span>{COMPANY_NAME}</span>
            <span>{COMPANY_WEBSITE}</span>
          </div>
          <div className="hp-footer-row">
            <span>{COMPANY_ADDRESS}</span>
            <span>{COMPANY_EMAIL}</span>
          </div>
          <div className="hp-footer-row hp-footer-small">
            <span>Form Kodu: {FORM_CODE}</span>
            <span>Yayın Tarihi: {FORM_ISSUE_DATE} — {FORM_REV}</span>
          </div>
        </footer>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        #hamveri-print-area { display: none; }

        @media print {
          /* Sayfa boyutu ve kenar boşlukları burada ayarlanır.
             margin değerini değiştirerek sağ/sol/üst/alt boşlukları kontrol edin. */
          @page { size: A4; margin: 12mm 14mm; }
          html, body { background: #ffffff !important; margin: 0 !important; padding: 0 !important; }
          body * { visibility: hidden !important; }
          #hamveri-print-area, #hamveri-print-area * { visibility: visible !important; }
          /* Rapor @page içinde tanımlanan içerik alanını tam doldurur.
             Yatay/dikey hizalama @page margin tarafından kontrol edilir. */
          #hamveri-print-area {
            display: block !important;
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            font-family: "Helvetica Neue", Arial, sans-serif;
            color: #0f172a;
            box-sizing: border-box !important;
          }

          /* ── Üst başlık ─────────────────────────────────────────────────── */
          #hamveri-print-area .hp-header {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr) 22mm;
            align-items: center;
            gap: 5mm;
            padding-bottom: 3.5mm;
            margin-bottom: 4mm;
            border-bottom: 1.5px solid #1f5a83;
          }
          #hamveri-print-area .hp-header-left { display: flex; align-items: center; min-width: 0; }
          #hamveri-print-area .hp-logo {
            max-width: 100%;
            max-height: 18mm;
            object-fit: contain;
            object-position: left center;
          }
          #hamveri-print-area .hp-header-center { text-align: center; }
          #hamveri-print-area .hp-doc-title {
            font-size: 12pt;
            font-weight: 800;
            letter-spacing: 0.2px;
            color: #0f172a;
          }
          #hamveri-print-area .hp-doc-subtitle {
            margin-top: 1mm;
            font-size: 8.5pt;
            color: #64748b;
            font-style: italic;
          }
          #hamveri-print-area .hp-doc-code {
            border-collapse: collapse;
            width: 22mm;
            font-size: 7.5pt;
            text-align: center;
            table-layout: fixed;
          }
          #hamveri-print-area .hp-doc-code td {
            border: 0.4mm solid #1f5a83;
            padding: 0.8mm 1mm;
            font-weight: 600;
          }
          #hamveri-print-area .hp-doc-code tr:first-child td {
            background: #1f5a83;
            color: #ffffff;
            font-weight: 700;
          }

          /* ── Bölüm başlığı ──────────────────────────────────────────────── */
          #hamveri-print-area .hp-section { margin-top: 4mm; }
          #hamveri-print-area .hp-section-title {
            display: block;
            box-sizing: border-box;
            width: 100%;
            font-size: 8.5pt;
            font-weight: 800;
            letter-spacing: 1px;
            color: #ffffff;
            background: #1f5a83;
            padding: 1.4mm 3mm;
            border-radius: 0.8mm;
          }

          /* ── Tablolar ───────────────────────────────────────────────────── */
          #hamveri-print-area .hp-info,
          #hamveri-print-area .hp-stats,
          #hamveri-print-area .hp-results,
          #hamveri-print-area .hp-signatures table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 2mm;
            table-layout: fixed;
          }
          #hamveri-print-area .hp-info td {
            border: 0.25mm solid #cbd5e1;
            padding: 1.4mm 2.5mm;
            font-size: 8.5pt;
            vertical-align: top;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }
          #hamveri-print-area .hp-label {
            width: 24%;
            background: #f1f5f9;
            font-weight: 700;
            color: #475569;
            font-size: 7.5pt;
            text-transform: uppercase;
            letter-spacing: 0.2px;
          }
          #hamveri-print-area .hp-value {
            font-weight: 600;
            color: #0f172a;
          }
          #hamveri-print-area .hp-mono {
            font-family: "Consolas", "Courier New", monospace;
            letter-spacing: 0.3px;
          }
          #hamveri-print-area .hp-status {
            color: #1f5a83;
            font-weight: 800;
          }

          /* ── Sonuç özeti ────────────────────────────────────────────────── */
          #hamveri-print-area .hp-stats { text-align: center; }
          #hamveri-print-area .hp-stats th,
          #hamveri-print-area .hp-stats td {
            border: 0.25mm solid #cbd5e1;
            padding: 1.8mm 1mm;
          }
          #hamveri-print-area .hp-stats th {
            background: #f1f5f9;
            font-weight: 700;
            color: #475569;
            font-size: 7.5pt;
            text-transform: uppercase;
            letter-spacing: 0.2px;
          }
          #hamveri-print-area .hp-stats td {
            font-size: 11pt;
            font-weight: 800;
            color: #0f172a;
          }
          #hamveri-print-area .hp-pass { color: #15803d !important; }
          #hamveri-print-area .hp-fail { color: #b91c1c !important; }
          #hamveri-print-area .hp-wait { color: #b45309 !important; }

          /* ── Test sonuçları ─────────────────────────────────────────────── */
          #hamveri-print-area .hp-results th,
          #hamveri-print-area .hp-results td {
            border: 0.25mm solid #cbd5e1;
            padding: 1.4mm 1.8mm;
            font-size: 7.8pt;
            vertical-align: top;
            line-height: 1.3;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }
          #hamveri-print-area .hp-results thead {
            display: table-header-group;
          }
          #hamveri-print-area .hp-results tbody tr {
            page-break-inside: avoid;
          }
          #hamveri-print-area .hp-results th {
            background: #1f5a83;
            color: #ffffff;
            font-weight: 700;
            font-size: 7.5pt;
            letter-spacing: 0.3px;
            text-transform: uppercase;
            text-align: left;
          }
          #hamveri-print-area .hp-results tbody tr:nth-child(even) td {
            background: #f8fafc;
          }
          #hamveri-print-area .hp-center { text-align: center; }
          #hamveri-print-area .hp-test-title {
            font-weight: 700;
            color: #0f172a;
          }
          #hamveri-print-area .hp-test-sub {
            margin-top: 0.3mm;
            font-size: 6.8pt;
            color: #64748b;
            font-style: italic;
          }
          #hamveri-print-area .hp-decision {
            font-weight: 800;
            letter-spacing: 0.2px;
          }
          #hamveri-print-area .hp-decision-pass { color: #15803d; }
          #hamveri-print-area .hp-decision-fail { color: #b91c1c; }
          #hamveri-print-area .hp-decision-na { color: #475569; }
          #hamveri-print-area .hp-decision-wait { color: #b45309; }
          #hamveri-print-area .hp-empty {
            text-align: center;
            font-style: italic;
            color: #94a3b8;
            padding: 5mm !important;
          }

          /* ── İmza ───────────────────────────────────────────────────────── */
          #hamveri-print-area .hp-signatures {
            margin-top: 6mm;
            page-break-inside: avoid;
          }
          #hamveri-print-area .hp-signatures th,
          #hamveri-print-area .hp-signatures td {
            border: 0.25mm solid #cbd5e1;
            text-align: center;
            font-size: 7.5pt;
            padding: 1.5mm;
          }
          #hamveri-print-area .hp-signatures th {
            background: #f1f5f9;
            color: #475569;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.2px;
            font-size: 7pt;
          }
          #hamveri-print-area .hp-sign-cell {
            height: 18mm;
            vertical-align: bottom;
            color: #0f172a;
            font-weight: 600;
          }

          /* ── Alt bilgi ──────────────────────────────────────────────────── */
          #hamveri-print-area .hp-footer {
            margin-top: 5mm;
            padding-top: 2.5mm;
            border-top: 0.5mm solid #1f5a83;
            page-break-inside: avoid;
          }
          #hamveri-print-area .hp-footer-row {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            gap: 4mm;
            font-size: 7.5pt;
            color: #475569;
            padding: 0.4mm 0;
            word-break: break-word;
          }
          #hamveri-print-area .hp-footer-row > span:first-child {
            flex: 1 1 auto;
            min-width: 0;
          }
          #hamveri-print-area .hp-footer-row > span:last-child {
            flex: 0 0 auto;
            text-align: right;
          }
          #hamveri-print-area .hp-footer-main {
            font-weight: 700;
            color: #0f172a;
          }
          #hamveri-print-area .hp-footer-small {
            margin-top: 1mm;
            font-size: 6.8pt;
            color: #94a3b8;
            font-style: italic;
          }
        }
      ` }} />
    </>
  );
}
