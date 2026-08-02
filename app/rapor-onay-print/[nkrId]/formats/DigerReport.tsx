import { JetBrains_Mono } from "next/font/google";
import { ttInterphases } from "@/app/fonts/reportFonts";
import OnayToolbar from "../OnayToolbar";
import type { ReportFormatProps, KarekodInfo } from "../reportTypes";
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

function toMMYY(s: string): string {
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return s;
  return `${m[2]}-${m[3].slice(2)}`;
}

function degerlendirmeLabel(d: string | null): { text: string; cls: string } {
  if (!d || !d.trim()) return { text: "—", cls: "deg-other" };
  const v = d.trim();
  if (v === "Uygun") return { text: "UYGUN", cls: "deg-gecer" };
  if (v === "Uygun Değil") return { text: "UYGUN DEĞİL", cls: "deg-kaldi" };
  if (v === "Değerlendirilemez" || v === "D.Y.") return { text: "D.Y.", cls: "deg-other" };
  return { text: v, cls: "deg-other" };
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
  title = "DENEY RAPORU",
  showAkredite = true,
  showAkrediteLogo = showAkredite,
  akrediteInHeader = false,
  showKabulTarihi = true,
  raporKodu,
  kabulTarihi,
  yayinTarihi,
  akrKodFontSize,
}: {
  title?: string;
  showAkredite?: boolean;
  showAkrediteLogo?: boolean;
  akrediteInHeader?: boolean;
  showKabulTarihi?: boolean;
  raporKodu: string;
  kabulTarihi: string;
  yayinTarihi: string;
  akrKodFontSize: number;
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
            <td style={{ paddingBottom: "4px", width: "20%" }}><strong>Rapor No - Rev. No:</strong></td>
            <td style={{ paddingBottom: "4px", width: "50%" }}>{raporKodu}</td>
            {showKabulTarihi ? (
              <>
                <td style={{ paddingBottom: "4px" }}></td>
                <td style={{ paddingBottom: "4px" }}></td>
              </>
            ) : (
              <>
                <td style={{ paddingBottom: "4px" }}><strong>Rapor Yayın Tarihi:</strong> </td>
                <td style={{ paddingBottom: "4px" }}>{yayinTarihi}</td>
              </>
            )}
          </tr>
          {showKabulTarihi && (
            <tr>
              <td style={{ paddingBottom: "4px", width: "20%" }}><strong>Numune Kabul Tarihi:</strong> </td>
              <td style={{ paddingBottom: "4px" }}>{kabulTarihi}</td>
              <td style={{ paddingBottom: "4px" }}><strong>Rapor Yayın Tarihi:</strong> </td>
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
function ApprovalBlock({ hazirlayanAd, karekod }: { hazirlayanAd: string; karekod: KarekodInfo | null }) {
  return (
    <div className="approval-block">
      <div className="approval-cell" style={{ width: 200, paddingTop: "15px" }}>
        <div className="approval-cell-title" style={{ paddingLeft: "5px" }}>Raporu Hazırlayan</div>
        <div className="e-imza-pill" style={{ marginTop: 10 }}>✓ E-İmzalıdır</div>
        <div className="approval-cell-body">
          <div className="approval-name">{hazirlayanAd} <span style={{ fontSize: "9px", color: "#646464" }}>Raportör</span></div>
        </div>
      </div>
      <div className="approval-cell" style={{ width: 300, paddingTop: "15px" }}>
        <div className="approval-cell-title" style={{ paddingLeft: "5px" }}>Onaylayan</div>
        <div className="e-imza-pill" style={{ marginTop: 10 }}>✓ E-İmzalıdır</div>
        <div className="approval-cell-body">
          <div className="approval-name">Oğuzhan EKER <span style={{ fontSize: "9px", color: "#646464" }}>Laboratuvar Müdürü V.</span></div>
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
  );
}

export default function DigerReport({
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

  // Test raporunda DAİMA dış kod gösterilir (ÜGAM/RR26/XXXX/NN — Challenge için RR=CH).
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
          margin-top: 6mm; /* logo ile başlık arasına boşluk (Diğer/sertifika) */
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
        />

        {/* ═══════════════════════════════════════════════════════════
            SAYFA 1 — SERTİFİKA/DİĞER TASARIMI (Ek-1 PDF merge ile eklenir)
            ═══════════════════════════════════════════════════════════ */}
        <div className="page">
          <HeaderBlock showAkredite={hasAkredite} raporKodu={raporKodu} kabulTarihi={kabulTarihi} yayinTarihi={yayinTarihi} akrKodFontSize={akrKodFontSize} />

          {/* ───── MÜŞTERİ / NUMUNE BİLGİLERİ (2 sütun) ───── */}
          <table className="info-table" style={{ marginTop: 20 }}>
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
                  <div className="firma-ad">{header.Numune_Adi}</div>
                  {(header.TesteMiktar || header.TesteMiktarBirim) && (
                    <div className="info-line">
                      <span className="info-label">Miktar: </span>
                      {header.TesteMiktar} {header.TesteMiktarBirim}
                    </div>
                  )}
                  <div className="info-line"><span className="info-label">Üretim Tarihi: </span>{String(header.UretimTarihi || "—")}</div>
                  <div className="info-line"><span className="info-label">Son Kullanım Tarihi: </span>{String(header.SKT || "—")}</div>
                  <div className="info-line"><span className="info-label">Seri/Lot No/Ürün Kodu: </span>{header.SeriNo || "—"}</div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* ───── TEST SONUÇLARI ───── */}
          <div className="results-section" style={{ marginTop: 30 }}>
            <div className="results-title">TEST SONUÇLARI</div>
            <div className="notlar-body"> </div>
            <table className="results">
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Analiz Adı</th> 
                  <th style={{ width: 150, paddingLeft: 5 }}>Metot</th>
                  <th style={{ width: 70 }}>Sonuç</th>
                  <th style={{ width: 100, textAlign: "center" }}>Değerlendirme</th>
                </tr>
              </thead>
              <tbody>
                {hizmetler.length === 0 ? (
                  <tr><td colSpan={4} className="center" style={{ padding: "8px" }}>Atanmış test bulunmuyor.</td></tr>
                ) : (
                  hizmetler.map((h, i) => {
                    const akr = String(h.Akreditasyon || "").trim().toLowerCase() === "var";
                    const deg = degerlendirmeLabel(h.Degerlendirme ?? null);
                    return (
                      <tr key={i}>
                        <td style={{ paddingRight: 10 }}>{akr ? "*" : ""}{h.Ad}</td>
                        <td className="center" style={{ paddingLeft: 5 }}>{h.Metot || "—"}</td>
                        <td className="center">Bkz. Ek-1</td>
                        <td className={deg.cls} style={{ textAlign: "center" }}>{deg.text}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ───── NOTLAR ───── */}
          <div className="notlar">
            <div className="results-title" style={{ marginBottom: "7px" }}>AÇIKLAMALAR</div>
            {testBaslangic && testBitis ? (
              <>
                Analiz Periyodu: {" "}
                <strong>{fmtTarih(testBaslangic)} - {fmtTarih(testBitis)}</strong>{" "}
              </>
            ) : null}
            <br />Müşteri talebi doğrultusunda yapılan testler &apos;TİTCK Kozmetik Ürünlerin Mikrobiyolojik Kontrolüne İlişkin Kılavuz&apos;a göre değerlendirilmiştir.
            {revizeNot && (
              <div style={{ marginTop: 8, fontWeight: "bold" }}>
                <br />Revizyon Açıklaması: {revizeNot}
              </div>
            )}
          </div>

          {/* ───── İMZA BLOĞU ───── */}
          <ApprovalBlock hazirlayanAd={hazirlayanAd} karekod={karekod} />

          {/* ───── FOOTER NOTU ───── */}
          <div className="FooterNot">
            &ldquo;*&rdquo; işaretli analizler TÜRKAK tarafından TS EN ISO/IEC 17025&apos;e göre akredite kapsamımızda yer almaktadır.Numune alma işlemi tarafımızdan yapılmamıştır. İmzasız ve mühürsüz Deney Raporları geçersizdir.{" "}{sirketAdi}&apos;nin yazılı izni olmadan bu Analiz Raporu kısmen kopyalanamaz, çoğaltılamaz veya herhangi bir başka amaçla kullanılamaz.Test sonuçları, yukarıda belirtilen numune için geçerlidir. Numunenin ait olduğu lotu temsil etmeyebilir.Deney raporunda yer alan ve sonuçların geçerliliğini etkileyen tanımsal bilgiler müşteri tarafından beyan edilmiştir. Bu bilgilerin doğruluğundan ve kullanımına bağlı oluşabilecek tüm kayıplardan/yasal zorunluluklardan laboratuvarımız sorumlu değildir. Karar Kuralı: Müşteri, “Ölçüm belirsizliği dahil edilmeden” uygunluk beyanı verilmesini istediğini belirtmiştir. Mikrobiyolojik analizler için uygunluk değerlendirilmesine ilişkin karar kuralı, ölçüm belirsizliği dikkate alınmaksızın uygulanır.
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
                Sayfa: 1
              </div>
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
