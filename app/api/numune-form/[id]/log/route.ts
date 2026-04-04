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

  const { id } = await params;

  try {
    const pool = await poolPromise;
    if (!(await hasNkrLogTable(pool))) {
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
          l.KullaniciID
        FROM NKR_Log l
        WHERE l.NKRID = @id
        ORDER BY l.Tarih DESC
      `);

    return Response.json(result.recordset);
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
