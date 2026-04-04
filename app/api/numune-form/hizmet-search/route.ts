import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { type NextRequest } from "next/server";

// GET /api/numune-form/hizmet-search?q=arama
// Tab2 - tekil analiz arama (StokAnalizListesi)
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
        SELECT TOP 20 ID, Kod, Ad, AdEn, Method, Sure
        FROM StokAnalizListesi
        WHERE Durumu = 'Aktif'
          AND (
            Kod  LIKE N'%' + @q + '%'
            OR Ad LIKE N'%' + @q + '%'
          )
        ORDER BY Kod
      `);

    return Response.json(result.recordset);
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
