import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { type NextRequest } from "next/server";

// GET /api/numune-form/firmalar?q=arama
// Firma ve Proje arama için — her ikisi de RootTedarikci'den gelir
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  if (q.length < 1) return Response.json([]);

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("q", q)
      .query(`
        SELECT TOP 15 ID, Ad
        FROM RootTedarikci
        WHERE Durum = N'Aktif'
          AND Ad LIKE N'%' + @q + '%'
        ORDER BY Ad
      `);

    return Response.json(result.recordset);
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
