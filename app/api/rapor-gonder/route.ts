import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  try {
    const pool = await poolPromise;
    const res = await pool.request().query(`
      SELECT
        n.ID AS NkrID,
        n.Evrak_No,
        n.RaporNo,
        n.Numune_Adi,
        f.Ad AS Firma_Ad,
        p.Ad AS Proje_Ad,
        n.Tarih,
        CASE WHEN COUNT(x1.ID) = SUM(CASE WHEN x1.HizmetDurum = 'Tamamlandı' THEN 1 ELSE 0 END) 
             THEN 'Tamamlandı' ELSE 'Devam' END AS Durum
      FROM NKR n
      LEFT JOIN RootTedarikci f ON f.ID = n.Firma_ID
      LEFT JOIN NumuneDetay nd ON nd.RaporID = n.ID
      LEFT JOIN RootTedarikci p ON p.ID = nd.ProjeID
      LEFT JOIN NumuneX1 x1 ON x1.RaporID = n.ID
      WHERE n.Durum = 'Aktif'
      GROUP BY n.ID, n.Evrak_No, n.RaporNo, n.Numune_Adi, f.Ad, p.Ad, n.Tarih
      ORDER BY n.Tarih DESC, n.Evrak_No DESC
    `);

    return Response.json({ data: res.recordset });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
