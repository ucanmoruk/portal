import { JetBrains_Mono } from "next/font/google";
import OnayToolbar from "../OnayToolbar";
import type { ReportFormatProps } from "../reportTypes";
import { TableBody } from "@/components/ui/table";
import { disRaporLabel } from "@/lib/disKod";

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

// DD.MM.YYYY → MM-YY (eşleşmezse olduğu gibi döner)
function toMMYY(s: string): string {
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return s;
  return `${m[2]}-${m[3].slice(2)}`;
}

// Test sonucu değerlendirme metnine göre etiket
function degerlendirmeLabel(d: string | null): { text: string; cls: string } {
  if (!d || !d.trim()) return { text: "—", cls: "deg-other" };
  const v = d.trim();
  if (v === "Uygun") return { text: "UYGUN", cls: "deg-gecer" };
  if (v === "Uygun Değil") return { text: "UYGUN DEĞİL", cls: "deg-kaldi" };
  if (v === "Değerlendirilemez" || v === "D.Y.") return { text: "D.Y.", cls: "deg-other" };
  return { text: v, cls: "deg-other" };
}

export default function ChallengeReport({
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

  return (
    <>
      <style>{`
        @page { size: A4; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .root {
          font-family: 'JetBrains Mono', 'Cascadia Mono', Consolas, 'Courier New', monospace;
          background: #e9ecef;
          color: #1d1d1f;
          font-size: 10.5px;
          line-height: 1.45;
          min-height: 100vh;
        }
        .page {
          max-width: 210mm;
          min-height: 297mm;
          margin: 24px auto 64px;
          background: #fff;
          padding: 8mm 8mm 8mm 8mm;
          box-shadow: 0 4px 24px rgba(0,0,0,0.08);
          display: flex;
          flex-direction: column;
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
          transform: translateX(5px);
        }

        /* ───── DENEY RAPORU BAŞLIK ───── */
        .title-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .report-title {
          font-size: 25px;
          font-weight: 800;
          color: #000000;
        }
        .akredite-box {
          border-collapse: collapse;
          width: 20mm;
          table-layout: fixed;
        }
        .akredite-box td {
          border: 1px solid #000;
          width: 20mm;
          height: 8mm;
          text-align: center;
          vertical-align: middle;
          font-size: 11px;
          padding: 0 1px;
          overflow: hidden;
          word-break: break-all;
          line-height: 1.1;
        }

        /* ───── ÜST META BAR (2x2: Rapor No/Rev · Sayfa · Kabul · Yayın) ───── */
        .meta-box {
          display: grid;
          grid-template-columns: 1fr 1fr;
          margin-top: 2mm;
          font-size: 12px;
        }

        .meta-table{
          font-size: 11px;              
          letter-spacing: -0.05em;     
          margin-top: 30px;}
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
          color: #000000;
          font-size: 12px;
          letter-spacing: -0.05em;
          font-weight: 700;
          text-align: left;
          width: 55%;
        }
        .info-table td {
          vertical-align: top;
          line-height: 1.55;
        }
        .info-table .firma-ad {
          font-size: 11px;
          padding-top: 5px;
          letter-spacing: -0.05em;
        }
        .info-table .info-line {
          color: #1d1d1f;
          font-size:10px;
          letter-spacing: -0.05em;
        }
      

        /* ───── TEST SONUÇLARI SECTION ───── */
        .results-section {
          margin-top: 5mm;
        }
        .results-title {
          background: #ffffff;
          color: #000000;
          font-size: 12px;
          font-weight: 700;
          text-align: left;
          letter-spacing: -0.05em;
        }
        .results-subtitle {          
          font-size: 10px;
          color: #000000;
          background: #ffffff;
          padding-top: 4px;
          padding-bottom: 10px;
          letter-spacing: -0.05em;
        }
        .results {
          border-collapse: collapse; 
          width: 100%;
        }
          .results tr:last-child td {
            padding-bottom: 7px;
           }
        .results thead th {
          background: #ffffff;
          font-weight: 600;
          color: #000000;
          padding-top: 6px;
          padding-bottom: 6px;
          border-bottom: 2px solid #000000;
          text-align: left;
          font-size: 11.5px;
          letter-spacing: -0.05em;
        }
        .results tbody td {
          padding-top: 7px;
          vertical-align: middle;
          font-size: 10px;
          text-align: left;
          letter-spacing: -0.05em;
        }
        .results tbody td.center { text-align: left; }
        .results tbody td.muted { color: #000000; font-size: 8px; }
        .results tbody td.bold { font-weight: 700; }
        .deg-gecer { color: #000000; font-weight: 700; text-align: center; }
        .deg-kaldi { color: #000000; font-weight: 700; text-align: center; }
        .deg-other { color: #000000; t }

        /* ───── NOTLAR ───── */
        .notlar {ext-align: center;
          margin-top: 5mm;
          font-size: 9px;
          color: #000000;
        }
        .notlar-title {
          background: #ffffff;
          color: #000000;
          font-size: 9px;
          font-weight: 700;
        }
        .notlar-body {
        }
        .notlar-body p { margin-bottom: 4px; }
        .notlar-body p:last-child { margin-bottom: 0; }
        .notlar-body .legend {
          font-weight: 700;
          color: #1d1d1f;
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
          background: #ffffff;
          color: #000000;
          font-size: 11px;
          font-weight: 700;
          text-align: left;
        }
        .approval-cell-body {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: left;
          padding: 5px;
          text-align: left;
        }
        .e-imza-pill {
          display: inline-flex;
          align-items: center;
          width: fit-content;
          gap: 4px;
          background: #e8f4f8;
          color: #4A46E5;
          border: 1px solid #b8dbe3;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 9px;
          font-weight: 600;
        }
        .approval-name {
          font-weight: 700;
          font-size: 10px;
          margin-top: 2mm;          
          text-align: left;
          width: 100%;
        }
        .approval-date {
          font-size: 8.5px;
          color: #6e6e73;
          margin-top: 1px;
        }
        .approval-role {
          font-size: 9px;
          color: #6e6e73;
          margin-top: 1px;
        }

        .inner-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr); 
          gap: 4px; 
        }

        .grid-header {
          grid-column: span 4; /* En önemli kısım: 4 sütun boyunca uzanmasını sağlar! */
          background-color: #ffffff; /* Farklı görünmesi için koyu gri arka plan */
          padding: 8px;
          text-align: center;
          font-weight: bold;
        }

        .grid-item {
          background-color: #fff; 
          padding: 5px;
          text-align: center;
        }

        /* ───── FOOTER ───── */
        .footer {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          font-size: 9px;
          color: #6e6e73;
          margin-top: 4mm;
          padding-top: 3mm;
        }

        .FooterNot{
        font-size:6px;
        text-align: justify;
        }

        @media print {
          body { background: #fff; }
          .onay-toolbar { display: none !important; }
          /* TEK SAYFA garantisi: sabit height + overflow:hidden. Içerik 297mm'i
             aşarsa ikinci sayfaya geçmek yerine kırpılır. */
          .page {
            width: 210mm; max-width: 210mm;
            height: 297mm; min-height: 297mm; max-height: 297mm;
            margin: 0 auto; box-shadow: none;
            padding: 8mm 8mm 8mm 8mm;
            overflow: hidden;
            page-break-after: avoid;
            page-break-inside: avoid;
          }
          html, body { height: 297mm; overflow: hidden; }
        }
      `}</style>

      <div className={`root ${jetbrains.variable}`}>
        <OnayToolbar
          nkrId={nkrId}
          format={format}
          initialOnay={onay}
          raporNo={header.RaporNo}
        />

        <div className="page">
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

          {/* ───── DENEY RAPORU BAŞLIK + (akredite varsa) akreditasyon kutusu ───── */}
          <div className="title-row">
            <div className="report-title">DENEY RAPORU</div>
            {hasAkredite && (
              <table className="akredite-box">
                <tbody>
                  <tr><td>AB-2015-T</td></tr>
                  <tr><td style={{ fontSize: `${akrKodFontSize}px` }}>{raporKodu}</td></tr>
                  <tr><td>{toMMYY(yayinTarihi)}</td></tr>
                </tbody>
              </table>
            )}
          </div>

          {/* ───── ÜST META: Rapor No/Rev · Sayfa · Kabul · Yayın ───── */}

          <table className="meta-table">
            <tbody>
              <tr>
                <td style={{ paddingBottom: "4px" , width: "20%" }}><strong>Rapor No - Rev. No:</strong></td>
                <td style={{ paddingBottom: "4px" , width: "50%" }}>{raporKodu}</td>
                <td style={{ paddingBottom: "4px" }}><strong></strong></td>
                <td style={{ paddingBottom: "4px"  }}></td>
              </tr>
              <tr>
                <td style={{ paddingBottom: "4px" , width: "20%" }}><strong>Numune Kabul Tarihi:</strong> </td>
                <td style={{ paddingBottom: "4px"  }}>{kabulTarihi}</td>
                <td style={{ paddingBottom: "4px"  }}><strong>Rapor Yayın Tarihi:</strong> </td>
                <td style={{ paddingBottom: "4px"  }}>{yayinTarihi}</td>
              </tr>
            </tbody>
          </table>
          <div style={{marginTop: "4px", borderBottom: "2px solid #000000"}}></div>

          {/* ───── MÜŞTERİ / NUMUNE BİLGİLERİ (2 sütun) ───── */}
          <table className="info-table">
            <thead>
              <tr>
                <th>MÜŞTERİ BİLGİLERİ</th>
                <th>NUMUNE BİLGİLERİ</th>
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
                  <div className="firma-ad">
                    {header.Numune_Adi}
                  </div>
                  {(header.TesteMiktar || header.TesteMiktarBirim) && (
                    <div className="info-line">
                      <span className="info-label">Miktar: </span>
                      {header.TesteMiktar} {header.TesteMiktarBirim}
                    </div>
                  )}
                  <div className="info-line">
                    <span className="info-label">Üretim Tarihi: </span>
                    {String(header.UretimTarihi || "—")}
                  </div>
                  <div className="info-line">
                    <span className="info-label">Son Kullanım Tarihi: </span>
                    {String(header.SKT || "—")}
                  </div>
                  <div className="info-line">
                    <span className="info-label">Seri/Lot No/Ürün Kodu: </span>
                    {header.SeriNo || "—"}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

      

          {/* ───── TEST SONUÇLARI ───── */}
          <div className="results-section">
            <div className="results-title">TEST SONUÇLARI</div> *Koruyucu Etkinlik (Challenge) Testi – ISO 11930
            <div className="notlar-body"> </div>
            <table className="limit-table" style={{width: "100%", marginTop: 10, borderCollapse: "collapse", tableLayout: "fixed", fontSize: "9.5px", lineHeight: 1.1}}>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ width: "21%", textAlign: "left", verticalAlign: "middle", border: "1px solid #ccc", padding: "2px 5px" }}>Parametre</th>
                  <th rowSpan={2} style={{ width: "11%", textAlign: "left", verticalAlign: "middle", border: "1px solid #ccc", padding: "2px 5px" }}>İnokülasyon (Cfu) N</th>
                  <th colSpan={4} style={{ textAlign: "left", verticalAlign: "middle", border: "1px solid #ccc", padding: "2px 5px" }}>Numune Sayımı kob/g </th>
                  <th colSpan={3} style={{ textAlign: "left", verticalAlign: "middle", border: "1px solid #ccc", padding: "2px 5px" }}>Düşüş (Log)</th>
                  <th rowSpan={2} style={{ width: "15%", textAlign: "left", verticalAlign: "middle", border: "1px solid #ccc", padding: "2px 5px" }}>Değerlendirme</th>
                 </tr>
                  <tr>
                    <th style={{ width: "11%", textAlign: "center", verticalAlign: "middle", border: "1px solid #ccc", padding: "2px" }}>0. Gün<br />N0</th>
                    <th style={{ width: "7%", textAlign: "center", verticalAlign: "middle", border: "1px solid #ccc", padding: "2px" }}>7. Gün N7</th>
                    <th style={{ width: "7%", textAlign: "center", verticalAlign: "middle", border: "1px solid #ccc", padding: "2px" }}>14. Gün N14</th>
                    <th style={{ width: "7%", textAlign: "center", verticalAlign: "middle", border: "1px solid #ccc", padding: "2px" }}>28. Gün N28</th>
                    <th style={{ width: "8%", textAlign: "center", verticalAlign: "middle", border: "1px solid #ccc", padding: "2px" }}>7. Gün<br />N7</th>
                    <th style={{ width: "8%", textAlign: "center", verticalAlign: "middle", border: "1px solid #ccc", padding: "2px" }}>14. Gün N14</th>
                    <th style={{ width: "8%", textAlign: "center", verticalAlign: "middle", border: "1px solid #ccc", padding: "2px" }}>28. Gün N28</th>
                  </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>Pseudomonas aeruginosa</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>1,7 x 10^7</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>1,7 x 10^7</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>&lt;10</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>&lt;10</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>&lt;10</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>3.2x10^5</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>1.8x10^4</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>&lt;10</td>
                  <td rowSpan={5} style={{ border: "1px solid #ccc", padding: "2px 5px", textAlign: "center", verticalAlign: "middle", fontWeight: 700 }}>Uygun</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>Escherichia coli</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>1,9 x 10^7</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>1,9 x 10^7</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>&lt;10</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>&lt;10</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>&lt;10</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>3.2x10^5</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>1.8x10^4</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>10</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>Staphylococcus aureus</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>1,5 x 10^7</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>1,5 x 10^7</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>&lt;10</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>&lt;10</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>&lt;10</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>3.2x10^5</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>1.8x10^4</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>10</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>Candida albicans</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>1,8 x 10^6</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>1,8 x 10^7</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>&lt;10</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>&lt;10</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>&lt;10</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>4.0x10^4</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>2.5x10^3</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>10</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>Aspergillus brasiliensis</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>1,4 x 10^6</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>1,4 x 10^7</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>-</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>&lt;10</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>&lt;10</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>&lt;10</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>2.5x10^3</td>
                  <td style={{ border: "1px solid #ccc", padding: "2px 5px" }}>10</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* --limitler-- */}
         <div style={{marginTop:"10px"}}>Test Limitleri</div>
          <table className="limit-table" style={{ width: "100%", marginTop:"5px",
            tableLayout: "fixed", borderCollapse: "collapse", textAlign: "center", verticalAlign: "middle", fontSize: "9.5px", lineHeight: 1.1 }}>
  <thead>
    {/* 1. SATIR: Ana Başlıklar (Mikroorganizmalar) */}
    <tr>
      <th style={{ width:"20%", border: "1px solid #ccc", padding: "2px 5px", verticalAlign:"middle"}}>
        Mikroorganizma
      </th>
      <th colSpan={3} style={{ border: "1px solid #ccc", padding: "2px 5px", verticalAlign:"middle" }}>
        Bacteria</th>
      <th colSpan={3} style={{ border: "1px solid #ccc", padding: "2px 5px", verticalAlign:"middle"}}>
        C.Albicans </th>
      <th colSpan={2} style={{ border: "1px solid #ccc", padding: "2px 5px", verticalAlign:"middle"}}>
        A.brasiliensis </th>
    </tr>

    {/* 2. SATIR: Alt Başlıklar (Süreler) */}
    <tr>
      <th style={{ border: "1px solid #ccc", padding: "2px 5px", verticalAlign:"middle" }}>
        Örnekleme Süresi
      </th>
      <th style={{ width: "7%", border: "1px solid #ccc", padding: "2px" }}>T7</th>
      <th style={{ width: "7%", border: "1px solid #ccc", padding: "2px" }}>T14</th>
      <th style={{ width: "7%", border: "1px solid #ccc", padding: "2px" }}>T28</th>
      <th style={{ width: "7%", border: "1px solid #ccc", padding: "2px" }}>T7</th>
      <th style={{ width: "7%", border: "1px solid #ccc", padding: "2px"}}>T14</th>
      <th style={{ width: "7%", border: "1px solid #ccc", padding: "2px" }}>T28</th>
      <th style={{ width: "7%", border: "1px solid #ccc", padding: "2px"}}>T14</th>
      <th style={{ width: "7%", border: "1px solid #ccc", padding: "2px" }}>T28</th>
    </tr>
  </thead>

  <tbody>
    {/* 3. SATIR: Kriter A Verileri */}
    <tr>
      <td style={{ border: "1px solid #ccc", padding: "2px 5px", fontWeight: "bold" }}>Kriter A</td>
      <td style={{ border: "1px solid #ccc", padding: "2px" }}>≥3</td>
      <td style={{ border: "1px solid #ccc", padding: "2px" }}>≥3 ve NIᵇ</td>
      <td style={{ border: "1px solid #ccc", padding: "2px" }}>≥3 ve NI</td>
      <td style={{ border: "1px solid #ccc", padding: "2px" }}>≥1</td>
      <td style={{ border: "1px solid #ccc", padding: "2px" }}>≥1 ve NI</td>
      <td style={{ border: "1px solid #ccc", padding: "2px" }}>≥1 ve NI</td>
      <td style={{ border: "1px solid #ccc", padding: "2px" }}>≥0C</td>
      <td style={{ border: "1px solid #ccc", padding: "2px" }}>≥1 ve NI</td>
    </tr>

    {/* 4. SATIR: Kriter B Verileri */}
    <tr>
      <td style={{ border: "1px solid #ccc", padding: "2px 5px", fontWeight: "bold" }}>Kriter B</td>
      <td style={{ border: "1px solid #ccc", padding: "2px" }}>-</td>
      <td style={{ border: "1px solid #ccc", padding: "2px" }}>≥3</td>
      <td style={{ border: "1px solid #ccc", padding: "2px" }}>≥3 ve NI</td>
      <td style={{ border: "1px solid #ccc", padding: "2px" }}>-</td>
      <td style={{ border: "1px solid #ccc", padding: "2px" }}>≥1</td>
      <td style={{ border: "1px solid #ccc", padding: "2px" }}>≥1 ve NI</td>
      <td style={{ border: "1px solid #ccc", padding: "2px" }}>≥0</td>
      <td style={{ border: "1px solid #ccc", padding: "2px" }}>≥0 ve NI</td>
    </tr>
  </tbody>
