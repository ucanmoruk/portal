import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

// Module-level col cache (shared with parent route in same process via import)
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
// GET /api/hizmetler/[id]
// ----------------------------------------------------------------
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  try {
    const pool = await poolPromise;
    const cols = await getStokCols(pool);
    const hasRF = cols.has("RaporFormati");
    const hasYK = cols.has("YetkiliID");

    const optCols = [
      hasRF ? "ISNULL(RaporFormati, '') AS RaporFormati" : "'' AS RaporFormati",
      hasYK ? "YetkiliID" : "NULL AS YetkiliID",
    ].join(", ");

    const result = await pool.request()
      .input("id", id)
      .query(`
        SELECT
          ID, Kod, Ad, AdEn, Method, MethodEn, Matriks,
          Akreditasyon, Sure, NumGereklilik, NumDipnot, NumDipnotEn,
          Fiyat, ParaBirimi, Durumu,
          ${optCols}
        FROM StokAnalizListesi
        WHERE ID = @id
      `);

    if (!result.recordset[0])
      return Response.json({ error: "Bulunamadı" }, { status: 404 });

    return Response.json(result.recordset[0]);
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ----------------------------------------------------------------
// PUT /api/hizmetler/[id]
// ----------------------------------------------------------------
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  try {
    const body = await request.json();
    const {
      Kod, Ad, AdEn, Method, MethodEn, Matriks,
      Akreditasyon, Sure, NumGereklilik, NumDipnot, NumDipnotEn,
      Fiyat, ParaBirimi, Durumu, RaporFormati, YetkiliID,
    } = body;

    const pool = await poolPromise;
    const cols = await getStokCols(pool);
    const hasRF = cols.has("RaporFormati");
    const hasYK = cols.has("YetkiliID");

    const req = pool.request()
      .input("id",            id)
      .input("Kod",           Kod           || null)
      .input("Ad",            Ad            || null)
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
      .input("Durumu",        Durumu        || "Aktif");

    const extraSets: string[] = [];

    if (hasRF) {
      req.input("RaporFormati", RaporFormati || null);
      extraSets.push("RaporFormati = @RaporFormati");
    }
    if (hasYK) {
      req.input("YetkiliID", YetkiliID ? parseInt(YetkiliID) : null);
      extraSets.push("YetkiliID = @YetkiliID");
    }

    const extraSetStr = extraSets.length ? `,\n          ${extraSets.join(",\n          ")}` : "";

    await req.query(`
      UPDATE StokAnalizListesi
      SET
        Kod           = @Kod,
        Ad            = @Ad,
        AdEn          = @AdEn,
        Method        = @Method,
        MethodEn      = @MethodEn,
        Matriks       = @Matriks,
        Akreditasyon  = @Akreditasyon,
        Sure          = @Sure,
        NumGereklilik = @NumGereklilik,
        NumDipnot     = @NumDipnot,
        NumDipnotEn   = @NumDipnotEn,
        Fiyat         = @Fiyat,
        ParaBirimi    = @ParaBirimi,
        Durumu        = @Durumu${extraSetStr}
      WHERE ID = @id
    `);

    return Response.json({ message: "Güncellendi" });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
