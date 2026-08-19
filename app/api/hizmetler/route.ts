import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { saveAltParametreler } from "@/lib/altParametre";
import { type NextRequest } from "next/server";

// Hangi kolonların mevcut olduğunu kontrol et (30s TTL cache — ALTER TABLE sonrası
// sunucu restart gerektirmesin)
let _colCache: { cols: Set<string>; ts: number } | null = null;
const COL_CACHE_TTL_MS = 30_000;
async function getStokCols(pool: any): Promise<Set<string>> {
  if (_colCache && Date.now() - _colCache.ts < COL_CACHE_TTL_MS) return _colCache.cols;
  const r = await pool.request().query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='StokAnalizListesi'"
  );
  const cols = new Set<string>(r.recordset.map((row: any) => row.COLUMN_NAME as string));
  _colCache = { cols, ts: Date.now() };
  return cols;
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
    const pool = await cosmoPool;
    const cols = await getStokCols(pool);
    const hasRF = cols.has("RaporFormati");
    const hasYK = cols.has("YetkiliID");
    const hasBL = cols.has("BolumID");
    const hasOB = cols.has("OlcumBelirsizligi");

    const whereClauses: string[] = ["Durumu = 'Aktif'"];

    if (search) {
      whereClauses.push(`(
        ISNULL(Ad, '') COLLATE Turkish_CI_AS LIKE N'%' + @search + '%'
        OR ISNULL(AdEn, '') COLLATE Turkish_CI_AS LIKE N'%' + @search + '%'
        OR ISNULL(Kod, '') COLLATE Turkish_CI_AS LIKE N'%' + @search + '%'
        OR ISNULL(Method, '') COLLATE Turkish_CI_AS LIKE N'%' + @search + '%'
        OR ISNULL(Matriks, '') COLLATE Turkish_CI_AS LIKE N'%' + @search + '%'
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
      hasBL ? "BolumID"   : "NULL AS BolumID",
      hasOB ? "ISNULL(OlcumBelirsizligi, '') AS OlcumBelirsizligi" : "'' AS OlcumBelirsizligi",
    ].join(", ");

    const dataResult = await req.query(`
      SELECT
        ID, Kod, Ad, AdEn, Method, MethodEn, Matriks,
        Akreditasyon, Sure, NumGereklilik, NumDipnot, NumDipnotEn,
        Fiyat, ParaBirimi, Durumu,
        ISNULL([Limit], '') AS [Limit],
        ISNULL(BirimText, '') AS Birim,
        ISNULL(LOQ, '') AS LOQ,
        ISNULL(LimitEn, '') AS LimitEn,
        ISNULL(BirimEn, '') AS BirimEn,
        ISNULL(LOQEn, '') AS LOQEn,
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
      Fiyat, ParaBirimi, RaporFormati, YetkiliID, BolumID,
      Limit, Birim, LOQ, LimitEn, BirimEn, LOQEn, OlcumBelirsizligi,
    } = body;

    if (!Kod?.trim()) return Response.json({ error: "Kod zorunludur." }, { status: 400 });
    if (!Ad?.trim())  return Response.json({ error: "Ad zorunludur."  }, { status: 400 });

    const pool = await cosmoPool;
    const cols = await getStokCols(pool);
    const hasRF = cols.has("RaporFormati");
    const hasYK = cols.has("YetkiliID");
    const hasBL = cols.has("BolumID");
    const hasOB = cols.has("OlcumBelirsizligi");

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
      .input("Durumu",        "Aktif")
      .input("Limit",         Limit         || null)
      .input("BirimText",     Birim         || null)
      .input("LOQ",           LOQ           || null)
      .input("LimitEn",       LimitEn       || null)
      .input("BirimEn",       BirimEn       || null)
      .input("LOQEn",         LOQEn         || null);

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
    if (hasBL) {
      req.input("BolumID", BolumID ? parseInt(BolumID) : null);
      extraCols.push("BolumID");
      extraVals.push("@BolumID");
    }
    if (hasOB) {
      req.input("OlcumBelirsizligi", OlcumBelirsizligi || null);
      extraCols.push("OlcumBelirsizligi");
      extraVals.push("@OlcumBelirsizligi");
    }

    const colsPart = extraCols.length ? `, ${extraCols.join(", ")}` : "";
    const valsPart = extraVals.length ? `, ${extraVals.join(", ")}` : "";

    const result = await req.query(`
      INSERT INTO StokAnalizListesi
        (Kod, Ad, AdEn, Method, MethodEn, Matriks, Akreditasyon,
         Sure, NumGereklilik, NumDipnot, NumDipnotEn, Fiyat, ParaBirimi, Durumu,
         [Limit], BirimText, LOQ, LimitEn, BirimEn, LOQEn${colsPart})
      OUTPUT INSERTED.ID
      VALUES
        (@Kod, @Ad, @AdEn, @Method, @MethodEn, @Matriks, @Akreditasyon,
         @Sure, @NumGereklilik, @NumDipnot, @NumDipnotEn, @Fiyat, @ParaBirimi, @Durumu,
         @Limit, @BirimText, @LOQ, @LimitEn, @BirimEn, @LOQEn${valsPart})
    `);

    const newId = result.recordset[0].ID;
    // Alt parametreler (tablo yoksa no-op)
    await saveAltParametreler(pool, newId, body.altParametreler);

    return Response.json({ id: newId }, { status: 201 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
