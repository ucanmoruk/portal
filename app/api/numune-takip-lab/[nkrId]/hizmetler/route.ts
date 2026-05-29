import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { type NextRequest } from "next/server";

// GET /api/numune-takip-lab/[nkrId]/hizmetler?raporFormati=Genel
// "Kabul Bekleyenler" accordion açıldığında ürüne+rapor formatına ait
// hizmet detaylarını döner (Bölüm bilgisi dahil).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ nkrId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { nkrId } = await params;
  const nkrIdNum = parseInt(nkrId, 10);
  if (!Number.isFinite(nkrIdNum)) {
    return Response.json({ error: "Geçersiz NkrID" }, { status: 400 });
  }
  const raporFormati = request.nextUrl.searchParams.get("raporFormati") || "";
  if (!raporFormati) {
    return Response.json({ error: "raporFormati gerekli" }, { status: 400 });
  }

  try {
    const pool = await poolPromise;

    // BolumID kolonu opsiyonel
    const hasBolumCol = await pool.request().query(
      `SELECT 1 AS x FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME='StokAnalizListesi' AND COLUMN_NAME='BolumID'
         AND TABLE_SCHEMA IN ('dbo','cosmoroot')`
    );
    const hasBL = hasBolumCol.recordset.length > 0;
    const bolumSelect = hasBL
      ? "s.BolumID AS BolumID, ISNULL(b.Birim, '') AS BolumAdi"
      : "NULL AS BolumID, '' AS BolumAdi";
    const bolumJoin = hasBL ? "LEFT JOIN RootFirmaBirim b ON b.ID = s.BolumID" : "";

    const result = await pool.request()
      .input("nkrId", nkrIdNum)
      .input("raporFormati", raporFormati)
      .query(`
        SELECT
          x1.ID                                       AS X1ID,
          x1.AnalizID,
          ISNULL(s.Kod, '')                            AS Kod,
          ISNULL(s.Ad, '')                             AS Ad,
          ISNULL(s.Akreditasyon, '')                   AS Akreditasyon,
          ISNULL(s.Method, '')                         AS Metot,
          ISNULL(s.Matriks, '')                        AS Matriks,
          ISNULL(x1.[Limit], '')                       AS LimitDeger,
          CONVERT(varchar(10), x1.Termin, 23)          AS Termin,
          ${bolumSelect}
        FROM NumuneX1 x1
        INNER JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
        ${bolumJoin}
        WHERE x1.RaporID = @nkrId
          AND s.RaporFormati = @raporFormati
        ORDER BY s.Kod
      `);

    return Response.json({ data: result.recordset });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
