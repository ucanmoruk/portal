import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import poolPromise from "@/lib/db";
import { Inter } from "next/font/google";
import OnayToolbar from "./OnayToolbar";

export const metadata = { title: "Analiz Raporu — Onay Önizleme" };

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

interface HizmetRow {
  Kod: string;
  Ad: string;
  Akreditasyon: string;
  Metot: string;
  Birim: string;
  LimitDeger: string | null;
  LOQ: string | null;
  Sonuc: string | null;
  Degerlendirme: string | null;
  Termin: string | null;
}

interface RaporHeader {
  NkrID: number;
  RaporNo: string;
  Tarih: string | null;
  Numune_Adi: string;
  Numune_Adi_En: string | null;
  Urun_Tipi: string | null;
  TesteMiktar: string | null;
  TesteMiktarBirim: string | null;
  FirmaAd: string;
  FirmaAdres: string;
  FirmaYetkili: string;
  FirmaEmail: string;
  FirmaTelefon: string;
  Karar: string | null;
  Dil: string | null;
  SeriNo: string | null;
  UretimTarihi: string | null;
  SKT: string | null;
  Evrak_No: string;
}

interface OnayInfo {
  token: string;
  durum: string;
  onayTarihi: string;
  yayinTarihi: string | null;
  yayinUrl: string | null;
  onaylayanAd: string | null;
}

function fmtTarih(s: string | null | undefined): string {
  if (!s) return "—";
  const v = String(s);
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return v.slice(0, 10);
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  try {
    const dt = typeof d === "string" ? new Date(d) : d;
    if (Number.isNaN(dt.getTime())) return String(d);
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    return `${dd}.${mm}.${dt.getFullYear()}`;
  } catch { return String(d); }
}

// Test sonucu değerlendirme metnine göre etiket
function degerlendirmeLabel(d: string | null): { text: string; cls: string } {
  if (!d || !d.trim()) return { text: "—", cls: "deg-other" };
  const v = d.trim();
  if (v === "Uygun") return { text: "GEÇER", cls: "deg-gecer" };
  if (v === "Uygun Değil") return { text: "KALDI", cls: "deg-kaldi" };
  return { text: v, cls: "deg-other" };
}

