import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

// GET /api/rapor-takip/rapor-formatlari
// Mevcut rapor formatlarını döner
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const pool = await poolPromise;
    
    const result = await pool.request().query(`
      SELECT DISTINCT RaporFormati
      FROM StokAnalizListesi 
      WHERE RaporFormati IS NOT NULL 
      AND RaporFormati != ''
      ORDER BY RaporFormati
    `);

    return Response.json(result.recordset.map((row: any) => row.RaporFormati));
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
