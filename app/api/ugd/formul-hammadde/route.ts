import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { type NextRequest } from "next/server";

// Flattened liste: tüm aktif ürünlerin formül satırlarını ürün bilgileriyle join eder.
// Bir hammaddenin hangi ürünlerde kullanıldığını görmek için kullanılır.
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const search = sp.get("search")?.trim() || "";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const limit = Math.min(200, Math.max(10, parseInt(sp.get("limit") || "25", 10)));
  const offset = (page - 1) * limit;

  try {
    const pool = await poolPromise;

    const whereParts = ["u.Durum = 'Aktif'", "u.BirimID = '1005'"];
    if (search) {
      // RaporNo integer kolonu — empty string fallback (ISNULL/COALESCE) integer'a
      // cast edilemiyor; metin karşılaştırması için CAST AS NVARCHAR ile string'e çevir.
      whereParts.push(`(
        ISNULL(CAST(u.RaporNo AS NVARCHAR(50)), '') COLLATE Turkish_CI_AS LIKE N'%' + @search + '%'
        OR ISNULL(u.Urun, '') COLLATE Turkish_CI_AS LIKE N'%' + @search + '%'
        OR ISNULL(f.INCIName, '') COLLATE Turkish_CI_AS LIKE N'%' + @search + '%'
      )`);
    }
    const where = `WHERE ${whereParts.join(" AND ")}`;

    const req = pool.request()
      .input("search", search)
      .input("offset", offset)
      .input("limit", limit);

    const countRes = await req.query(`
      SELECT COUNT(*) AS total
      FROM rUGDFormul f
      INNER JOIN rUGDListe u ON u.ID = f.UrunID
      ${where}
    `);
    const total = countRes.recordset[0]?.total ?? 0;

    const dataRes = await req.query(`
      SELECT
        u.ID AS UrunID,
        CAST(u.RaporNo AS NVARCHAR(50)) AS RaporNo,
        u.Urun AS UrunAdi,
        ISNULL(f.INCIName, '') AS INCIName,
        CAST(ISNULL(f.Miktar, '0') AS NVARCHAR(50)) AS Yuzde
      FROM rUGDFormul f
      INNER JOIN rUGDListe u ON u.ID = f.UrunID
      ${where}
      ORDER BY u.RaporNo DESC, f.ID
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    return Response.json({
      data: dataRes.recordset,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Liste alınamadı";
    return Response.json({ error: msg }, { status: 500 });
  }
}
