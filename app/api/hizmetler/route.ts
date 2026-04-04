import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { type NextRequest } from "next/server";

// Hangi kolonların mevcut olduğunu kontrol et (module-level cache)
let _colCache: Set<string> | null = null;
async function getStokCols(pool: any): Promise<Set<string>> {
  if (_colCache) return _colCache;
  const r = await pool.request().query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='StokAnalizListesi'"
  );
  _colCache = new Set<string>(r.recordset.map((row: any) => row.COLUMN_NAME as string));
  return _colCache;
}

// ----------------------------------------------------------------
// GET  /api/hizmetler?search=&page=1&limit=20
// ----------------------------------------------------------------
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const search = sp.get("search")?.trim() || "";
  const page   = Math.max(1, parseInt(sp.get("page")  || "1",  10));
  const limit  = Math.min(100, Math.max(5, parseInt(sp.get("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  try {
    const pool = await poolPromise;
    const cols = await getStokCols(pool);
    const hasRF = cols.has("RaporFormati");
    const hasYK = cols.has("YetkiliID");

    const whereClauses: string[] = ["Durumu = 'Aktif'"];

    if (search) {
      whereClauses.push(`(
        Ad       LIKE N'%' + @search + '%'
        OR AdEn  LIKE N'%' + @search + '%'
        OR Kod   LIKE N'%' + @search + '%'
        OR Method LIKE N'%' + @search + '%'
        OR Matriks LIKE N'%' + @search + '%'
      )`);
    }

    const where = `WHERE ${whereClauses.join(" AND ")}`;

    const req = pool.request()
      .input("search", search)
      .input("offset", offset)
      .input("limit",  limit);

    const countResult = await req.query(
      `SELECT COUNT(*) AS total FROM StokAnalizListesi ${where}`
    );
    const total = countResult.recordset[0].total;

    const optCols = [
      hasRF ? "ISNULL(RaporFormati, '') AS RaporFormati" : "'' AS RaporFormati",
      hasYK ? "YetkiliID" : "NULL AS YetkiliID",
    ].join(", ");

    const dataResult = await req.query(`
      SELECT
        ID, Kod, Ad, AdEn, Method, MethodEn, Matriks,
        Akreditasyon, Sure, NumGereklilik, NumDipnot, NumDipnotEn,
        Fiyat, ParaBirimi, Durumu,
        ${optCols}
      FROM StokAnalizListesi
      ${where}
      ORDER BY Kod
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    return Response.json({
      data: dataResult.recordset,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ----------------------------------------------------------------
// POST /api/hizmetler  (yeni hizmet ekle)
// ----------------------------------------------------------------
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const body = await request.json();
    const {
      Kod, Ad, AdEn, Method, MethodEn, Matriks,
      Akreditasyon, Sure, NumGereklilik, NumDipnot, NumDipnotEn,
      Fiyat, ParaBirimi, RaporFormati, YetkiliID,
    } = body;

    if (!Kod?.trim()) return Response.json({ error: "Kod zorunludur." }, { status: 400 });
    if (!Ad?.trim())  return Response.json({ error: "Ad zorunludur."  }, { status: 400 });

    const pool = await poolPromise;
    const cols = await getStokCols(pool);
    const hasRF = cols.has("RaporFormati");
    const hasYK = cols.has("YetkiliID");

    const req = pool.request()
      .input("Kod",           Kod.trim())
      .input("Ad",            Ad.trim())
      .input("AdEn",          AdEn          || null)
      .input("Method",        Method        || null)
      .input("MethodEn",      MethodEn      || null)
      .input("Matriks",       Matriks       || null)
      .input("Akreditasyon",  Akreditasyon  || "Yok")
      .input("Sure",          Sure          ? parseInt(Sure) : null)
      .input("NumGereklilik", NumGereklilik || null)
      .input("NumDipnot",     NumDipnot     || null)
      .input("NumDipnotEn",   NumDipnotEn   || null)
      .input("Fiyat",         Fiyat         ? parseFloat(Fiyat) : null)
      .input("ParaBirimi",    ParaBirimi    || "₺")
      .input("Durumu",        "Aktif");

    const extraCols: string[] = [];
    const extraVals: string[] = [];

    if (hasRF) {
      req.input("RaporFormati", RaporFormati || null);
      extraCols.push("RaporFormati");
      extraVals.push("@RaporFormati");
    }
    if (hasYK) {
      req.input("YetkiliID", YetkiliID ? parseInt(YetkiliID) : null);
      extraCols.push("YetkiliID");
      extraVals.push("@YetkiliID");
    }

    const colsPart = extraCols.length ? `, ${extraCols.join(", ")}` : "";
    const valsPart = extraVals.length ? `, ${extraVals.join(", ")}` : "";

    const result = await req.query(`
      INSERT INTO StokAnalizListesi
        (Kod, Ad, AdEn, Method, MethodEn, Matriks, Akreditasyon,
         Sure, NumGereklilik, NumDipnot, NumDipnotEn, Fiyat, ParaBirimi, Durumu${colsPart})
      OUTPUT INSERTED.ID
      VALUES
        (@Kod, @Ad, @AdEn, @Method, @MethodEn, @Matriks, @Akreditasyon,
         @Sure, @NumGereklilik, @NumDipnot, @NumDipnotEn, @Fiyat, @ParaBirimi, @Durumu${valsPart})
    `);

    return Response.json({ id: result.recordset[0].ID }, { status: 201 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
