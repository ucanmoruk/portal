import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import poolPromise from "@/lib/db";
import { JetBrains_Mono } from "next/font/google";
import OnayToolbar from "./OnayToolbar";

export const metadata = { title: "Analiz Raporu — Onay Önizleme" };

const jetBrainsMono = JetBrains_Mono({
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
  FirmaAd: string;
  ProjeAd: string;
  Karar: string | null;
  Dil: string | null;
  SeriNo: string | null;
  UretimTarihi: string | null;
  SKT: string | null;
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

  // Rapor başlık + numune
  const headerRes = await pool.request()
    .input("id", nkrIdNum)
    .query(`
      SELECT
        n.ID AS NkrID,
        n.RaporNo,
        n.Tarih,
        n.Numune_Adi,
        n.Numune_Adi_En,
        ISNULL(f.Ad, '')  AS FirmaAd,
        ISNULL(p.Ad, '')  AS ProjeAd,
        n.Karar,
        n.Dil,
        nd.SeriNo,
        nd.UretimTarihi,
        nd.SKT
      FROM NKR n
      LEFT JOIN RootTedarikci f ON f.ID = n.Firma_ID
      LEFT JOIN NumuneDetay   nd ON nd.RaporID = n.ID
      LEFT JOIN RootTedarikci p  ON p.ID = nd.ProjeID
      WHERE n.ID = @id AND n.Durum = 'Aktif'
    `);
  const header = headerRes.recordset[0] as RaporHeader | undefined;
  if (!header) {
    return <div style={{ padding: 40, fontFamily: "system-ui" }}>Rapor bulunamadı.</div>;
  }

  // Hizmet satırları (sadece bu rapor formatı için)
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

  // Onay durumu (varsa)
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
      const fullName = [ad, soyad].filter(Boolean).join(" ");
      onay = {
        token: r.KarekodToken,
        durum: r.Durum,
        onayTarihi: r.OnayTarihi,
        yayinTarihi: r.YayinTarihi,
        yayinUrl: r.YayinUrl,
        onaylayanAd: fullName || null,
      };
    }
  }

  const sirketAdi = process.env.SIRKET_ADI || "UNIQUE ANALYSE";

  return (
    <>
      <style>{`
        @page { size: A4; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .root {
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
        .top {
          display: flex; justify-content: space-between; align-items: flex-start;
          padding-bottom: 5mm;
        }
        .logo-img { height: 45px; width: auto; object-fit: contain; }
        .title {
          font-size: 21px; font-weight: 900; color: #1d1d1f;
          letter-spacing: 0.8px; line-height: 1; padding-top: 15px;
        }
        .meta {
          margin-top: 6mm;
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 2mm 12mm; font-size: 11px;
        }
        .meta-row {
          display: grid; grid-template-columns: 130px 1fr;
          gap: 8px; padding: 2px 0;
        }
        .meta-label { color: #1d1d1f; font-weight: 700; }
        .meta-value { color: #1d1d1f; }

        .section-label {
          font-weight: 700; font-size: 11px;
          margin-top: 8mm; margin-bottom: 2mm; color: #1d1d1f;
        }
        .firma-box { font-size: 11px; line-height: 1.6; color: #1d1d1f; }
        .firma-box .firma { font-weight: 800; }

        .services {
          width: 100%; border-collapse: collapse; margin-top: 6mm; font-size: 10.5px;
        }
        .services thead th {
          font-weight: 700; font-size: 11px; color: #1d1d1f;
          text-align: left; padding: 4px 6px;
          border-bottom: 1.5px solid #444;
        }
        .services thead th.center { text-align: center; }
        .services tbody td {
          padding: 6px 6px;
          border-bottom: 1px solid #eaeaea;
          vertical-align: top;
        }
        .services tbody td.center { text-align: center; }
        .services tbody td.no { color: #6e6e73; }
        .services tbody td.muted { color: #6e6e73; font-size: 10px; }
        .deg-uygun { color: #248a3d; font-weight: 700; }
        .deg-uygunsuz { color: #c00; font-weight: 700; }
        .deg-other { color: #6e6e73; }

        .notlar {
          margin-top: 6mm; margin-left: 2mm; font-size: 8.5px;
          color: #1d1d1f; line-height: 1.55;
        }
        .notlar-title { font-weight: 700; font-size: 10px; margin-bottom: 1mm; }
        .notlar p { margin-bottom: 0; }

        .bottom {
          margin-top: auto; padding-top: 8mm;
          display: flex; justify-content: space-between; align-items: flex-end;
        }
        .prep { text-align: center; }
        .prep-title { font-weight: 700; font-size: 11px; margin-bottom: 3mm; }
        .e-imza {
          display: inline-flex; align-items: center; gap: 4px;
          background: #e8f4f8; color: #4A46E5;
          border: 1px solid #b8dbe3; padding: 2px 8px;
          border-radius: 999px; font-size: 10px; font-weight: 600;
          margin-bottom: 2mm;
        }
        .prep-name { font-weight: 600; font-size: 11px; margin-top: 1mm; }
        .seal img { height: 90px; }

        .footer {
          display: flex; justify-content: space-between; align-items: flex-end;
          font-size: 8.5px; color: #6e6e73; margin-top: 20px;
        }

        @media print {
          body { background: #fff; }
          .onay-toolbar { display: none !important; }
          .page-number { visibility: hidden; }
          .page {
            width: 210mm; max-width: 210mm; min-height: 297mm;
            margin: 0 auto; box-shadow: none;
            padding: 10mm 12mm 6mm 12mm;
          }
        }
      `}</style>

      <div className={`root ${jetBrainsMono.className}`}>
        {/* Sticky toolbar — print'te gizli */}
        <OnayToolbar
          nkrId={nkrIdNum}
          format={format}
          initialOnay={onay}
          raporNo={header.RaporNo}
        />

        <div className="page">
          {/* ───── Üst başlık ───── */}
          <div className="top">
            <div className="logo-wrap">
              <img src="/unique-logo.png" alt={sirketAdi} className="logo-img" />
            </div>
            <div className="title">ANALİZ RAPORU</div>
          </div>

          {/* ───── Meta ───── */}
          <div className="meta">
            <div>
              <div className="meta-row">
                <span className="meta-label">Rapor No:</span>
                <span className="meta-value">{header.RaporNo}</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Rapor Tarihi:</span>
                <span className="meta-value">{fmtDate(header.Tarih)}</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Rapor Formatı:</span>
                <span className="meta-value">{format}</span>
              </div>
            </div>
            <div>
              {header.SeriNo && (
                <div className="meta-row">
                  <span className="meta-label">Seri/Lot:</span>
                  <span className="meta-value">{header.SeriNo}</span>
                </div>
              )}
              {header.UretimTarihi && (
                <div className="meta-row">
                  <span className="meta-label">Üretim Tarihi:</span>
                  <span className="meta-value">{fmtTarih(String(header.UretimTarihi))}</span>
                </div>
              )}
              {header.SKT && (
                <div className="meta-row">
                  <span className="meta-label">SKT:</span>
                  <span className="meta-value">{fmtTarih(String(header.SKT))}</span>
                </div>
              )}
            </div>
          </div>

          {/* ───── Müşteri ───── */}
          <div className="section-label">Sayın,</div>
          <div className="firma-box">
            {header.FirmaAd && <div className="firma">{header.FirmaAd}</div>}
            {header.ProjeAd && <div style={{ color: "#6e6e73" }}>Proje: {header.ProjeAd}</div>}
          </div>
          <br />

          {/* ───── Numune ───── */}
          <div className="section-label">Numune Bilgisi</div>
          <div className="firma-box">
            <div><strong>{header.Numune_Adi}</strong>{header.Numune_Adi_En ? ` / ${header.Numune_Adi_En}` : ""}</div>
          </div>

          {/* ───── Hizmet tablosu ───── */}
          <table className="services">
            <thead>
              <tr>
                <th className="center" style={{ width: 30 }}>No</th>
                <th style={{ width: 70 }}>Kod</th>
                <th>Hizmet Adı</th>
                <th>Metot</th>
                <th style={{ width: 60 }}>Birim</th>
                <th style={{ width: 120 }}>Sonuç</th>
                <th style={{ width: 100 }}>Limit</th>
                <th style={{ width: 90 }}>Değerlendirme</th>
              </tr>
            </thead>
            <tbody>
              {hizmetler.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", color: "#6e6e73", padding: "20px" }}>
                    Bu rapor formatına ait hizmet bulunamadı.
                  </td>
                </tr>
              ) : (
                hizmetler.map((h, i) => {
                  const akr = String(h.Akreditasyon || "").trim().toLowerCase() === "var" ? "*" : "";
                  const degCls = h.Degerlendirme === "Uygun"
                    ? "deg-uygun"
                    : h.Degerlendirme === "Uygun Değil"
                    ? "deg-uygunsuz"
                    : "deg-other";
                  return (
                    <tr key={i}>
                      <td className="center no">{i + 1}.</td>
                      <td className="muted">{h.Kod}</td>
                      <td><strong>{akr}{h.Ad}</strong></td>
                      <td className="muted">{h.Metot || "—"}</td>
                      <td>{h.Birim || "—"}</td>
                      <td><strong>{h.Sonuc || "—"}</strong></td>
                      <td className="muted">{h.LimitDeger || "—"}</td>
                      <td className={degCls}>{h.Degerlendirme || "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* ───── Notlar ───── */}
          <div className="notlar">
            <div className="notlar-title">Notlar:</div>
            <p>&ldquo;*&rdquo; işaretli analizler TÜRKAK tarafından TS EN ISO/IEC 17025&apos;e göre akreditasyon kapsamımızda yer almaktadır.</p>
            <p>Bu rapor sadece test edilen numuneye aittir ve bir bütünlük arz eder; bölünerek çoğaltılamaz.</p>
            <p>{sirketAdi} verilerinin yetkisiz kopyalanması, dağıtılması veya başka amaçla kullanılması yasaktır.</p>
            {header.Karar && <p style={{ marginTop: "3mm" }}><strong>Karar Kuralı:</strong> {header.Karar}</p>}
          </div>

          {/* ───── Alt kısım — onay + seal ───── */}
          <div className="bottom">
            <div className="prep">
              <div className="prep-title">Raporu Onaylayan</div>
              {onay ? (
                <>
                  <div className="e-imza">✓ E-İmzalıdır</div>
                  <div className="prep-name">{onay.onaylayanAd || "—"}</div>
                  <div style={{ fontSize: 9, color: "#6e6e73", marginTop: 2 }}>
                    {new Date(onay.onayTarihi).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ height: 18, borderBottom: "1px solid #888", width: 180 }} />
                  <div className="prep-name" style={{ color: "#888" }}>Onay bekleniyor</div>
                </>
              )}
            </div>
            <div className="seal">
              <img src="/unique-seal.png" alt={sirketAdi} />
            </div>
          </div>

          {/* ───── Footer ───── */}
          <div className="footer">
            <span>{process.env.SIRKET_EMAIL || "info@uniqueanalyse.com"}</span>
            <span>F.01.PR.04 – Yayın Tarihi: 27.09.2023</span>
            <span className="page-number">Sayfa: 1 / 1</span>
          </div>
        </div>
      </div>
    </>
  );
}