</table>

              {/* ───── NOTLAR ───── */}
          <div className="notlar">
          <div className="results-title" style={{marginBottom:"4px"}}>AÇIKLAMALAR</div>    
              {testBaslangic && testBitis ? (
                <>
                  Müşteri talebi doğrultusunda yapılan testlerin uygulama periyodu{" "}
                  <strong>{fmtTarih(testBaslangic)} - {fmtTarih(testBitis)}</strong> aralığındadır.{" "}
                </>
              ) : null}
            <br></br>Test sonuçları müşteri spesifikasyonuna göre değerlendirilmiştir.
            {revizeNot && (
              <div style={{ marginTop: 8, fontWeight: "bold" }}>
                <br />Revizyon Açıklaması: {revizeNot}
              </div>
            )}
          </div>

          {/* ───── İMZA BLOĞU (2 hücre: Raporu Hazırlayan · Onaylayan) ───── */}
          <div className="approval-block">
            <div className="approval-cell" style={{width:200, paddingTop:"15px"}}>
              <div className="approval-cell-title" style={{paddingLeft:"5px"}}>Raporu Hazırlayan</div>
              <div className="e-imza-pill" style={{marginTop:10}}>✓ E-İmzalıdır</div>
              <div className="approval-cell-body">
                <div className="approval-name">{hazirlayanAd} <span style={{fontSize:"9px" , color:"#646464"}}>Raportör</span></div>
              </div>
            </div>
            <div className="approval-cell" style={{width:300, paddingTop:"15px"}}>
              <div className="approval-cell-title" style={{paddingLeft:"5px"}}>Onaylayan</div>
              <div className="e-imza-pill" style={{marginTop:10}}>✓ E-İmzalıdır</div>
              <div className="approval-cell-body">
                <div className="approval-name">Alaettin ÖZDEMİR <span style={{fontSize:"9px" , color:"#646464"}}>Laboratuvar Müdürü</span></div>
             
              </div>
            </div>
            <div className="approval-cell">
              <div className="approval-cell-title">
                <img src="/unique-seal.png" alt="UNIQUE ANALYSE" style={{width: 90}}/>
              </div>
              <div className="approval-cell-body">
              </div>
            </div>
            <div className="approval-cell">
              <div className="approval-cell-title">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={karekod?.qrDataUrl || "/karekod.png"}
                  alt="Rapor Doğrulama Karekodu"
                  title={karekod?.url || "Rapor doğrulama"}
                  style={{ width: 90 }}
                />
              </div>
              <div className="approval-cell-body">
                {karekod?.dogrulamaKod && (
                  <div
                    title="Doğrulama Kodu — manuel doğrulamada bu kod kullanılır"
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

          {/* ───── FOOTER ───── */}

          <div className="FooterNot">
                &ldquo;*&rdquo; işaretli analizler TÜRKAK tarafından TS EN ISO/IEC 17025&apos;e göre akredite kapsamımızda yer almaktadır.Numune alma işlemi tarafımızdan yapılmamıştır. İmzasız ve mühürsüz Analiz Raporları geçersizdir.{" "}{sirketAdi}&apos;nin yazılı izni olmadan bu Analiz Raporu kısmen kopyalanamaz, çoğaltılamaz veya herhangi bir başka amaçla kullanılamaz.Test sonuçları, yukarıda belirtilen numune için geçerlidir. Numunenin ait olduğu lotu temsil etmeyebilir.Deney raporunda yer alan ve sonuçların geçerliliğini etkileyen tanımsal bilgiler müşteri tarafından beyan edilmiştir. Bu bilgilerin doğruluğundan ve kullanımına bağlı oluşabilecek tüm kayıplardan/yasal zorunluluklardan laboratuvarımız sorumlu değildir. Karar Kuralı: Müşteri, “Ölçüm belirsizliği dahil edilmeden” uygunluk beyanı verilmesini istediğini belirtmiştir. Mikrobiyolojik analizler için uygunluk değerlendirilmesine ilişkin karar kuralı, ölçüm belirsizliği dikkate alınmaksızın uygulanır.
          </div>




             <div className="footer" style={{marginTop:"5px"}}>
            <span> {process.env.SIRKET_EMAIL || "info@uniqueanalyse.com"}</span>
            <span>Ek-1.PR.20 Geçerlilik Tarihi: 25.11.2024 / 01</span>            
            <span className="page-number">Sayfa: 1 / 1</span>            
          </div>


        </div>
      </div>
    </>
  );
}
