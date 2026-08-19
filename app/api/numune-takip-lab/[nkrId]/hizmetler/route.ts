import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";
import { applyManualServiceOrder } from "@/lib/raporServiceOrder";

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
    const pool = await cosmoPool;

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

    const tableColRes = await pool.request().query(`
      SELECT 'table' AS Kind, TABLE_NAME AS Name
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = 'NKR_LabKabul' AND TABLE_SCHEMA IN ('dbo','cosmoroot')
      UNION ALL
      SELECT 'column' AS Kind, COLUMN_NAME AS Name
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'NumuneX1' AND COLUMN_NAME = 'HizmetDurum'
    `);
    const hasLabKabul = tableColRes.recordset.some((r: { Kind: string; Name: string }) => r.Kind === "table" && r.Name === "NKR_LabKabul");
    const hasHizmetDurum = tableColRes.recordset.some((r: { Kind: string; Name: string }) => r.Kind === "column" && r.Name === "HizmetDurum");
    const newOnlyFilter = hasLabKabul && hasHizmetDurum
      ? `AND (
          NOT EXISTS (
            SELECT 1
            FROM NKR_LabKabul k
            WHERE k.NkrID = x1.RaporID
              AND k.RaporFormati = @raporFormati
          )
          OR x1.HizmetDurum IN (N'Yeni', N'YeniAnaliz', N'Yeni Analiz')
        )`
      : "";

        const x1ColCheck = await pool.request().query(`
          SELECT name FROM sys.columns
          WHERE object_id = OBJECT_ID('NumuneX1')
            AND name IN ('RaporSira')
        `);
        const hasRaporSira = x1ColCheck.recordset.some((r: any) => r.name === "RaporSira");
        const raporSiraSelect = hasRaporSira ? "x1.RaporSira," : "CAST(NULL AS int) AS RaporSira,";

        const result = await pool.request()
      .input("nkrId", nkrIdNum)
      .input("raporFormati", raporFormati)
      .query(`
        SELECT
          x1.ID                                       AS X1ID,
          x1.AnalizID,
          ${raporSiraSelect}
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
          AND COALESCE(NULLIF(s.RaporFormati, ''), N'Genel') = @raporFormati
          ${newOnlyFilter}
        ORDER BY s.Kod, x1.ID
      `);

    return Response.json({ data: applyManualServiceOrder(result.recordset) });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
