import { JetBrains_Mono } from "next/font/google";
import OnayToolbar from "../OnayToolbar";
import type { ReportFormatProps } from "../reportTypes";
import { TableBody } from "@/components/ui/table";

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
  if (v === "Uygun") return { text: "GEÇER", cls: "deg-gecer" };
  if (v === "Uygun Değil") return { text: "KALDI", cls: "deg-kaldi" };
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
}: ReportFormatProps) {
  const {
    revNo,
    kabulTarihi,
    yayinTarihi,
    hazirlayanAd,
    hazirlayanUnvan,
    onaylayanAd,
    onaylayanUnvan,
    docKodu,
    sirketAdi,
  } = meta;

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
          padding: 12mm 12mm 8mm 12mm;
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
          margin-left: 30px;
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
          font-size: 30px;
          font-weight: 800;
          color: #000000;
        }
        .akredite-box {
          border-collapse: collapse;
        }
        .akredite-box td {
          border: 1px solid #000;
          width: 2.14cm;
          height: 0.69cm;
          text-align: center;
          vertical-align: middle;
          font-size: 11px;
          padding: 0 2px;
        }

        /* ───── ÜST META BAR (2x2: Rapor No/Rev · Sayfa · Kabul · Yayın) ───── */
        .meta-box {
          display: grid;
          grid-template-columns: 1fr 1fr;
          margin-top: 2mm;
          font-size: 12px;
        }

        .meta-table{
          font-size: 12px;
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
          font-size: 14px;
          font-weight: 700;
          text-align: left;
          width: 50%;
        }
        .info-table td {
          vertical-align: top;
          line-height: 1.55;
        }
        .info-table .firma-ad {
          font-size: 12px;
          padding-top: 5px;
        }
        .info-table .info-line {
          color: #1d1d1f;
          font-size:12px;
        }
      

        /* ───── TEST SONUÇLARI SECTION ───── */
        .results-section {
          margin-top: 5mm;
        }
        .results-title {
          background: #ffffff;
          color: #000000;
          font-size: 14px;
          font-weight: 700;
          text-align: left;
        }
        .results-subtitle {          
          font-size: 10px;
          color: #000000;
          background: #ffffff;
          padding-top: 4px;
          padding-bottom: 10px;
        }
        .results {
          width: 100%;
          border-collapse: collapse;
          
        }
        .results thead th {
          background: #ffffff;
          font-weight: 600;
          color: #000000;
          padding-top: 6px;
          padding-bottom: 6px;
          border-bottom: 2px solid #000000;
          text-align: left;
          font-size: 10px;
        }
        .results tbody td {
          padding-top: 7px;
          vertical-align: middle;
          font-size: 8px;
          text-align: left;
        }
        .results tbody td.center { text-align: left; }
        .results tbody td.muted { color: #000000; font-size: 8px; }
        .results tbody td.bold { font-weight: 700; }
        .deg-gecer { color: #000000; font-weight: 700; text-align: center; }
        .deg-kaldi { color: #000000; font-weight: 700; text-align: center; }
        .deg-other { color: #000000; text-align: center; }

        /* ───── NOTLAR ───── */
        .notlar {
          margin-top: 5mm;
          font-size: 8px;
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
          padding-top: 5mm;
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
          align-items: center;
          padding: 5px;
          text-align: center;
        }
        .e-imza-pill {
          display: inline-flex;
          align-items: center;
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
          font-size: 10.5px;
          margin-top: 2mm;
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

        /* ───── FOOTER ───── */
        .footer {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          font-size: 9px;
          color: #6e6e73;
          margin-top: 4mm;
          padding-top: 3mm;
          border-top: 1px solid #d2d2d7;
        }

        @media print {
          body { background: #fff; }
          .onay-toolbar { display: none !important; }
          .page {
            width: 210mm; max-width: 210mm; min-height: 297mm;
            margin: 0 auto; box-shadow: none;
            padding: 12mm 12mm 8mm 12mm;
          }
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
          {/* ───── HEADER: Sol logo + Sağ Türkak/ilac-MRA ───── */}
          <div className="header">
            <div className="header-logo">
              <img src="/unique-logo-wide.png" alt="UNIQUE ANALYSE" />
            </div>
            <div className="header-akredite">
              <img src="/turkak-ilac.jpg" alt="TÜRKAK AB-2015-T · ilac-MRA" />
            </div>
          </div>

          {/* ───── DENEY RAPORU BAŞLIK + akreditasyon kutusu ───── */}
          <div className="title-row">
            <div className="report-title">DENEY RAPORU</div>
            <table className="akredite-box">
              <tbody>
                <tr><td>AB-2015-T</td></tr>
                <tr><td>{header.RaporNo}/{revNo}</td></tr>
                <tr><td>{toMMYY(yayinTarihi)}</td></tr>
              </tbody>
            </table>
          </div>

          {/* ───── ÜST META: Rapor No/Rev · Sayfa · Kabul · Yayın ───── */}

          <table className="meta-table">
            <tbody>
              <tr>
                <td style={{ paddingBottom: "4px" , width: "24%" }}><strong>Rapor No / Rev. No:</strong></td>
                <td style={{ paddingBottom: "4px" , width: "43%" }}>{header.RaporNo} / {revNo}</td>
                <td style={{ paddingBottom: "4px" }}><strong>Sayfa:</strong></td>
                <td style={{ paddingBottom: "4px"  }}>1 / 1</td>
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
                  <div className="info-line">{header.FirmaAdres}</div>
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
                    {fmtTarih(String(header.UretimTarihi || ""))}
                  </div>
                  <div className="info-line">
                    <span className="info-label">Son Kullanım Tarihi: </span>
                    {fmtTarih(String(header.SKT || ""))}
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
            <div className="results-title">TEST SONUÇLARI</div>
            <div className="results-subtitle">
              {testBaslangic && testBitis ? (
                <>
                  Müşteri talebi doğrultusunda yapılan testlerin uygulama periyodu{" "}
                  <strong>{fmtTarih(testBaslangic)} - {fmtTarih(testBitis)}</strong> aralığındadır.{" "}
                </>
              ) : null}
            </div>
            <table className="results">
              <thead>
                <tr>
                  <th style={{ width: "auto", textAlign: "left", paddingLeft: 5 }}>Analiz Adı</th>
                  <th style={{ width: 45 }}>Birim</th>
                  <th style={{ width: 85 }}>Sonuç</th>
                  <th style={{ width: 50 ,paddingLeft: 5}}>LOQ</th>
                  <th style={{ width: 50 ,paddingLeft: 5}}>Ö.B.</th>
                  <th style={{ width: 110 ,paddingLeft: 5}}>Metot</th>
                  <th style={{ width: 70 }}>Limit</th>
                  <th style={{ width: 80 }}>Değerlendirme</th>
                </tr>
              </thead>
              <tbody>
                {hizmetler.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", color: "#6e6e73", padding: "30px" }}>
                      Bu rapor formatına ait hizmet bulunamadı.
                    </td>
                  </tr>
                ) : (
                  hizmetler.map((h, i) => {
                    const isAkr = String(h.Akreditasyon || "").trim().toLowerCase() === "var";
                    const deg = degerlendirmeLabel(h.Degerlendirme);
                    return (
                      <tr key={i}>
                        <td style={{ paddingLeft: 5 }}>
                          {isAkr ? "*" : ""}{h.Ad}
                        </td>
                        <td className="center">{h.Birim || "-"}</td>
                        <td className="center bold">{h.Sonuc || "-"}</td>
                        <td className="center" style={{ paddingLeft: 5 }}>{h.LOQ || "-"}</td>
                        <td className="center muted" style={{ paddingLeft: 5 }}>-</td>
                        <td className="center" style={{ paddingLeft: 5 }}>{h.Metot || "-"}</td>
                        <td className="center">{h.LimitDeger || "-"}</td>
                        <td className={deg.cls}>{deg.text}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ───── NOTLAR ───── */}
          <div className="notlar">
          <div className="notlar-title">AÇIKLAMALAR</div>
            <div className="notlar-body">
              Test sonuçları müşteri spesifikasyonuna göre değerlendirilmiştir. 
            </div>

            <div className="notlar-title" style={{ marginTop: 5 }}>NOTLAR</div>
            <div className="notlar-body">
              <span className="legend">LOQ:</span> Tespit Limiti, <span className="legend">Ö.B.:</span> Ölçüm Belirsizliği
               <br></br>&ldquo;*&rdquo; işaretli analizler TÜRKAK tarafından TS EN ISO/IEC 17025&apos;e göre akredite kapsamımızda yer almaktadır.
               <br></br>
                Numune alma işlemi tarafımızdan yapılmamıştır. İmzasız ve mühürsüz Analiz Raporları geçersizdir.
                {" "}{sirketAdi}&apos;nin yazılı izni olmadan bu Analiz Raporu kısmen kopyalanamaz, çoğaltılamaz veya
                herhangi bir başka amaçla kullanılamaz.
              
            <br></br>
                Test sonuçları, yukarıda belirtilen numune için geçerlidir. Numunenin ait olduğu lotu temsil etmeyebilir.
                Deney raporunda yer alan ve sonuçların geçerliliğini etkileyen tanımsal bilgiler müşteri tarafından
                beyan edilmiştir. Bu bilgilerin doğruluğundan ve kullanımına bağlı oluşabilecek tüm kayıplardan/yasal
                zorunluluklardan laboratuvarımız sorumlu değildir.
              <br></br>
                <span className="legend">Karar Kuralı:</span>{" "} Müşteri, “Ölçüm belirsizliği dahil edilmeden” uygunluk beyanı verilmesini istediğini belirtmiştir. Mikrobiyolojik analizler için uygunluk değerlendirilmesine ilişkin karar kuralı, ölçüm belirsizliği dikkate alınmaksızın uygulanır.
                
            </div>
          </div>

          {/* ───── İMZA BLOĞU (2 hücre: Raporu Hazırlayan · Onaylayan) ───── */}
          <div className="approval-block">
            <div className="approval-cell">
              <div className="approval-cell-title">Raporu Hazırlayan</div>
              <div className="approval-cell-body">
                <div className="approval-name">{hazirlayanAd} -<div className="approval-role">{hazirlayanUnvan}</div></div>
                
              </div>
            </div>
            <div className="approval-cell">
              <div className="approval-cell-title">Onaylayan</div>
              <div className="approval-cell-body">
                {onay ? (
                  <>
                    <div className="e-imza-pill">✓ E-İmzalıdır</div>
                    <div className="approval-name">{onaylayanAd}</div>
                    <div className="approval-role">{onaylayanUnvan}</div>
                    <div className="approval-date">
                      {new Date(onay.onayTarihi).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="approval-name">{onaylayanAd}</div>
                    <div className="approval-role">{onaylayanUnvan}</div>
                  </>
                )}
              </div>
            </div>
            <div className="approval-cell">
              <div className="approval-cell-title">mühür</div>
              <div className="approval-cell-body">
              </div>
            </div>
            <div className="approval-cell">
              <div className="approval-cell-title">karekod</div>
              <div className="approval-cell-body">
              </div>
            </div>
          </div>

          {/* ───── FOOTER ───── */}
          <div className="footer">
            <span>{docKodu}</span>
            <span>{process.env.SIRKET_EMAIL || "info@uniqueanalyse.com"}</span>
          </div>
        </div>
      </div>
    </>
  );
}
