import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

// GET /api/admin/kullanicilar — Aktif personel listesi
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT ID, Kadi, Ad, Soyad, Gorev, Email, BirimID, Durum
      FROM RootKullanici
      WHERE Durum = 'Aktif'
      ORDER BY Ad, Soyad
    `);
    return Response.json(result.recordset);
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
