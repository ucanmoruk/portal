import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";

// GET /api/talepler/[id] — talep detayı (header + numuneler)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return Response.json({ error: "Geçersiz ID" }, { status: 400 });
  }

  try {
    const pool = await cosmoPool;

    const headerRes = await pool.request()
      .input("id", Number(id))
      .query(`
        SELECT
          t.ID,
          t.TalepNo,
          t.DisTalepKodu,
          COALESCE(t.DisTalepKodu, CAST(t.TalepNo AS NVARCHAR(50))) AS TalepNoLabel,
          FORMAT(t.Tarih, 'dd.MM.yyyy') AS Tarih,
          t.FirmaKodu,
          t.Durum,
          t.Tur,
          ISNULL(t.Sozlesme, '')   AS Sozlesme,
          ISNULL(t.Yetkili, 0)     AS Yetkili,
          ISNULL(t.Olusturan, '')  AS Olusturan,
          ISNULL(f.Firma_Adi, '')  AS FirmaAd,
          ISNULL(r.Firma, '')      AS RaporFirma,
          ISNULL(r.Adres, '')      AS RaporAdres,
          ISNULL(r.Yetkili, '')    AS RaporYetkili,
          ISNULL(r.Iletisim, '')   AS RaporIletisim,
          ISNULL(r.Karar, '')      AS Karar,
          ISNULL(r.Dil, '')        AS Dil,
          ISNULL(r.Iade, '')       AS Iade,
          ISNULL(r.UreticiFirma,'') AS UreticiFirma,
          ISNULL(r.Note, '')       AS Note,
          ISNULL(fa.Firma, '')         AS FaturaFirma,
          ISNULL(fa.Adres, '')         AS FaturaAdres,
          ISNULL(fa.VergiDairesi, '')  AS VergiDairesi,
          ISNULL(fa.VergiNo, '')       AS VergiNo,
          ISNULL(fa.Mail, '')          AS FaturaMail
        FROM dbo.Talep t
        LEFT JOIN dbo.Firma          f  ON f.Kod = t.FirmaKodu
        LEFT JOIN dbo.TalepRaporlama r  ON r.TalepID = t.ID
        LEFT JOIN dbo.TalepFatura    fa ON fa.TalepID = t.ID
        WHERE t.ID = @id
      `);

    if (!headerRes.recordset.length) {
      return Response.json({ error: "Talep bulunamadı" }, { status: 404 });
    }

    const numuneRes = await pool.request()
      .input("id", Number(id))
      .query(`
        SELECT ID,
               ISNULL(Numune, '')  AS Numune,
               ISNULL(Ozellik, '') AS Ozellik,
               ISNULL(Analiz, '')  AS Analiz,
               ISNULL(Metot, '')   AS Metot
        FROM dbo.TalepNumune
        WHERE TalepID = @id
        ORDER BY ID
      `);

    return Response.json({
      header: headerRes.recordset[0],
      numuneler: numuneRes.recordset,
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
