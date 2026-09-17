import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { withUgdTransaction, saveUgdFormulaRows } from "@/lib/ugdPersistence";
import { enrichUgdFormulaRows } from "@/lib/ugdRegulationLookup";
import { type NextRequest } from "next/server";

// POST /api/urunler/formul — formül satırlarını rUGDFormül tablosuna kaydeder
// Body: { urunId: number, rows: Array<{ cosingId, INCIName, miktar, dap, noael }> }
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  try {
    const { urunId, rows } = await request.json();
    if (!urunId || !Array.isArray(rows)) {
      return Response.json({ error: "Geçersiz veri" }, { status: 400 });
    }

    const pool = await poolPromise;

    await withUgdTransaction(pool, transaction => saveUgdFormulaRows(transaction, Number(urunId), rows));

    return Response.json({ message: "Formül kaydedildi", count: rows.length });
  } catch (e: any) {
    console.error("[formul save]", e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// GET /api/urunler/formul?urunId=X — ürüne ait formül satırlarını getirir
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const urunId = searchParams.get("urunId");
    if (!urunId) return Response.json({ error: "urunId gerekli" }, { status: 400 });

    const pool = await poolPromise;
    const result = await pool.request()
      .input("urunId", urunId)
      .query(`
        SELECT f.UrunID, f.HammaddeID, f.INCIName, f.Miktar, f.DaP, f.Noael,
               c.Cas, c.EC, c.Functions, c.Kategori, c.Regulation, c.Link
        FROM rUGDFormul f
        LEFT JOIN rCosing c ON c.ID = f.HammaddeID
        WHERE f.UrunID = @urunId
        ORDER BY f.ID
      `);

    const rows = await enrichUgdFormulaRows(result.recordset);
    return Response.json(rows);
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
