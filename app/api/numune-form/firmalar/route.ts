import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";

// GET /api/numune-form/firmalar?q=arama
// Firma araması — MSSQL massgrup_cosmo · Firma (Firma_Adi → Ad)
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  if (q.length < 1) return Response.json([]);

  try {
    const pool = await cosmoPool;
    const result = await pool.request()
      .input("q", q)
      .query(`
        SELECT TOP 15 ID, ISNULL(Firma_Adi, '') AS Ad
        FROM Firma
        WHERE Durum = N'Aktif'
          AND ISNULL(Firma_Adi, '') COLLATE Turkish_CI_AS LIKE N'%' + @q + '%'
        ORDER BY Firma_Adi
      `);

    return Response.json(result.recordset);
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
