import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import poolPromise from "@/lib/db";

export const metadata = { title: "Teklif Çıktısı" };

function teklifLabel(no: number | null, rev: number) {
  if (!no) return "—";
  const yy  = String(no).slice(0, 2);
  const seq = String(no).slice(2).padStart(4, "0");
  return rev > 0 ? `${yy}${seq}/${rev}` : `${yy}${seq}`;
}

function fmt(n: any) {
  const num = parseFloat(n);
  if (isNaN(num)) return "0,00";
  return num.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function TeklifPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ print?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const autoPrint = sp.print === "1";

  const pool = await poolPromise;

  const headerRes = await pool.request()
    .input("ID", Number(id))
    .query(`
      SELECT
        t.ID, t.TeklifNo, t.RevNo,
        FORMAT(t.Tarih, 'dd.MM.yyyy') AS Tarih,
        t.Toplam, t.Notlar,
        ISNULL(t.TeklifKonusu, 'Fiyat teklifimiz') AS TeklifKonusu,
        ISNULL(t.TeklifVeren,  '')                 AS TeklifVeren,
        ISNULL(t.KdvOran, 20)                      AS KdvOran,
        ISNULL(m.Ad,'')           AS MusteriAd,
        ISNULL(m.Adres,'')        AS MusteriAdres,
        ISNULL(m.Telefon,'')      AS MusteriTelefon,
        ISNULL(m.Email,'')        AS MusteriEmail,
        ISNULL(m.VergiDairesi,'') AS VergiDairesi,
        ISNULL(m.VergiNo,'')      AS VergiNo,
        ISNULL(m.Yetkili,'')      AS MusteriYetkili
      FROM TeklifX1 t
      LEFT JOIN RootTedarikci m ON m.ID = t.MusteriID
      WHERE t.ID = @ID
    `);

  if (!headerRes.recordset.length) {
    return <div style={{ padding: 40, fontFamily: "system-ui" }}>Teklif bulunamadı.</div>;
  }

  const h = headerRes.recordset[0];

  const satirRes = await pool.request()
    .input("TeklifID", Number(id))
    .query(`
      SELECT HizmetAdi, ISNULL(Adet,1) AS Adet,
             Fiyat, ParaBirimi, Iskonto,
             ISNULL(Metot,'') AS Metot, ISNULL(Akreditasyon,'') AS Akreditasyon,
             Notlar
      FROM TeklifX2
      WHERE TeklifID = @TeklifID
      ORDER BY ID
    `);

  const satirlar: any[] = satirRes.recordset;
  const no = teklifLabel(h.TeklifNo, h.RevNo);
  const sirketAdi  = process.env.SIRKET_ADI   || "ÜGD";
  const sirketAdres = process.env.SIRKET_ADRES || "";
  const sirketWeb   = process.env.SIRKET_WEB   || "";
  const sirketEmail = process.env.SIRKET_EMAIL || "";

  // Toplam hesapla
  const tutar  = satirlar.reduce((acc: number, s: any) => {
    const adet = parseInt(s.Adet) || 1;
    return acc + adet * (parseFloat(s.Fiyat) || 0) * (1 - (parseFloat(s.Iskonto) || 0) / 100);
  }, 0);
  const kdvOran   = parseInt(h.KdvOran) || 20;
  const kdvTutar  = tutar * kdvOran / 100;
  const genelToplam = tutar + kdvTutar;

  return (
    <html lang="tr">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
            background: #f5f5f7;
            color: #1d1d1f;
            font-size: 14px;
            line-height: 1.5;
          }
          .print-btn-bar {
            background: #1d1d1f;
            padding: 12px 24px;
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .print-btn {
            background: #0071e3;
            color: #fff;
            border: none;
            border-radius: 8px;
            padding: 8px 20px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
          }
          .print-btn:hover { background: #0077ed; }
          .close-btn {
            background: transparent;
            color: #ffffffcc;
            border: 1px solid #ffffff44;
            border-radius: 8px;
            padding: 8px 16px;
            font-size: 14px;
            cursor: pointer;
          }
          .page {
            max-width: 860px;
            margin: 32px auto 64px;
            background: #fff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 24px rgba(0,0,0,0.10);
          }
          .header-band {
            background: #1B4F8A;
            padding: 28px 40px 24px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
          }
          .company-name {
            color: #fff;
            font-size: 24px;
            font-weight: 700;
            letter-spacing: -0.5px;
          }
          .doc-title {
            color: rgba(255,255,255,0.8);
            font-size: 12px;
            margin-top: 4px;
            text-transform: uppercase;
            letter-spacing: 0.1em;
          }
          .teklif-no-box { text-align: right; }
          .teklif-no-label {
            color: rgba(255,255,255,0.65);
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.1em;
          }
          .teklif-no-value {
            color: #fff;
            font-size: 20px;
            font-weight: 700;
            letter-spacing: -0.2px;
          }
          .body { padding: 32px 40px; }

          /* Info grid */
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0;
            border: 1px solid #d6e4f0;
            border-radius: 8px;
            overflow: hidden;
            margin-bottom: 28px;
            font-size: 13px;
          }
          .info-row {
            display: contents;
          }
          .info-label {
            background: #d6e4f0;
            color: #1B4F8A;
            font-weight: 600;
            font-size: 11px;
            padding: 7px 12px;
            border-bottom: 1px solid #c4d9ed;
          }
          .info-value {
            background: #fff;
            padding: 7px 12px;
            border-bottom: 1px solid #e5eef6;
            color: #1d1d1f;
          }
          .info-label:last-of-type, .info-value:last-of-type { border-bottom: none; }

          /* Services table */
          .section-title {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: #6e6e73;
            margin-bottom: 10px;
          }
          .services-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 0;
            font-size: 12.5px;
          }
          .services-table thead tr { background: #1B4F8A; }
          .services-table th {
            padding: 8px 10px;
            text-align: left;
            font-size: 11px;
            font-weight: 600;
            color: #fff;
            border: 1px solid #1B4F8A;
          }
          .services-table th.right { text-align: right; }
          .services-table th.center { text-align: center; }
          .services-table td {
            padding: 8px 10px;
            color: #1d1d1f;
            border: 1px solid #d6e4f0;
          }
          .services-table td.right { text-align: right; }
          .services-table td.center { text-align: center; color: #6e6e73; }
          .services-table td.net { text-align: right; font-weight: 600; }
          .services-table tbody tr:nth-child(even) td { background: #f5f9fd; }

          /* Summary */
          .summary-box {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            padding: 12px 0;
            margin-bottom: 24px;
            border-top: 2px solid #d6e4f0;
          }
          .summary-row {
            display: flex;
            gap: 40px;
            font-size: 13px;
            margin-bottom: 4px;
          }
          .summary-label { color: #6e6e73; min-width: 180px; text-align: right; }
          .summary-amount { font-variant-numeric: tabular-nums; min-width: 120px; text-align: right; }
          .summary-total { font-weight: 700; font-size: 15px; color: #1B4F8A; }

          .notlar-box {
            background: #f5f9fd;
            border-left: 3px solid #1B4F8A;
            border-radius: 0 8px 8px 0;
            padding: 12px 16px;
            margin-bottom: 28px;
          }
          .notlar-box p { font-size: 13px; color: #1d1d1f; white-space: pre-wrap; }

          .footer {
            padding: 16px 40px;
            background: #f5f5f7;
            border-top: 1px solid #e5e7eb;
            font-size: 11px;
            color: #6e6e73;
            display: flex;
            justify-content: space-between;
          }

          @media print {
            body { background: #fff; }
            .print-btn-bar { display: none !important; }
            .page {
              margin: 0;
              border-radius: 0;
              box-shadow: none;
              max-width: 100%;
            }
          }
        `}</style>
      </head>
      <body>
        {/* Yazdır butonu — print'te gizlenir */}
        <div className="print-btn-bar">
          <button className="print-btn">Yazdır / PDF olarak kaydet</button>
          <button className="close-btn">Kapat</button>
        </div>

        <div className="page">
          {/* Header */}
          <div className="header-band">
            <div>
              <div className="company-name">{sirketAdi}</div>
              <div className="doc-title">Fiyat Teklif Formu</div>
            </div>
            <div className="teklif-no-box">
              <div className="teklif-no-label">Teklif No</div>
              <div className="teklif-no-value">ROT{no}</div>
            </div>
          </div>

          {/* Body */}
          <div className="body">
            {/* Info grid */}
            <div className="info-grid">
              <div className="info-label">Teklif No</div>
              <div className="info-value">ROT{no}</div>

              <div className="info-label">Tarih</div>
              <div className="info-value">{h.Tarih}</div>

              {h.RevNo > 0 && <>
                <div className="info-label">Revizyon</div>
                <div className="info-value">{h.RevNo}</div>
              </>}

              <div className="info-label">Teklifin Konusu</div>
              <div className="info-value">{h.TeklifKonusu}</div>

              {h.TeklifVeren && <>
                <div className="info-label">Teklif Veren</div>
                <div className="info-value">{h.TeklifVeren}</div>
              </>}

              <div className="info-label">Firma Adı</div>
              <div className="info-value" style={{ fontWeight: 600 }}>{h.MusteriAd || "—"}</div>

              {h.MusteriAdres && <>
                <div className="info-label">Adres</div>
                <div className="info-value">{h.MusteriAdres}</div>
              </>}

              {h.MusteriYetkili && <>
                <div className="info-label">Yetkili</div>
                <div className="info-value">{h.MusteriYetkili}</div>
              </>}

              {(h.MusteriTelefon || h.MusteriEmail) && <>
                <div className="info-label">Tel / E-posta</div>
                <div className="info-value">
                  {[h.MusteriTelefon, h.MusteriEmail].filter(Boolean).join(" / ")}
                </div>
              </>}

              {h.VergiNo && <>
                <div className="info-label">Vergi Dairesi / No</div>
                <div className="info-value">{[h.VergiDairesi, h.VergiNo].filter(Boolean).join(" / ")}</div>
              </>}
            </div>

            {/* Hizmet tablosu */}
            <div className="section-title">Analiz / Hizmet Listesi</div>
            <table className="services-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }} className="center">No</th>
                  <th style={{ width: 40 }} className="center">Akr.</th>
                  <th>Analiz Adı</th>
                  <th>Metot</th>
                  <th style={{ width: 48 }} className="center">Adet</th>
                  <th className="right" style={{ width: 110 }}>Birim Fiyat</th>
                  <th className="right" style={{ width: 120 }}>Toplam (KDV'siz)</th>
                </tr>
              </thead>
              <tbody>
                {satirlar.map((s: any, i: number) => {
                  const adet    = parseInt(s.Adet) || 1;
                  const fiyat   = parseFloat(s.Fiyat)   || 0;
                  const iskonto = parseFloat(s.Iskonto) || 0;
                  const net     = adet * fiyat * (1 - iskonto / 100);
                  return (
                    <tr key={i}>
                      <td className="center" style={{ color: "#6e6e73" }}>{i + 1}</td>
                      <td className="center" style={{ color: s.Akreditasyon === "A" ? "#1a7f4b" : "#6e6e73" }}>
                        {s.Akreditasyon || "—"}
                      </td>
                      <td>
                        <span style={{ fontWeight: 500 }}>{s.HizmetAdi}</span>
                        {s.Notlar && <span style={{ display: "block", fontSize: 11, color: "#6e6e73" }}>{s.Notlar}</span>}
                      </td>
                      <td style={{ color: "#6e6e73", fontSize: 12 }}>{s.Metot || "—"}</td>
                      <td className="center">{adet}</td>
                      <td className="right">
                        {iskonto > 0
                          ? <><s style={{ color: "#999", fontSize: 11 }}>{fmt(fiyat)}</s><br />{fmt(fiyat * (1 - iskonto / 100))}</>
                          : fmt(fiyat)
                        } <span style={{ fontSize: 11, color: "#6e6e73" }}>{s.ParaBirimi}</span>
                      </td>
                      <td className="net">{fmt(net)} <span style={{ fontSize: 11, color: "#1B4F8A" }}>{s.ParaBirimi}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Toplam özeti */}
            <div className="summary-box">
              <div className="summary-row">
                <span className="summary-label">Tutar</span>
                <span className="summary-amount">{fmt(tutar)}</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">KDV (%{kdvOran})</span>
                <span className="summary-amount">{fmt(kdvTutar)}</span>
              </div>
              <div className="summary-row summary-total">
                <span className="summary-label" style={{ color: "#1B4F8A" }}>Genel Toplam</span>
                <span className="summary-amount">{fmt(genelToplam)}</span>
              </div>
            </div>

            {/* Not */}
            {h.Notlar && (
              <div className="notlar-box">
                <div className="section-title" style={{ marginBottom: 6 }}>Not</div>
                <p>{h.Notlar}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="footer">
            <span>{sirketAdi}{sirketAdres ? ` · ${sirketAdres}` : ""}</span>
            <span>{[sirketWeb, sirketEmail].filter(Boolean).join(" · ") || "Bu teklif elektronik olarak hazırlanmıştır."}</span>
          </div>
        </div>

        <script dangerouslySetInnerHTML={{ __html: `
          document.querySelector('.print-btn').addEventListener('click', () => window.print());
          document.querySelector('.close-btn').addEventListener('click', () => window.close());
          ${autoPrint ? "setTimeout(() => window.print(), 450);" : ""}
        `}} />
      </body>
    </html>
  );
}
