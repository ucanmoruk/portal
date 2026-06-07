import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";

// GET /api/numune-takip-lab/pending
// "Kabul Bekleyenler" listesi.
// Her (NKR.ID, RaporFormati) kombinasyonu için 1 satır döner — eğer henüz
// NKR_LabKabul tablosunda bu kombinasyon için kayıt yoksa.
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const search = sp.get("search")?.trim() || "";
  const page   = Math.max(1, parseInt(sp.get("page")  || "1", 10));
  const limit  = Math.min(100, Math.max(5, parseInt(sp.get("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  try {
    const pool = await cosmoPool;

    // NKR_LabKabul tablosu yok ise her kayıt "bekliyor" sayılır.
    // Schema filtresi: Postgres mirror'da public şemasında lowercase legacy
    // tablolardan kaçınmak için dbo/cosmoroot ile sınırlıyoruz.
    const tblCheck = await pool.request().query(
      `SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_NAME = 'NKR_LabKabul' AND TABLE_SCHEMA IN ('dbo', 'cosmoroot')`
    );
    const hasKabulTable = tblCheck.recordset.length > 0;

    const searchClause = search
      ? `AND (
          LOWER(ISNULL(CAST(n.Evrak_No AS NVARCHAR), '')) LIKE LOWER(@qLike)
          OR LOWER(ISNULL(CAST(n.RaporNo AS NVARCHAR), '')) LIKE LOWER(@qLike)
          OR LOWER(ISNULL(n.Numune_Adi, '')) LIKE LOWER(@qLike)
          OR LOWER(ISNULL(f.Ad, '')) LIKE LOWER(@qLike)
        )`
      : "";

    const notAcceptedJoin = hasKabulTable
      ? `LEFT JOIN NKR_LabKabul k
            ON k.NkrID = n.ID
           AND k.RaporFormati = s.RaporFormati`
      : "";
    const notAcceptedWhere = hasKabulTable ? "AND k.ID IS NULL" : "";

    const query = `
      WITH Pending AS (
        SELECT DISTINCT
          n.ID                              AS NkrID,
          CONVERT(varchar(10), n.Tarih, 23) AS Tarih,
          n.Evrak_No,
          n.RaporNo,
          n.Numune_Adi,
          f.Ad                              AS FirmaAd,
          p.Ad                              AS ProjeAd,
          s.RaporFormati
        FROM NKR n
        LEFT JOIN (SELECT ID, Firma_Adi AS Ad, Adres, Mail AS Email, Telefon, Vergi_Dairesi AS VergiDairesi, Vergi_No AS VergiNo, Yetkili FROM Firma) f  ON f.ID = n.Firma_ID
        LEFT JOIN NumuneDetay   nd ON nd.RaporID = n.ID
        LEFT JOIN (SELECT ID, Firma_Adi AS Ad, Adres, Mail AS Email, Telefon, Vergi_Dairesi AS VergiDairesi, Vergi_No AS VergiNo, Yetkili FROM Firma) p  ON p.ID = nd.ProjeID
        INNER JOIN NumuneX1         x1 ON x1.RaporID = n.ID
        INNER JOIN StokAnalizListesi s  ON s.ID = x1.AnalizID
          AND s.RaporFormati IS NOT NULL AND s.RaporFormati != ''
        ${notAcceptedJoin}
        WHERE n.Durum = 'Aktif'
          ${notAcceptedWhere}
          ${searchClause}
      )
      SELECT *, COUNT(*) OVER() AS TotalCount
      FROM Pending
      ORDER BY
        TRY_CAST(Evrak_No AS INT) ASC, Evrak_No ASC,
        TRY_CAST(RaporNo  AS INT) ASC, RaporNo  ASC,
        RaporFormati
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `;

    const req = pool.request()
      .input("offset", offset)
      .input("limit", limit);

    if (search) req.input("qLike", `%${search}%`);

    const result = await req.query(query);
    const total = result.recordset[0]?.TotalCount ?? 0;

    const data = result.recordset.map(({ TotalCount: _t, ...row }) => row);

    return Response.json({
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
