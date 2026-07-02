import { Fragment } from "react";
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
    "Test sonuçları müşteri spesifikasyonuna göre değerlendirilmiştir.";
  const aciklamaSatirlar = aciklamaText.split(/\r?\n/);

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

          /* next/font ile yüklenen JetBrains Mono'yu (latin-ext: ş ğ İ ı ç) öncele */
          font-family: var(--font-rapor), 'JetBrains Mono', 'Cascadia Mono', Consolas, 'Courier New', monospace;
          background: #e9ecef;
          color: var(--ink);
          font-size: 10px;
          line-height: 1.5;
          letter-spacing: -0.02em;
          font-variant-ligatures: none;
          -webkit-font-smoothing: antialiased;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          min-height: 100vh;
        }
        .page {
          max-width: 210mm;
          min-height: 297mm;
          margin: 24px auto 64px;
          background: #fff;
          padding: 8mm;
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

        /* ───── ÜST META BAR (Rapor No/Rev · Kabul · Yayın) ───── */
        .meta-box {
          display: grid;
          grid-template-columns: 1fr 1fr;
          margin-top: 2mm;
          font-size: 10.5px;
        }
        .meta-table {
          font-size: 10.5px;
          letter-spacing: -0.03em;
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
          letter-spacing: -0.03em;
        }
        .info-table .info-line {
          color: var(--ink);
          font-size: 9.5px;
          letter-spacing: -0.03em;
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
          letter-spacing: -0.03em;
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
          letter-spacing: -0.03em;
          border-bottom: 1px solid var(--rule-soft);
        }
        .results tbody td.center { text-align: left; }
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
          letter-spacing: -0.02em;
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
          font-size: 7px;
          line-height: 1.5;
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
        }
        .sirket-bilgisi {
          text-align: center;
          margin-bottom: 12px;
          line-height: 1.7;
        }
        .dokuman-bilgisi {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }
        .sol-alt {
          text-align: left;
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
          .onay-toolbar { display: none !important; }
          /* TEK SAYFA garantisi: min-height yerine SABIT height + overflow:hidden.
             rapor-altbilgi (firma adı/Sayfa No) doğal akışta sayfa sonuna gelir;
             içerik 297mm'i aşarsa ikinci sayfa yerine kırpılır. */
          .page {
            width: 210mm; max-width: 210mm;
            height: 297mm; min-height: 297mm; max-height: 297mm;
            margin: 0 auto; box-shadow: none;
            padding: 8mm;
            overflow: hidden;
            page-break-after: avoid;
            page-break-inside: avoid;
          }
          html, body { height: 297mm; overflow: hidden; }
        }
      `}</style>

      <div className={`root ${jetbrains.variable}`}>
        {!hideToolbar && (
          <OnayToolbar
            nkrId={nkrId}
            format={format}
            initialOnay={onay}
            raporNo={header.RaporNo}
          />
        )}

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

          {/* ───── DENEY RAPORU BAŞLIK + (akredite varsa) akreditasyon kutusu ─────
              Akreditasyon yoksa sağda TÜRKAK logosu (30mm) olmadığından header
              alçalıp başlık logoya yapışıyor → bu durumda üstten boşluk ekle. */}
          <div className="title-row" style={!hasAkredite ? { marginTop: "16mm" } : undefined}>
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
                <td style={{ paddingBottom: "4px" , width: "20%" }}><strong>Rapor No / Rev. No:</strong></td>
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
                  <div className="firma-ad">
                    {edit
                      ? editText(header.Numune_Adi || "", (v) => edit.onHeaderChange({ Numune_Adi: v }), { placeholder: "Numune adı" })
                      : header.Numune_Adi}
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
          <div className="results-section" style={{ marginTop: 30 }}>
            <div className="results-title">TEST SONUÇLARI</div>
            <div className="notlar-body"> </div>
            <table className="results">
              <thead>
                <tr>
                  <th style={{ width: "auto"}}>Analiz Adı</th>
                  <th style={{ width: 50 }}>Birim</th>
                  <th style={{ width: 110 }}>Sonuç</th>
                  <th style={{ width: 50 ,paddingLeft: 5}}>LOQ</th>
                  <th style={{ width: 50 ,paddingLeft: 5}}>Ö.B.</th>
                  <th style={{ width: 110 ,paddingLeft: 5}}>Metot</th>
                  <th style={{ width: 70 }}>Limit</th>
                  <th style={{ width: 100, textAlign: "center" }}>Değerlendirme</th>
                  {editing && <th style={{ width: 40 }}></th>}
                </tr>
              </thead>
              <tbody>
                {hizmetler.length === 0 ? (
                  <tr>
                    <td colSpan={editing ? 9 : 8} style={{ textAlign: "center", color: "#6e6e73", padding: "30px" }}>
                      {editing ? "Henüz satır yok — aşağıdan “Satır Ekle” ile ekleyin." : "Bu rapor formatına ait hizmet bulunamadı."}
                    </td>
                  </tr>
                ) : (
                  hizmetler.map((h, i) => {
                    const isAkr = String(h.Akreditasyon || "").trim().toLowerCase() === "var";
                    const deg = degerlendirmeLabel(h.Degerlendirme);
                    const alt = h.altParametreler || [];
                    return (
                      <Fragment key={i}>
                        <tr>
                          <td style={{paddingRight:10 }}>
                            {edit
                              ? editText(h.Ad || "", (v) => edit.onRowChange(i, { Ad: v }), { placeholder: "Analiz adı" })
                              : <>{isAkr ? "*" : ""}{h.Ad}</>}
                          </td>
                          <td className="center">{edit ? editText(h.Birim || "", (v) => edit.onRowChange(i, { Birim: v }), { center: true }) : (h.Birim || "-")}</td>
                          <td className="center">{edit ? editText(h.Sonuc || "", (v) => edit.onRowChange(i, { Sonuc: v }), { center: true }) : (h.Sonuc || "-")}</td>
                          <td className="center" style={{ paddingLeft: 5 }}>{edit ? editText(h.LOQ || "", (v) => edit.onRowChange(i, { LOQ: v }), { center: true }) : (h.LOQ || "-")}</td>
                          <td className="center muted" style={{ paddingLeft: 5 }}>-</td>
                          <td className="center" style={{ paddingLeft: 5 }}>{edit ? editText(h.Metot || "", (v) => edit.onRowChange(i, { Metot: v }), { center: true }) : (h.Metot || "-")}</td>
                          <td className="center">{edit ? editText(h.LimitDeger || "", (v) => edit.onRowChange(i, { LimitDeger: v }), { center: true }) : (h.LimitDeger || "-")}</td>
                          {edit ? (
                            <td style={{ textAlign: "center" }}>
                              <select
                                className="rd-edit"
                                value={h.Degerlendirme || ""}
                                onChange={(e) => edit.onRowChange(i, { Degerlendirme: e.target.value })}
                                style={{ textAlign: "center" }}
                              >
                                <option value="">-</option>
                                <option value="Uygun">Uygun</option>
                                <option value="Uygun Değil">Uygun Değil</option>
                                <option value="D.Y.">D.Y.</option>
                              </select>
                            </td>
                          ) : (
                            <td className={deg.cls} style={{textAlign:"center"}}>{deg.text}</td>
                          )}
                          {editing && (
                            <td style={{ textAlign: "center" }}>
                              <button type="button" className="rd-row-act" title="Satırı sil" onClick={() => edit?.onRemoveRow(i)}>✕</button>
                            </td>
                          )}
                        </tr>
                        {/* Alt parametreler — ana analizin altında, girintili bileşen satırları */}
                        {alt.map((ap, j) => {
                          const adeg = degerlendirmeLabel(ap.Degerlendirme || null);
                          return (
                            <tr key={`${i}-alt-${j}`} className="alt-param-row">
                              <td style={{ paddingLeft: 18, paddingRight: 10 }}>↳ {ap.BilesenAdi || "-"}</td>
                              <td className="center">{ap.Birim || "-"}</td>
                              <td className="center">{ap.Sonuc || "-"}</td>
                              <td className="center" style={{ paddingLeft: 5 }}>{ap.LOQ || "-"}</td>
                              <td className="center muted" style={{ paddingLeft: 5 }}>-</td>
                              <td className="center" style={{ paddingLeft: 5 }}>-</td>
                              <td className="center">{ap.Limit || "-"}</td>
                              <td className={adeg.cls} style={{ textAlign: "center" }}>{ap.Degerlendirme ? adeg.text : "-"}</td>
                              {editing && <td />}
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
            {edit && (
              <button type="button" className="rd-add-btn" onClick={() => edit.onAddRow()}>+ Satır Ekle</button>
            )}
          </div>

          {/* ───── NOTLAR ───── */}
          <div className="notlar">
          <div className="results-title" style={{marginBottom: "7px"}}>AÇIKLAMALAR</div> 
              {testBaslangic && testBitis ? (
                <>
                  Analiz Periyodu: {" "}
                  <strong>{fmtTarih(testBaslangic)} - {fmtTarih(testBitis)}</strong>{" "}
                </>
              ) : null}
            {edit ? (
              <textarea
                className="rd-edit-area"
                style={{ marginTop: 6 }}
                value={header.Aciklamalar ?? ""}
                placeholder="Açıklama metni — boş bırakılırsa varsayılan cümle kullanılır."
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
                <br />Revizyon Açıklaması: {revizeNot}
              </div>
            )}
          </div>

          {/* ───── İMZA BLOĞU (2 hücre: Raporu Hazırlayan · Onaylayan) ─────  */}
          <div className="endof">* Rapor Sonu *</div>
          
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
                &ldquo;*&rdquo; işaretli analizler TÜRKAK tarafından TS EN ISO/IEC 17025&apos;e göre akredite kapsamımızda yer almaktadır.Numune alma işlemi tarafımızdan yapılmamıştır. İmzasız ve mühürsüz Deney Raporları geçersizdir.{" "}{sirketAdi}&apos;nin yazılı izni olmadan bu Analiz Raporu kısmen kopyalanamaz, çoğaltılamaz veya herhangi bir başka amaçla kullanılamaz.Test sonuçları, yukarıda belirtilen numune için geçerlidir. Numunenin ait olduğu lotu temsil etmeyebilir.Deney raporunda yer alan ve sonuçların geçerliliğini etkileyen tanımsal bilgiler müşteri tarafından beyan edilmiştir. Bu bilgilerin doğruluğundan ve kullanımına bağlı oluşabilecek tüm kayıplardan/yasal zorunluluklardan laboratuvarımız sorumlu değildir. Karar Kuralı: Müşteri, “Ölçüm belirsizliği dahil edilmeden” uygunluk beyanı verilmesini istediğini belirtmiştir. Mikrobiyolojik analizler için uygunluk değerlendirilmesine ilişkin karar kuralı, ölçüm belirsizliği dikkate alınmaksızın uygulanır.
          </div>

             <div style={{marginTop:"10px"}}></div>
       

<div className="rapor-altbilgi">
  <div className="sirket-bilgisi">
    <strong>UNIQUE ANALİZ BELGELENDİRME ve GÖZETİM HİZMETLERİ LTD. ŞTİ.</strong><br></br>
    Atatürk Mah. Hadımköy Yolu Cad. No:10 İç Kapı No:7 Esenyurt / İstanbul | info@uniqueanalyse.com
  </div>

  <div className="dokuman-bilgisi">
    <div className="sol-alt">
      Ek-1.PR.20/Rev.02/12.06.2026
    </div>
    <div className="sag-alt">
      Sayfa: 1 / 1
    </div>
  </div>
</div>




        </div>
      </div>
    </>
  );
}
