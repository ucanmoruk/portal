import { JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// TeklifPrintDocument — TAŞINABİLİR teklif çıktısı (PDF/A4) bileşeni.
//
// Saf sunum: yalnızca (header + satirlar + sirketAdi) verisinden türer; veritabanı,
// session veya env bağımlılığı YOKTUR. Bu yüzden müşteri portalına AYNEN kopyalanıp
// kullanılabilir — aynı veriyi (bkz. docs/musteri-portali-teklif-sozlesmesi.md)
// verince çıktı BİREBİR aynı olur.
//
// Kullanım:
//   const h = /* TeklifBaslik satırı + Firma alanları (MusteriAd, Adres, ...) */;
//   const satirlar = /* TeklifKalem satırları */;
//   <TeklifPrintDocument header={h} satirlar={satirlar} sirketAdi="..." />
//   // opsiyonel: toolbar={<KendiToolbarın/>}
// ─────────────────────────────────────────────────────────────────────────────

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export interface TeklifHeader {
  TeklifNo: number | null;
  DisTeklifKodu: string | null;
  RevNo: number;
  Tarih: string;
  Notlar: string | null;
  TeklifKonusu?: string;
  TeklifVeren?: string;
  KdvOran: number | string | null;
  GenelIskonto: number | string | null;
  MusteriAd: string;
  MusteriAdres: string;
  MusteriTelefon?: string;
  MusteriEmail: string;
  VergiDairesi?: string;
  VergiNo?: string;
  MusteriYetkili: string;
}

export interface TeklifSatir {
  HizmetAdi: string;
  Adet: number | string | null;
  Fiyat: number | string | null;
  ParaBirimi: string | null;
  Iskonto: number | string | null;
  Metot: string;
  Akreditasyon: string;
  Notlar?: string | null;
}

function fmt(n: unknown) {
  const num = Number.parseFloat(String(n ?? ""));
  if (isNaN(num)) return "0,00";
  return num.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numOrNull(n: unknown): number | null {
  if (n == null || String(n).trim() === "") return null;
  const num = Number.parseFloat(String(n));
  return Number.isFinite(num) ? num : null;
}

function cleanOfferNotes(notes: string | null | undefined): string {
  const value = String(notes ?? "").trim();
  if (!value) return "";

  const defaultText = "Fiyat teklifimiz";
  if (value === defaultText) return "";
  if (value.startsWith(`${defaultText}\n\n`)) return value.slice(defaultText.length).trim();

  return value;
}

// JetBrains Mono'da ₺ glyph'i yok → "₺"/"TRY" ise "TL" göster.
function fmtPb(pb: string | null | undefined) {
  const v = String(pb ?? "").trim();
  if (!v) return "TL";
  if (v === "₺" || v.toUpperCase() === "TRY" || v.toUpperCase() === "TL") return "TL";
  return v;
}

function teklifLabel(no: number | null, rev: number) {
  if (!no) return "—";
  return `${no}/${String(rev).padStart(2, "0")}`;
}
function disLabel(kod: string | null | undefined, rev: number) {
  if (!kod) return "—";
  return `${kod}/${String(rev).padStart(2, "0")}`;
}

export default function TeklifPrintDocument({
  header: h,
  satirlar,
  sirketAdi = "UNIQUE ANALYSE",
  sirketEmail = "info@uniqueanalyse.com",
  toolbar,
  documentTitle = "FİYAT TEKLİFİ",
  tlEquivalentNote,
}: {
  header: TeklifHeader;
  satirlar: TeklifSatir[];
  sirketAdi?: string;
  sirketEmail?: string;
  toolbar?: ReactNode;
  documentTitle?: string;
  tlEquivalentNote?: string | null;
}) {
  const noLabel = h.DisTeklifKodu ? disLabel(h.DisTeklifKodu, h.RevNo) : teklifLabel(h.TeklifNo, h.RevNo);
  const offerNotes = cleanOfferNotes(h.Notlar);

  // ── Hesaplamalar ──
  const kdvOran = Number.parseInt(String(h.KdvOran ?? ""), 10) || 20;
  const genelIsk = Number.parseFloat(String(h.GenelIskonto ?? "")) || 0;
  let araToplam = 0;
  for (const s of satirlar) {
    const adet = Number.parseInt(String(s.Adet ?? ""), 10) || 1;
    const fiyat = numOrNull(s.Fiyat) ?? 0;
    const iskonto = Number.parseFloat(String(s.Iskonto ?? "")) || 0;
    araToplam += adet * fiyat * (1 - iskonto / 100);
  }
  const iskontoTutar = araToplam * genelIsk / 100;
  const tutar = araToplam - iskontoTutar;
  const kdvTutar = tutar * kdvOran / 100;
  const genelToplam = tutar + kdvTutar;

  // Çoğunluk para birimi
  const pbCount: Record<string, number> = {};
  satirlar.forEach(s => { const p = s.ParaBirimi || "TRY"; pbCount[p] = (pbCount[p] || 0) + 1; });
  const pb = Object.entries(pbCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "TRY";

  return (
    <>
      <style>{`
        @page { size: A4; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .quote-print-root {
          font-family: 'JetBrains Mono', 'Cascadia Mono', Consolas, 'Courier New', monospace;
          background: #f5f5f7;
          color: #1d1d1f;
          font-size: 10.5px;
          line-height: 1.5;
          min-height: 100vh;
          -webkit-font-feature-settings: "calt" 0, "liga" 0;
          font-feature-settings: "calt" 0, "liga" 0;
        }
        .toolbar {
          background: #1d1d1f;
          padding: 12px 24px;
          display: flex;
          gap: 12px;
          align-items: center;
        }
        .btn-pdf {
          background: #0071e3; color: #fff; border: none; border-radius: 8px;
          padding: 8px 20px; font-size: 14px; font-weight: 600; cursor: pointer;
          text-decoration: none; display: inline-flex; align-items: center;
        }
        .btn-pdf:hover { background: #0077ed; }
        .btn-print, .btn-close {
          background: transparent; color: #ffffffcc; border: 1px solid #ffffff44;
          border-radius: 8px; padding: 8px 16px; font-size: 14px; cursor: pointer;
        }

        .page {
          max-width: 210mm;
          min-height: 297mm;
          margin: 24px auto 64px;
          background: #fff;
          padding: 10mm 12mm 8mm 12mm;
          box-shadow: 0 4px 24px rgba(0,0,0,0.08);
          display: flex;
          flex-direction: column;
        }

        /* ───── Üst başlık ───────────────────────────────────────────── */
        .top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding-bottom: 5mm;
          border-bottom: none;
        }
        .logo-wrap { display: flex; align-items: center; gap: 10px; }
        .logo-img { height: 45px; width: auto; object-fit: contain; }
        .title {
          font-size: 21px;
          font-weight: 900;
          color: #1d1d1f;
          letter-spacing: 0,8px;
          line-height: 1;
          padding-top: 15px;
        }

        /* ───── Meta info — 2 sütun ──────────────────────────────────── */
        .meta {
          margin-top: 6mm;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2mm 12mm;
          font-size: 11px;
        }
        .meta-row {
          display: grid;
          grid-template-columns: 120px 1fr;
          gap: 8px;
          padding: 2px 0;
        }
        .meta-label { color: #1d1d1f; font-weight: 700; }
        .meta-value { color: #1d1d1f; text-align: left; }
        .meta-row.right .meta-value { text-align: right; }

        /* ───── Müşteri bilgileri ────────────────────────────────────── */
        .section-label {
          font-weight: 700;
          font-size: 11px;
          margin-top: 8mm;
          margin-bottom: 2mm;
          color: #1d1d1f;
        }
        .musteri-box { font-size: 11px; line-height: 1.6; color: #1d1d1f; }
        .musteri-box .firma { font-weight: 600; }

        /* ───── Hizmet tablosu ───────────────────────────────────────── */
        .services {
          width: 100%;
          border-collapse: collapse;
          margin-top: 6mm;
          font-size: 10.5px;
        }
        .services thead th {
          font-weight: 700;
          font-size: 11px;
          color: #1d1d1f;
          text-align: left;
          padding: 2px 4px;
          border-bottom: 1.5px solid #444;
        }
        .services thead th.center { text-align: center; }
        .services thead th.right { text-align: right; }
        .services tbody td {
          padding: 6px 8px;
          border-bottom: 1px solid #eaeaea;
          vertical-align: top;
        }
        .services tbody td.center { text-align: center; }
        .services tbody td.right { text-align: right; font-variant-numeric: tabular-nums; }
        .services tbody td.no { color: #6e6e73; }

        /* ───── Toplam kutusu ────────────────────────────────────────── */
        .totals {
          margin-top: 5mm;
          border: 2px solid #4A46E5;
          border-radius: 0;
          padding: 6px 10px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .totals-row {
          display: flex;
          justify-content: space-between;
          font-size: 11.5px;
          padding: 3px 4px;
        }
        .totals-label { color: #1d1d1f; }
        .totals-value { font-variant-numeric: tabular-nums; }
        .totals-row.grand {
          font-weight: 700;
          font-size: 12px;
          border-top: 1px solid #d6dee8;
          margin-top: 4px;
          padding-top: 8px;
        }

        /* ───── Notlar ───────────────────────────────────────────────── */
        .notlar {
          margin-top: 5mm;
          margin-left: 2mm;
          font-size: 8px;
          color: #1d1d1f;
          line-height: 1.5;
        }
        .notlar-title { font-weight: 700; font-size: 10px; margin-bottom: 1mm; }
        .notlar p { margin-bottom: 0; }

        /* ───── Onay bloğu ───────────────────────────────────────────── */
        .approval-block { margin-top: 14mm; display: flex; justify-content: flex-end; }
        .approval-content { text-align: center; min-width: 200px; }
        .approval-dash { font-size: 13px; letter-spacing: -1px; color: #1d1d1f; margin-bottom: 2px; }
        .approval-label { font-weight: 700; font-size: 11px; letter-spacing: 0.5px; }
        .approval-sub { font-size: 10px; color: #6e6e73; }

        /* ───── Alt kısım — hazırlayan + logo ────────────────────────── */
        .bottom {
          margin-top: auto;
          padding-top: 8mm;
          display: flex;
          justify-content: flex-start;
          align-items: flex-end;
        }
        .prep { text-align: center; }
        .prep-title { font-weight: 700; font-size: 11px; margin-bottom: 3mm; }
        .e-imza {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: #e8f4f8;
          color: #4A46E5;
          border: 1px solid #b8dbe3;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 600;
          margin-bottom: 2mm;
        }
        .prep-name { font-weight: 600; font-size: 11px; margin-top: 1mm; }

        /* ───── Sayfa altı sabit metin ───────────────────────────────── */
        .footer {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          font-size: 8.5px;
          color: #6e6e73;
        }

        @media print {
          body { background: #fff; }
          .toolbar { display: none !important; }
          .page-number { visibility: hidden; }
          .page {
            width: 210mm;
            max-width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            box-shadow: none;
            padding: 10mm 12mm 6mm 12mm;
          }
        }
      `}</style>

      <div className={`quote-print-root ${jetBrainsMono.className}`}>
        {toolbar}

        <div className="page quote-print-page">
          {/* ───── Üst başlık ───── */}
          <div className="top">
            <div className="logo-wrap">
              <img src="/unique-logo.png" alt={sirketAdi} className="logo-img" />
            </div>
            <div className="title">{documentTitle}</div>
          </div>

          {/* ───── Meta info ───── */}
          <div className="meta">
            <div>
              <div className="meta-row">
                <span className="meta-label" style={{ width: "70%" }}>Referans No:</span>
                <span className="meta-value" style={{ marginLeft: "-40px" }}>{noLabel}</span>
              </div>
            </div>
            <div>
              <div className="meta-row right">
                <span className="meta-label" style={{ marginLeft: "200px" }}></span>
                <span className="meta-value">{h.Tarih || "—"}</span>
              </div>
            </div>
          </div>

          {/* ───── Müşteri ───── */}
          <div className="section-label">Sayın,</div>
          <div className="musteri-box">
            {h.MusteriAd && <div className="firma" style={{ fontWeight: "800" }}>{h.MusteriAd}</div>}
            {h.MusteriAdres && <div style={{ width: "40%", color: "#6e6e73" }}>{h.MusteriAdres}</div>}
            {h.MusteriYetkili && <div>{h.MusteriYetkili}</div>}
            {h.MusteriEmail && <div>{h.MusteriEmail}</div>}
          </div>
          <br />
          <div>Hizmet teklifimiz aşağıdaki gibidir.</div>

          {/* ───── Hizmet tablosu ───── */}
          <table className="services">
            <thead>
              <tr>
                <th className="center" style={{ width: 36 }}>No</th>
                <th>Açıklama</th>
                <th className="center" style={{ width: 60 }}>Adet</th>
                <th className="right" style={{ width: 120 }}>Birim Fiyat</th>
                <th className="right" style={{ width: 130 }}>Toplam Fiyat</th>
              </tr>
            </thead>
            <tbody>
              {satirlar.map((s, i) => {
                const adet = Number.parseInt(String(s.Adet ?? ""), 10) || 1;
                const fiyat = numOrNull(s.Fiyat);
                const iskonto = Number.parseFloat(String(s.Iskonto ?? "")) || 0;
                const net = fiyat == null ? null : adet * fiyat * (1 - iskonto / 100);
                const akr = String(s.Akreditasyon || "").trim().toLowerCase() === "var" ? "*" : "";
                const adi = `${akr}${s.HizmetAdi || ""}${s.Metot ? ` / ${s.Metot}` : ""}`;
                return (
                  <tr key={i}>
                    <td className="center no">{i + 1}.</td>
                    <td>{adi}</td>
                    <td className="center">{adet}</td>
                    <td className="right">
                      {fiyat != null
                        ? <>{fmt(fiyat)} {fmtPb(s.ParaBirimi || pb)}{iskonto > 0 ? ` (-%${iskonto})` : ""}</>
                        : "—"}
                    </td>
                    <td className="right">
                      {net != null ? <>{fmt(net)} {fmtPb(s.ParaBirimi || pb)}</> : "—"}
                    </td>
                  </tr>
                );
              })}
              {satirlar.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "#6e6e73", padding: "20px" }}>
                    Henüz hizmet satırı eklenmedi.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* ───── Toplamlar ───── */}
          <div className="totals">
            <div className="totals-row" style={{ paddingTop: "12px" }}>
              <span className="totals-label">Ara Toplam:</span>
              <span className="totals-value">{fmt(araToplam)} {fmtPb(pb)}</span>
            </div>
            {genelIsk > 0 && (
              <div className="totals-row">
                <span className="totals-label">İskonto (%{genelIsk}):</span>
                <span className="totals-value">{fmt(iskontoTutar)} {fmtPb(pb)}</span>
              </div>
            )}
            <div className="totals-row">
              <span className="totals-label">KDV (%{kdvOran}):</span>
              <span className="totals-value">{fmt(kdvTutar)} {fmtPb(pb)}</span>
            </div>
            <div className="totals-row grand" style={{ paddingBottom: "12px" }}>
              <span className="totals-label">Genel Toplam:</span>
              <span className="totals-value">{fmt(genelToplam)} {fmtPb(pb)}</span>
            </div>
            {tlEquivalentNote && (
              <div className="totals-row" style={{ borderTop: "1px solid #d6dee8", marginTop: 4, paddingTop: 7, fontSize: "10px", color: "#4b5563" }}>
                <span className="totals-label">TL Karşılığı:</span>
                <span className="totals-value">{tlEquivalentNote}</span>
              </div>
            )}
          </div>

          {/* ───── Notlar ───── */}
          <div className="notlar">
            <div className="notlar-title">Notlar:</div>
            <p>Teklifimizin geçerlilik süresi 30 gündür.</p>
            <p>&ldquo;*&rdquo; işaretli analizler TÜRKAK tarafından TS EN ISO/IEC 17025&apos;e göre akreditasyon kapsamımızda yer almaktadır.</p>
            <p>Numune gönderimi kargo ile yapıldığında, kargo ücreti göndericiye aittir.</p>
            <p>Yapılacak analizlere ve hizmetlere ait ücretler, müşteri tarafından peşin olarak ödenir. Rapor, ödeme yapıldıktan sonra müşteriye gönderilir. Ödemenin yapılmaması halinde, {sirketAdi} ödeme yapılıncaya kadar analiz hizmetlerine başlamama veya analiz raporunu müşteriye iletmeme hakkına sahiptir.</p>
            <p>İkinci dilde rapor ve/veya eksik bilgi sebebi ile revize rapor ücreti 10,00 $ + KDV şeklindedir.</p>
            <p>İşbu teklifi onaylayarak {sirketAdi} tarafından verilecek olan hizmetlerin, bu formun bütün sayfalarında yer alan şartlara uygun olarak gerçekleştirilmesini ve bu hizmetler karşılığında uygulanacak fiyat ve ödeme koşullarını gayri kabili rücu olarak kabul ettiğimizi beyan ve taahhüt ederiz.</p>
            {offerNotes && <p style={{ marginTop: "3mm", fontWeight: 600 }}>{offerNotes}</p>}
          </div>
          <br />
          <br />

          {/* ───── Onay ───── */}
          <div className="approval-block">
            <div className="approval-content">
              <div className="approval-dash" style={{ textAlign: "right" }}>_______________</div>
              <div className="approval-label" style={{ textAlign: "right" }}>ONAYLAYAN</div>
              <div className="approval-sub" style={{ textAlign: "right" }}>Kaşe / İmza</div>
            </div>
          </div>

          {/* ───── Hazırlayan + corner logo ───── */}
          <div className="bottom">
            <div className="prep">
              <div className="prep-title">Teklifi Hazırlayan</div>
              <div className="e-imza">✓ E-İmzalıdır</div>
              <div className="prep-name">{h.TeklifVeren || "—"}</div>
            </div>
            <div className="prep" style={{ marginLeft: "auto", textAlign: "right", marginBottom: "4px" }}>
              <div><img src="/unique-seal.png" alt={sirketAdi} style={{ height: "90px" }} /></div>
            </div>
          </div>

          {/* ───── Footer ───── */}
          <div className="footer" style={{ marginTop: "20px" }}>
            <span> {sirketEmail}</span>
            <span>F.01.PR.03 – Yayın Tarihi: 27.09.2023</span>
            <span className="page-number">Sayfa: 1 / 1</span>
          </div>
        </div>
      </div>
    </>
  );
}
