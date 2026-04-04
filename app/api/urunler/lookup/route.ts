import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const pool = await poolPromise;
    
    // Firmalar
    const firmalarResult = await pool.request()
      .query("SELECT ID, Ad FROM RootTedarikci WHERE Durum = 'Aktif' ORDER BY Ad");

    // Ürün Tipleri (rUGDTip)
    const tiplerResult = await pool.request()
      .query("SELECT ID, UrunTipi, UygulamaBolgesi, ADegeri FROM rUGDTip ORDER BY UrunTipi");

    return Response.json({
      firmalar: firmalarResult.recordset,
      tipler: tiplerResult.recordset
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
