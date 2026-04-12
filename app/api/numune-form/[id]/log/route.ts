import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { hasNkrLogTable } from "@/lib/numuneFormTables";

// GET /api/numune-form/[id]/log
// NKR_Log kayıtlarını döner (en yeni önce)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const { id } = await params;
    console.log("Log API called for id:", id); // Debug

    const pool = await poolPromise;
    if (!(await hasNkrLogTable(pool))) {
      console.log("NKR_Log table does not exist"); // Debug
      return Response.json([]);
    }

    const result = await pool.request()
      .input("id", parseInt(id))
      .query(`
        SELECT
          l.ID,
          CONVERT(varchar(19), l.Tarih, 120) AS Tarih,
          l.Eylem,
          l.Aciklama,
          l.KullaniciID,
          CASE 
            WHEN EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'RootKullanici')
            THEN (SELECT k.Ad + ' ' + k.Soyad FROM RootKullanici k WHERE k.ID = l.KullaniciID)
            ELSE NULL
          END AS KullaniciAd
        FROM NKR_Log l
        WHERE l.NKRID = @id
        ORDER BY l.Tarih DESC
      `);

    console.log("Log query result:", result.recordset.length, "rows"); // Debug
    return Response.json(result.recordset);
  } catch (e: any) {
    console.error("Log API error:", e); // Debug
    return Response.json({ error: e.message }, { status: 500 });
  }
}
