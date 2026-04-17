import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
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

    // Önce bu ürüne ait eski formül satırlarını sil
    await pool.request()
      .input("urunId", urunId)
      .query("DELETE FROM rUGDFormul WHERE UrunID = @urunId");

    // Yeni satırları ekle
    for (const row of rows) {
      await pool.request()
        .input("urunId", urunId)
        .input("hammaddeId", row.cosingId ?? null)
        .input("inciName", row.INCIName ?? row.inputName ?? "")
        .input("miktar", String(row.inputAmount ?? row.miktar ?? "0"))
        .input("dap", row.dap ?? 100)
        .input("noael", row.noael ? String(row.noael) : null)
        .query(`
          INSERT INTO rUGDFormul (UrunID, HammaddeID, INCIName, Miktar, DaP, Noael)
          VALUES (@urunId, @hammaddeId, @inciName, @miktar, @dap, @noael)
        `);
    }

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
               c.Cas, c.EC, c.Functions, c.Regulation, c.Link
        FROM rUGDFormul f
        LEFT JOIN rCosing c ON c.ID = f.HammaddeID
        WHERE f.UrunID = @urunId
        ORDER BY f.ID
      `);

    return Response.json(result.recordset);
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
