import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Liste alınamadı";
}

// GET /api/musteriler/yuklenmis-belgeler?search=&page=1&limit=20
// Bu araçla yüklenen (Yol tam URL, http… ile başlayan) ve Aktif belgeleri listeler
// — yani müşteri portalı "Belgelerim"de görünen manuel yüklemeler.
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const search = sp.get("search")?.trim() || "";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(5, parseInt(sp.get("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  const searchClause = search
    ? `AND (
         LOWER(ISNULL(CAST(r.RaporNo AS NVARCHAR), '')) LIKE LOWER(@q)
         OR LOWER(ISNULL(r.NumuneAd, '')) LIKE LOWER(@q)
         OR LOWER(ISNULL(r.NumuneTur, '')) LIKE LOWER(@q)
         OR LOWER(ISNULL(NULLIF(r.FirmaAd, ''), ISNULL(f.Firma_Adi, ''))) LIKE LOWER(@q)
         OR LOWER(ISNULL(NULLIF(r.Proje, ''), ISNULL(p.Firma_Adi, ''))) LIKE LOWER(@q)
       )`
    : "";

  try {
    const pool = await cosmoPool;
    const req = pool.request().input("offset", offset).input("limit", limit);
    if (search) req.input("q", `%${search}%`);

    const result = await req.query(`
      SELECT
        r.ID,
        CONVERT(varchar(10), r.Tarih, 23)                    AS Tarih,
        r.RaporNo,
        r.NumuneTur,
        r.NumuneAd,
        ISNULL(NULLIF(r.FirmaAd, ''), ISNULL(f.Firma_Adi, '')) AS FirmaAd,
        ISNULL(NULLIF(r.Proje, ''), ISNULL(p.Firma_Adi, ''))   AS Proje,
        r.Yol,
        COUNT(*) OVER() AS TotalCount
      FROM Rapor r
      LEFT JOIN Firma f ON f.ID = r.FirmaID
      LEFT JOIN Firma p ON p.ID = r.ProjeID
      WHERE r.Durum = 'Aktif' AND r.Yol LIKE 'http%'
        ${searchClause}
      ORDER BY r.Tarih DESC, r.ID DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const total = result.recordset[0]?.TotalCount ?? 0;
    const data = result.recordset.map((row: Record<string, unknown> & { TotalCount?: number }) => {
      const item = { ...row };
      delete item.TotalCount;
      return item;
    });

    return Response.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (e: unknown) {
    return Response.json({ error: getErrorMessage(e) }, { status: 500 });
  }
}
