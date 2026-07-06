import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";

// GET /api/analiz-numune-listesi
// Numunelere atanmış analiz hizmetlerini hizmet bazlı listeler.
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const search = sp.get("search")?.trim() || "";
  const hizmetKodu = sp.get("hizmetKodu")?.trim() || "";
  const tarihBas = sp.get("tarihBas")?.trim() || "";
  const tarihBit = sp.get("tarihBit")?.trim() || "";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(5, parseInt(sp.get("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  try {
    const pool = await cosmoPool;

    const searchClause = search
      ? `AND (
          LOWER(ISNULL(s.Kod, '')) LIKE LOWER(@searchLike)
          OR LOWER(ISNULL(s.Ad, '')) LIKE LOWER(@searchLike)
          OR LOWER(ISNULL(CAST(n.RaporNo AS NVARCHAR), '')) LIKE LOWER(@searchLike)
          OR LOWER(ISNULL(f.Ad, '')) LIKE LOWER(@searchLike)
          OR LOWER(ISNULL(n.Numune_Adi, '')) LIKE LOWER(@searchLike)
        )`
      : "";

    const filterClause =
      (hizmetKodu ? " AND LOWER(ISNULL(s.Kod, '')) LIKE LOWER(@hizmetKoduLike)" : "") +
      (tarihBas ? " AND CONVERT(date, n.Tarih) >= @tarihBas" : "") +
      (tarihBit ? " AND CONVERT(date, n.Tarih) <= @tarihBit" : "");

    const query = `
      WITH Liste AS (
        SELECT
          x1.ID                                      AS X1ID,
          n.ID                                       AS NkrID,
          ISNULL(s.Kod, '')                         AS HizmetKodu,
          ISNULL(s.Ad, '')                          AS HizmetAdi,
          CONVERT(varchar(10), n.Tarih, 23)         AS Tarih,
          n.RaporNo                                 AS RaporNo,
          ISNULL(f.Ad, '')                          AS FirmaAdi,
          ISNULL(n.Numune_Adi, '')                  AS NumuneAdi
        FROM NumuneX1 x1
        INNER JOIN NKR n ON n.ID = x1.RaporID
        INNER JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
        LEFT JOIN (
          SELECT ID, Firma_Adi AS Ad
          FROM Firma
        ) f ON f.ID = n.Firma_ID
        WHERE n.Durum = 'Aktif'
          ${searchClause}
          ${filterClause}
      )
      SELECT *, COUNT(*) OVER() AS TotalCount
      FROM Liste
      ORDER BY Tarih DESC, RaporNo DESC, HizmetKodu ASC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `;

    const req = pool.request()
      .input("offset", offset)
      .input("limit", limit);

    if (search) req.input("searchLike", `%${search}%`);
    if (hizmetKodu) req.input("hizmetKoduLike", `%${hizmetKodu}%`);
    if (tarihBas) req.input("tarihBas", tarihBas);
    if (tarihBit) req.input("tarihBit", tarihBit);

    const result = await req.query(query);
    const total = Number(result.recordset[0]?.TotalCount ?? 0);
    const data = result.recordset.map(({ TotalCount: _t, ...row }: any) => row);

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
