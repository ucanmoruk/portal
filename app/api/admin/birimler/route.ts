import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT ID, Birim, FirmaID, Durum
      FROM RootFirmaBirim
      WHERE Durum = 'Aktif'
      ORDER BY Birim
    `);

    return Response.json(result.recordset);
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