export default async function RaporOnayPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ nkrId: string }>;
  searchParams: Promise<{ format?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { nkrId } = await params;
  const sp = await searchParams;
  const format = (sp.format || "").trim();
  const nkrIdNum = parseInt(nkrId, 10);

  if (!Number.isFinite(nkrIdNum) || !format) {
    return <div style={{ padding: 40, fontFamily: "system-ui" }}>Geçersiz rapor / format.</div>;
  }

  const pool = await poolPromise;

  const headerRes = await pool.request()
    .input("id", nkrIdNum)
    .query(`
      SELECT
        n.ID AS NkrID,
        n.RaporNo,
        n.Tarih,
        n.Evrak_No,
        n.Numune_Adi,
        n.Numune_Adi_En,
        n.Urun_Tipi,
        n.TesteMiktar,
        n.TesteMiktarBirim,
        ISNULL(f.Ad, '')        AS FirmaAd,
        ISNULL(f.Adres, '')     AS FirmaAdres,
        ISNULL(f.Yetkili, '')   AS FirmaYetkili,
        ISNULL(f.Email, '')     AS FirmaEmail,
        ISNULL(f.Telefon, '')   AS FirmaTelefon,
        n.Karar,
        n.Dil,
        nd.SeriNo,
        nd.UretimTarihi,
        nd.SKT
      FROM NKR n
      LEFT JOIN RootTedarikci f ON f.ID = n.Firma_ID
      LEFT JOIN NumuneDetay   nd ON nd.RaporID = n.ID
      WHERE n.ID = @id AND n.Durum = 'Aktif'
    `);
  const header = headerRes.recordset[0] as RaporHeader | undefined;
  if (!header) {
    return <div style={{ padding: 40, fontFamily: "system-ui" }}>Rapor bulunamadı.</div>;
  }

  const hizmetRes = await pool.request()
    .input("nkrId", nkrIdNum)
    .input("format", format)
    .query(`
      SELECT
        ISNULL(s.Kod, '')          AS Kod,
        ISNULL(s.Ad, '')           AS Ad,
        ISNULL(s.Akreditasyon, '') AS Akreditasyon,
        ISNULL(s.Method, '')       AS Metot,
        ISNULL(x1.Birim, ISNULL(s.Matriks, '')) AS Birim,
        x1.[Limit]                  AS LimitDeger,
        ISNULL(s.LOQ, '')          AS LOQ,
        x1.Sonuc                    AS Sonuc,
        x1.Degerlendirme            AS Degerlendirme,
        CONVERT(varchar(10), x1.Termin, 23) AS Termin
      FROM NumuneX1 x1
      INNER JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
      WHERE x1.RaporID = @nkrId
        AND s.RaporFormati = @format
      ORDER BY s.Kod
    `);
  const hizmetler = hizmetRes.recordset as HizmetRow[];

  // Test başlangıç ve bitiş tarihi (min/max termin)
  const terminTarihler = hizmetler
    .map(h => h.Termin)
    .filter((t): t is string => !!t)
    .sort();
  const testBaslangic = terminTarihler[0] || null;
  const testBitis = terminTarihler[terminTarihler.length - 1] || null;

  let onay: OnayInfo | null = null;
  const onayTblCheck = await pool.request().query(
    `SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_NAME = 'NKR_RaporOnay' AND TABLE_SCHEMA IN ('dbo','cosmoroot')`
  );
  if (onayTblCheck.recordset.length > 0) {
    const onayRes = await pool.request()
      .input("nkrId", nkrIdNum)
      .input("format", format)
      .query(`
        SELECT o.KarekodToken, o.Durum, o.OnayTarihi, o.YayinTarihi, o.YayinUrl,
               ISNULL(u.Ad, '')    AS OnaylayanAd,
               ISNULL(u.Soyad, '') AS OnaylayanSoyad
        FROM NKR_RaporOnay o
        LEFT JOIN RootKullanici u ON u.ID = o.OnaylayanID
        WHERE o.NkrID = @nkrId AND o.RaporFormati = @format
      `);
    const r = onayRes.recordset[0];
    if (r) {
      const ad = String(r.OnaylayanAd ?? "").trim();
      const soyad = String(r.OnaylayanSoyad ?? "").trim();
      onay = {
        token: r.KarekodToken,
        durum: r.Durum,
        onayTarihi: r.OnayTarihi,
        yayinTarihi: r.YayinTarihi,
        yayinUrl: r.YayinUrl,
        onaylayanAd: [ad, soyad].filter(Boolean).join(" ") || null,
      };
    }
  }

  const sirketAdi = process.env.SIRKET_ADI || "UNIQUE Analiz Belgelendirme ve Gözetim Hizmetleri Ltd. Şti.";

  // ───── Üst meta + imza değerleri ─────
  const revNo = "0";
  const kabulTarihi = fmtDate(header.Tarih);
  const yayinTarihi = onay?.yayinTarihi
    ? fmtDate(onay.yayinTarihi)
    : onay?.onayTarihi
      ? fmtDate(onay.onayTarihi)
      : "—";
  const hazirlayanAd = process.env.RAPOR_HAZIRLAYAN || "Büşra ALBAYRAK";
  const hazirlayanUnvan = process.env.RAPOR_HAZIRLAYAN_UNVAN || "Raportör";
  const onaylayanAd = onay?.onaylayanAd || process.env.RAPOR_ONAYLAYAN || "Alaettin ÖZDEMİR";
  const onaylayanUnvan = process.env.RAPOR_ONAYLAYAN_UNVAN || "Laboratuvar Müdürü";
  const docKodu = process.env.RAPOR_DOC_KODU || "Ek-1.PR.20 Yayın Tarihi: 27.09.2023   Revizyon Tarih / No: 25.11.2024 / 01";

  return (
    <>
      <style>{`
        @page { size: A4; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .root {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
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
          object-fit: contain;
        }

        /* ───── DENEY RAPORU BAŞLIK ───── */
        .report-title {
          text-align: center;
          font-size: 26px;
          font-weight: 800;
          letter-spacing: 2px;
          margin: 4mm 0 2mm;
          color: #1d1d1f;
        }

        /* ───── ÜST META BAR (2x2: Rapor No/Rev · Sayfa · Kabul · Yayın) ───── */
        .meta-box {
          display: grid;
          grid-template-columns: 1fr 1fr;
          margin-top: 2mm;
          border: 1px solid #1d1d1f;
          font-size: 10px;
        }
        .meta-box > div {
          padding: 4px 8px;
          border-right: 1px solid #1d1d1f;
          border-bottom: 1px solid #1d1d1f;
        }
        .meta-box > div:nth-child(2n) { border-right: none; }
        .meta-box > div:nth-child(n+3) { border-bottom: none; }
        .meta-box strong { font-weight: 700; }

        /* ───── MÜŞTERİ / NUMUNE TABLOSU (2 sütun) ───── */
        .info-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 3mm;
          font-size: 10px;
        }
        .info-table th {
          background: #1d1d1f;
          color: #fff;
          padding: 5px 8px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-align: left;
          border: 1px solid #1d1d1f;
          width: 50%;
        }
        .info-table td {
          padding: 6px 10px;
          border: 1px solid #1d1d1f;
          vertical-align: top;
          line-height: 1.55;
        }
        .info-table .firma-ad {
          font-weight: 700;
          font-size: 11px;
          letter-spacing: 0.3px;
        }
        .info-table .info-line {
          color: #1d1d1f;
        }
        .info-table .info-label {
          color: #6e6e73;
          font-weight: 600;
          display: inline-block;
          min-width: 50mm;
        }

        /* ───── TEST SONUÇLARI SECTION ───── */
        .results-section {
          margin-top: 4mm;
        }
        .results-title {
          background: #1d1d1f;
          color: #fff;
          padding: 5px 10px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.8px;
          text-align: left;
          border: 1px solid #1d1d1f;
        }
        .results-subtitle {
          border-left: 1px solid #1d1d1f;
          border-right: 1px solid #1d1d1f;
          padding: 5px 10px;
          font-size: 9.5px;
          color: #1d1d1f;
          line-height: 1.5;
          background: #fafafa;
        }
        .results {
          width: 100%;
          border-collapse: collapse;
          font-size: 9.5px;
        }
        .results thead th {
          background: #f2f2f2;
          font-weight: 700;
          color: #1d1d1f;
          padding: 5px 4px;
          border: 1px solid #1d1d1f;
          text-align: center;
          font-size: 11px;
        }
        .results tbody td {
          padding: 5px 5px;
          border: 1px solid #1d1d1f;
          vertical-align: middle;
        }
        .results tbody td.center { text-align: center; }
        .results tbody td.muted { color: #6e6e73; font-size: 9px; }
        .results tbody td.bold { font-weight: 700; }
        .deg-gecer { color: #1a7e3a; font-weight: 700; text-align: center; }
        .deg-kaldi { color: #b00020; font-weight: 700; text-align: center; }
        .deg-other { color: #6e6e73; text-align: center; }

        /* ───── NOTLAR ───── */
        .notlar {
          margin-top: 4mm;
          border: 1px solid #1d1d1f;
          font-size: 9px;
          line-height: 1.55;
          color: #1d1d1f;
        }
        .notlar-title {
          background: #1d1d1f;
          color: #fff;
          padding: 4px 10px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.5px;
        }
        .notlar-body {
          padding: 7px 10px;
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
          padding-top: 6mm;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6mm;
          align-items: end;
        }
        .approval-cell {
          border: 1px solid #1d1d1f;
          min-height: 28mm;
          display: flex;
          flex-direction: column;
        }
        .approval-cell-title {
          background: #1d1d1f;
          color: #fff;
          padding: 3px 8px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-align: center;
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

      <div className={`root ${inter.className}`}>
        <OnayToolbar
          nkrId={nkrIdNum}
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

          {/* ───── DENEY RAPORU BAŞLIK ───── */}
          <div className="report-title">DENEY RAPORU</div>

          {/* ───── ÜST META: Rapor No/Rev · Sayfa · Kabul · Yayın ───── */}
          <div className="meta-box">
            <div><strong>Rapor No / Rev. No:</strong> {header.RaporNo} / {revNo}</div>
            <div><strong>Numune Kabul Tarihi:</strong> {kabulTarihi}</div>
            <div><strong>Sayfa:</strong> 1 / 1</div>
            <div><strong>Rapor Yayın Tarihi:</strong> {yayinTarihi}</div>
          </div>

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
                  {header.FirmaAdres && <div className="info-line">{header.FirmaAdres}</div>}
                  {header.FirmaYetkili && <div className="info-line">{header.FirmaYetkili}</div>}
                  {header.FirmaEmail && <div className="info-line">{header.FirmaEmail}</div>}
                  {header.FirmaTelefon && <div className="info-line">{header.FirmaTelefon}</div>}
                </td>
                <td>
                  <div className="firma-ad">
                    {header.Numune_Adi}
                    {header.Numune_Adi_En ? <span style={{ color: "#6e6e73", fontWeight: 500 }}> / {header.Numune_Adi_En}</span> : null}
                  </div>
                  {(header.TesteMiktar || header.TesteMiktarBirim) && (
                    <div className="info-line">
                      {header.TesteMiktar} {header.TesteMiktarBirim}
                    </div>
                  )}
                  <div className="info-line">
                    <span className="info-label">Üretim Tarihi:</span>
                    {fmtTarih(String(header.UretimTarihi || ""))}
                  </div>
                  <div className="info-line">
                    <span className="info-label">Son Kullanım Tarihi:</span>
                    {fmtTarih(String(header.SKT || ""))}
                  </div>
                  <div className="info-line">
                    <span className="info-label">Seri / Lot No / Ürün Kodu:</span>
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
              Testler müşteri spesifikasyonuna göre değerlendirilmiştir.
            </div>
            <table className="results">
              <thead>
                <tr>
                  <th style={{ width: "auto", textAlign: "left", paddingLeft: 10 }}>Analiz Adı</th>
                  <th style={{ width: 55 }}>Birim</th>
                  <th style={{ width: 75 }}>Sonuç</th>
                  <th style={{ width: 50 }}>LOQ</th>
                  <th style={{ width: 50 }}>Ö.B.</th>
                  <th style={{ width: 110 }}>Metot</th>
                  <th style={{ width: 70 }}>Limit</th>
                  <th style={{ width: 80 }}>Değerlendirme</th>
                </tr>
              </thead>
              <tbody>
                {hizmetler.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", color: "#6e6e73", padding: "16px" }}>
                      Bu rapor formatına ait hizmet bulunamadı.
                    </td>
                  </tr>
                ) : (
                  hizmetler.map((h, i) => {
                    const isAkr = String(h.Akreditasyon || "").trim().toLowerCase() === "var";
                    const deg = degerlendirmeLabel(h.Degerlendirme);
                    return (
                      <tr key={i}>
                        <td style={{ paddingLeft: 10 }}>
                          {isAkr ? "*" : ""}{h.Ad}
                        </td>
                        <td className="center">{h.Birim || "-"}</td>
                        <td className="center bold">{h.Sonuc || "-"}</td>
                        <td className="center">{h.LOQ || "-"}</td>
                        <td className="center muted">-</td>
                        <td className="center">{h.Metot || "-"}</td>
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
            <div className="notlar-title">NOTLAR</div>
            <div className="notlar-body">
              <p><span className="legend">LOQ:</span> Tespit Limiti, <span className="legend">Ö.B.:</span> Ölçüm Belirsizliği</p>
              <p>&ldquo;*&rdquo; işaretli analizler TÜRKAK tarafından TS EN ISO/IEC 17025&apos;e göre akredite kapsamımızda yer almaktadır.</p>
              <p>
                Numune alma işlemi tarafımızdan yapılmamıştır. İmzasız ve mühürsüz Analiz Raporları geçersizdir.
                {" "}{sirketAdi}&apos;nin yazılı izni olmadan bu Analiz Raporu kısmen kopyalanamaz, çoğaltılamaz veya
                herhangi bir başka amaçla kullanılamaz.
              </p>
              <p>
                Test sonuçları, yukarıda belirtilen numune için geçerlidir. Numunenin ait olduğu lotu temsil etmeyebilir.
                Deney raporunda yer alan ve sonuçların geçerliliğini etkileyen tanımsal bilgiler müşteri tarafından
                beyan edilmiştir. Bu bilgilerin doğruluğundan ve kullanımına bağlı oluşabilecek tüm kayıplardan/yasal
                zorunluluklardan laboratuvarımız sorumlu değildir.
              </p>
              <p>
                <span className="legend">Karar Kuralı:</span>{" "}
                {header.Karar
                  ? header.Karar
                  : "Müşteri, “Ölçüm belirsizliği dahil edilmeden” uygunluk beyanı verilmesini istediğini belirtmiştir. Mikrobiyolojik analizler için uygunluk değerlendirilmesine ilişkin karar kuralı, ölçüm belirsizliği dikkate alınmaksızın uygulanır."}
              </p>
            </div>
          </div>

          {/* ───── İMZA BLOĞU (2 hücre: Raporu Hazırlayan · Onaylayan) ───── */}
          <div className="approval-block">
            <div className="approval-cell">
              <div className="approval-cell-title">RAPORU HAZIRLAYAN</div>
              <div className="approval-cell-body">
                <div className="approval-name">{hazirlayanAd}</div>
                <div className="approval-role">{hazirlayanUnvan}</div>
              </div>
            </div>
            <div className="approval-cell">
              <div className="approval-cell-title">ONAYLAYAN</div>
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
