import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cosmoPool } from "@/lib/db";
import PrintToolbar from "./PrintToolbar";
import TeklifPrintDocument, { type TeklifHeader, type TeklifSatir } from "./TeklifPrintDocument";

export const metadata = { title: "Teklif Çıktısı" };

// Sayfa = yalnızca veri katmanı (auth + cosmo sorguları). Görsel format tamamen
// TeklifPrintDocument içinde — o bileşen müşteri portalına AYNEN kopyalanabilir.
export default async function TeklifPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ print?: string; pdfMode?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const autoPrint = sp.print === "1";
  const pdfMode = sp.pdfMode === "1";

  const pool = await cosmoPool;

  const headerRes = await pool.request()
    .input("ID", Number(id))
    .query(`
      SELECT
        t.ID, t.TeklifNo, t.DisTeklifKodu, t.RevNo,
        FORMAT(t.Tarih, 'dd.MM.yyyy') AS Tarih,
        t.Toplam, t.Notlar,
        ISNULL(t.TeklifKonusu, 'Fiyat teklifimiz') AS TeklifKonusu,
        ISNULL(t.TeklifVeren,  '')                 AS TeklifVeren,
        ISNULL(t.KdvOran, 20)                      AS KdvOran,
        ISNULL(t.GenelIskonto, 0)                  AS GenelIskonto,
        ISNULL(m.Ad,'')           AS MusteriAd,
        ISNULL(m.Adres,'')        AS MusteriAdres,
        ISNULL(m.Telefon,'')      AS MusteriTelefon,
        ISNULL(m.Email,'')        AS MusteriEmail,
        ISNULL(m.VergiDairesi,'') AS VergiDairesi,
        ISNULL(m.VergiNo,'')      AS VergiNo,
        ISNULL(m.Yetkili,'')      AS MusteriYetkili
      FROM TeklifBaslik t
      LEFT JOIN (SELECT ID, Firma_Adi AS Ad, Adres, Mail AS Email, Telefon, Vergi_Dairesi AS VergiDairesi, Vergi_No AS VergiNo, Yetkili FROM Firma) m ON m.ID = t.MusteriID
      WHERE t.ID = @ID
    `);

  if (!headerRes.recordset.length) {
    return <div style={{ padding: 40, fontFamily: "system-ui" }}>Teklif bulunamadı.</div>;
  }
  const h = headerRes.recordset[0] as TeklifHeader;

  const satirRes = await pool.request()
    .input("TeklifID", Number(id))
    .query(`
      SELECT HizmetAdi, ISNULL(Adet,1) AS Adet,
             Fiyat, ParaBirimi, Iskonto,
             ISNULL(Metot,'') AS Metot, ISNULL(Akreditasyon,'') AS Akreditasyon,
             Notlar
      FROM TeklifKalem
      WHERE TeklifID = @TeklifID
      ORDER BY ID
    `);
  const satirlar = satirRes.recordset as TeklifSatir[];

  const sirketAdi = process.env.SIRKET_ADI || "UNIQUE ANALYSE";
  const sirketEmail = process.env.SIRKET_EMAIL || "info@uniqueanalyse.com";

  return (
    <TeklifPrintDocument
      header={h}
      satirlar={satirlar}
      sirketAdi={sirketAdi}
      sirketEmail={sirketEmail}
      toolbar={!pdfMode ? (
        <PrintToolbar
          pdfUrl={`/api/teklif-print/${encodeURIComponent(id)}/pdf?download=1`}
          autoPrint={autoPrint}
        />
      ) : undefined}
    />
  );
}
