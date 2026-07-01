import { JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// ProformaPrintDocument — TAŞINABİLİR proforma fatura çıktısı (PDF/A4).
//
// Saf sunum: yalnızca (header + satirlar + sirketAdi/sirketEmail) verisinden
// türer; DB / session / env bağımlılığı YOKTUR. Müşteri portalına kopyalanıp
// kullanılabilir.
//
// Teklif bileşeninden (TeklifPrintDocument) bağımsız — proforma'ya özgü
// notlar, banka/IBAN bölümü, hizmet açıklaması "..." cümlesi vb. burada.
// ─────────────────────────────────────────────────────────────────────────────

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export interface ProformaHeader {
  /** Proforma numarası (örn. PRF-2026-0001) */
  ProformaNo: string | null;
  /** dd.MM.yyyy formatında tarih (FORMAT ile hazırlanmış) */
  Tarih: string;
  /** Müşteri serbest notu — varsa Notlar bloğunun sonuna eklenir */
  Notlar: string | null;
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

export interface ProformaSatir {
  HizmetAdi: string;
  Adet: number | string | null;
  /** Birim fiyat (DB'de BirimFiyat) */
  Fiyat: number | string | null;
  ParaBirimi: string | null;
  Iskonto: number | string | null;
  /** ProformaKalem'de RaporNoListesi → açıklama olarak göster */
  Notlar?: string | null;
}

/** Banka / IBAN bilgisi — proforma'ya özgü */
export interface BankaBilgi {
  banka: string;
  hesapSahibi: string;
  iban: string;
  /** TRY / USD / EUR vb. */
  paraBirimi: string;
}

function fmt(n: unknown) {
  const num = Number.parseFloat(String(n ?? ""));
  if (isNaN(num)) return "0,00";
  return num.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// JetBrains Mono'da ₺ glyph'i yok → "₺"/"TRY" ise "TL" göster.
function fmtPb(pb: string | null | undefined) {
  const v = String(pb ?? "").trim();
  if (!v) return "TL";
  if (v === "₺" || v.toUpperCase() === "TRY" || v.toUpperCase() === "TL") return "TL";
  return v;
}

export default function ProformaPrintDocument({
  header: h,
  satirlar,
  sirketAdi = "UNIQUE ANALYSE",
  sirketEmail = "info@uniqueanalyse.com",
  bankaBilgileri = [],
  tlEquivalentNote,
  toolbar,
}: {
  header: ProformaHeader;
  satirlar: ProformaSatir[];
  sirketAdi?: string;
  sirketEmail?: string;
  /** Banka hesap bilgileri (TL/USD/EUR vb.). Boş bırakılırsa banka bloğu gizlenir. */
  bankaBilgileri?: BankaBilgi[];
  /** Yabancı para proformalarda "TL Karşılığı: …" satırı (consumer hesaplayıp verir) */
  tlEquivalentNote?: string | null;
  toolbar?: ReactNode;
}) {
  const proformaNo = h.ProformaNo || "—";

  // ── Hesaplamalar ──
  const kdvOran = Number.parseFloat(String(h.KdvOran ?? "")) || 20;
  const genelIsk = Number.parseFloat(String(h.GenelIskonto ?? "")) || 0;
  let araToplam = 0;
  for (const s of satirlar) {
    const adet = Number.parseFloat(String(s.Adet ?? "")) || 1;
    const fiyat = Number.parseFloat(String(s.Fiyat ?? "")) || 0;
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
        .prof-root {
          font-family: 'JetBrains Mono', 'Cascadia Mono', Consolas, 'Courier New', monospace;
          background: #f5f5f7;
          color: #1d1d1f;
          font-size: 10.5px;
          line-height: 1.5;
          min-height: 100vh;
          -webkit-font-feature-settings: "calt" 0, "liga" 0;
          font-feature-settings: "calt" 0, "liga" 0;
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
        .top { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 5mm; }
        .logo-img { height: 45px; width: auto; object-fit: contain; }
        .title {
          font-size: 21px; font-weight: 900; color: #1d1d1f;
          letter-spacing: 0.5px; line-height: 1; padding-top: 15px;
        }

        /* ───── Meta info — 2 sütun ──────────────────────────────────── */
        .meta {
          margin-top: 6mm;
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 2mm 12mm; font-size: 11px;
        }
        .meta-row { display: grid; grid-template-columns: 130px 1fr; gap: 8px; padding: 2px 0; }
        .meta-label { color: #1d1d1f; font-weight: 700; }
        .meta-value { color: #1d1d1f; text-align: left; }
        .meta-row.right .meta-value { text-align: right; }

        /* ───── Müşteri bilgileri ────────────────────────────────────── */
        .section-label { font-weight: 700; font-size: 11px; margin-top: 8mm; margin-bottom: 2mm; color: #1d1d1f; }
        .musteri-box { font-size: 11px; line-height: 1.6; color: #1d1d1f; }
        .musteri-box .firma { font-weight: 800; }
        .musteri-box .vergi { color: #6e6e73; font-size: 10px; margin-top: 1mm; }

        /* ───── Kalem tablosu ────────────────────────────────────────── */
        .items { width: 100%; border-collapse: collapse; margin-top: 6mm; font-size: 10.5px; }
        .items thead th {
          font-weight: 700; font-size: 11px; color: #1d1d1f;
          text-align: left; padding: 4px; border-bottom: 1.5px solid #444;
        }
        .items thead th.center { text-align: center; }
        .items thead th.right { text-align: right; }
        .items tbody td { padding: 6px 8px; border-bottom: 1px solid #eaeaea; vertical-align: top; }
        .items tbody td.center { text-align: center; }
        .items tbody td.right { text-align: right; font-variant-numeric: tabular-nums; }
        .items tbody td.no { color: #6e6e73; }
        .item-sub { color: #6e6e73; font-size: 9px; margin-top: 1px; }

        /* ───── Toplam kutusu ────────────────────────────────────────── */
        .totals {
          margin-top: 5mm; border: 2px solid #0071e3; padding: 6px 10px;
          display: flex; flex-direction: column; gap: 2px;
        }
        .totals-row { display: flex; justify-content: space-between; font-size: 11.5px; padding: 3px 4px; }
        .totals-label { color: #1d1d1f; }
        .totals-value { font-variant-numeric: tabular-nums; }
        .totals-row.grand {
          font-weight: 800; font-size: 12.5px;
          border-top: 1px solid #d6dee8; margin-top: 4px; padding-top: 8px;
        }

        /* ───── Banka bilgileri ──────────────────────────────────────── */
        .banka-block { margin-top: 6mm; }
        .banka-title { font-weight: 700; font-size: 10.5px; margin-bottom: 2mm; color: #1d1d1f; }
        .banka-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
          gap: 4mm; font-size: 9.5px;
        }
        .banka-card { border: 1px solid #d6dee8; border-radius: 4px; padding: 6px 9px; }
        .banka-card .pb { font-weight: 800; color: #0071e3; font-size: 10.5px; margin-bottom: 1mm; }
        .banka-card .line { line-height: 1.5; }
        .banka-card .iban { font-weight: 700; font-size: 10px; margin-top: 1mm; letter-spacing: 0.3px; }

        /* ───── Notlar ───────────────────────────────────────────────── */
        .notlar { margin-top: 5mm; margin-left: 2mm; font-size: 8.5px; color: #1d1d1f; line-height: 1.55; }
        .notlar-title { font-weight: 700; font-size: 10px; margin-bottom: 1mm; }
        .notlar p { margin-bottom: 1mm; }

        /* ───── Alt kısım — hazırlayan + logo ────────────────────────── */
        .bottom { margin-top: auto; padding-top: 8mm; display: flex; justify-content: flex-start; align-items: flex-end; }
        .prep { text-align: center; }
        .prep-title { font-weight: 700; font-size: 11px; margin-bottom: 3mm; }
        .e-imza {
          display: inline-flex; align-items: center; gap: 4px;
          background: #ecfeff; color: #0071e3; border: 1px solid #99f6e4;
          padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 600; margin-bottom: 2mm;
        }

        /* ───── Sayfa altı sabit metin ───────────────────────────────── */
        .footer { display: flex; justify-content: space-between; align-items: flex-end; font-size: 8.5px; color: #6e6e73; }

        @media print {
          body { background: #fff; }
          .toolbar { display: none !important; }
          .page-number { visibility: hidden; }
          .page {
            width: 210mm; max-width: 210mm; min-height: 297mm;
            margin: 0 auto; box-shadow: none;
            padding: 10mm 12mm 6mm 12mm;
          }
        }
      `}</style>

      <div className={`prof-root ${jetBrainsMono.className}`}>
        {toolbar}

        <div className="page">
          {/* ───── Üst başlık ───── */}
          <div className="top">
            <div>
              <img src="/unique-logo.png" alt={sirketAdi} className="logo-img" />
            </div>
            <div className="title">PROFORMA FATURA</div>
          </div>

          {/* ───── Meta info ───── */}
          <div className="meta">
            <div>
              <div className="meta-row">
                <span className="meta-label">Proforma No:</span>
                <span className="meta-value">{proformaNo}</span>
              </div>
            </div>
            <div>
              <div className="meta-row right">
                <span className="meta-label"></span>
                <span className="meta-value">{h.Tarih || "—"}</span>
              </div>
            </div>
          </div>

          {/* ───── Müşteri ───── */}
          <div className="section-label">Sayın,</div>
          <div className="musteri-box">
            {h.MusteriAd && <div className="firma">{h.MusteriAd}</div>}
            {h.MusteriAdres && <div style={{ color: "#6e6e73" }}>{h.MusteriAdres}</div>}
            {h.MusteriYetkili && <div>{h.MusteriYetkili}</div>}
            {h.MusteriEmail && <div>{h.MusteriEmail}</div>}
            {(h.VergiDairesi || h.VergiNo) && (
              <div className="vergi">
                {h.VergiDairesi && <span>V.D.: {h.VergiDairesi}</span>}
                {h.VergiDairesi && h.VergiNo && <span> · </span>}
                {h.VergiNo && <span>V.No: {h.VergiNo}</span>}
              </div>
            )}
          </div>
          <br />
          <div>Aşağıda detayları belirtilen hizmetler için proforma faturamızdır.</div>

          {/* ───── Kalem tablosu ───── */}
          <table className="items">
            <thead>
              <tr>
                <th className="center" style={{ width: 36 }}>No</th>
                <th>Hizmet / Açıklama</th>
                <th className="center" style={{ width: 60 }}>Adet</th>
                <th className="right" style={{ width: 120 }}>Birim Fiyat</th>
                <th className="right" style={{ width: 130 }}>Toplam</th>
              </tr>
            </thead>
            <tbody>
              {satirlar.map((s, i) => {
                const adet = Number.parseFloat(String(s.Adet ?? "")) || 1;
                const fiyat = Number.parseFloat(String(s.Fiyat ?? "")) || 0;
                const iskonto = Number.parseFloat(String(s.Iskonto ?? "")) || 0;
                const net = adet * fiyat * (1 - iskonto / 100);
                const sub = (s.Notlar || "").trim();
                return (
                  <tr key={i}>
                    <td className="center no">{i + 1}.</td>
                    <td>
                      <div>{s.HizmetAdi || "—"}</div>
                    </td>
                    <td className="center">{adet}</td>
                    <td className="right">
                      {fiyat > 0
                        ? <>{fmt(fiyat)} {fmtPb(s.ParaBirimi || pb)}{iskonto > 0 ? ` (-%${iskonto})` : ""}</>
                        : "—"}
                    </td>
                    <td className="right">
                      {net > 0 ? <>{fmt(net)} {fmtPb(s.ParaBirimi || pb)}</> : "—"}
                    </td>
                  </tr>
                );
              })}
              {satirlar.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "#6e6e73", padding: "20px" }}>
                    Henüz kalem eklenmedi.
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
                <span className="totals-value">−{fmt(iskontoTutar)} {fmtPb(pb)}</span>
              </div>
            )}
            <div className="totals-row">
              <span className="totals-label">KDV (%{kdvOran}):</span>
              <span className="totals-value">{fmt(kdvTutar)} {fmtPb(pb)}</span>
            </div>
            <div className="totals-row grand" style={{ paddingBottom: "12px" }}>
              <span className="totals-label">Ödenecek Tutar:</span>
              <span className="totals-value">{fmt(genelToplam)} {fmtPb(pb)}</span>
            </div>
            {tlEquivalentNote && (
              <div className="totals-row" style={{ borderTop: "1px solid #d6dee8", marginTop: 4, paddingTop: 7, fontSize: "10px", color: "#4b5563" }}>
                <span className="totals-label">TL Karşılığı:</span>
                <span className="totals-value">{tlEquivalentNote}</span>
              </div>
            )}
          </div>

 

          {/* ───── Notlar (proforma-spesifik) ───── */}
          <div className="notlar">
            <div className="notlar-title">Notlar:</div>
            <p>Bu proforma fatura yalnızca bilgilendirme amaçlıdır; resmi fatura ödeme sonrası düzenlenir.</p>
            <p>Geçerlilik süresi <strong>7 gün</strong>dür; bu süre içinde ödeme yapılmaması halinde proforma yenilenmelidir.</p>
            <p>Yabancı para cinsinden proformalarda ödeme günü TCMB döviz alış kuru üzerinden TL karşılığı dikkate alınır.</p>
            <p>Analiz hizmetleri ödeme onayından sonra başlatılır; rapor, ödemenin tamamlanmasının ardından müşteriye iletilir.</p>
            {/* NOT: ProformaBaslik.Notlar (form'daki "Açıklama") artık İÇ nottur —
                listede görünür ama müşteri çıktısında (PDF) GÖSTERİLMEZ. */}
          </div>

                   {/* ───── Banka bilgileri ───── */}
          {bankaBilgileri.length > 0 && (
            <div className="banka-block">
              <div className="banka-title">Ödeme Bilgileri</div>
              <div className="banka-grid">
                {bankaBilgileri.map((b, i) => (
                  <div key={i} className="banka-card">
                    <div className="pb">{b.paraBirimi}</div>
                    <div className="line"><strong>Banka:</strong> {b.banka}</div>
                   {/*  <div className="line"><strong>Hesap Sahibi:</strong> {b.hesapSahibi}</div> */}
                    <div className="iban">{b.iban}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ───── Hazırlayan + corner logo ───── */}
          <div className="bottom">
            <div className="prep">
              <div style={{ fontWeight: 600, fontSize: 11, marginTop: 2, textAlign: "left" }}>UNIQUE ANALİZ BELGELENDİRME ve DANIŞMANLIK HİZMETLERİ LTD. ŞTİ.</div>
            <p>Atatürk Mah. Hadımköy Yolu Cad. No:10 İç Kapı No:7 Esenyurt / İstanbul</p>
            </div>
            <div className="prep" style={{ marginLeft: "auto", textAlign: "right", marginBottom: "4px" }}>
              <div><img src="/unique-seal.png" alt={sirketAdi} style={{ height: "90px" }} /></div>
            </div>
          </div>

          {/* ───── Footer ───── */}
          <div className="footer" style={{ marginTop: "20px" }}>
            <span>{sirketEmail}</span>
            <span className="page-number">Sayfa: 1 / 1</span>
          </div>
        </div>
      </div>
    </>
  );
}
