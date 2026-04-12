import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { NextRequest } from "next/server";

// GET /api/rapor-takip/yazdir?ids=1,2,3
// Toplu rapor yazdırma - PDF veya rapor listesi döner
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const idsStr = request.nextUrl.searchParams.get("ids") || "";
  const ids = idsStr.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n));

  if (ids.length === 0) return Response.json({ error: "ID gerekli" }, { status: 400 });

  try {
    const pool = await poolPromise;

    // Raporları al
    const placeholders = ids.map((_, i) => `@id${i}`).join(",");
    const req = pool.request();
    ids.forEach((id, i) => req.input(`id${i}`, id));

    const result = await req.query(`
      SELECT DISTINCT
        n.ID,
        n.Evrak_No,
        n.RaporNo,
        n.Numune_Adi,
        f.Ad AS FirmaAd,
        s.RaporFormati
      FROM NKR n
      LEFT JOIN RootTedarikci f ON f.ID = n.Firma_ID
      INNER JOIN NumuneX1 x1 ON x1.RaporID = n.ID
      INNER JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
      WHERE n.ID IN (${placeholders}) AND n.Durum = 'Aktif'
      ORDER BY n.RaporNo, s.RaporFormati
    `);

    // TODO: Rapor PDF oluşturma veya yazdırma sayfasına yönlendir
    // Şimdilik rapor listesini döndür
    return Response.json({
      message: `${ids.length} rapor yazdırılacak`,
      raporlar: result.recordset,
      // redirect: `/rapor-yazdir?ids=${ids.join(",")}`
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
