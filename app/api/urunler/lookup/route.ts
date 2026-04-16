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

    // Sonraki RaporNo (max + 1)
    const raporNoResult = await pool.request()
      .query("SELECT ISNULL(MAX(TRY_CAST(RaporNo AS INT)), 0) + 1 AS nextRaporNo FROM rUGDListe WHERE BirimID = '1005' AND Durum = 'Aktif'");

    return Response.json({
      firmalar: firmalarResult.recordset,
      tipler: tiplerResult.recordset,
      nextRaporNo: raporNoResult.recordset[0].nextRaporNo ?? 1,
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
