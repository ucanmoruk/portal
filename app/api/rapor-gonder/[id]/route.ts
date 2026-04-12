import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  const { id } = await params;
  const nkrId = parseInt(id);

  try {
    const pool = await poolPromise;
    const res = await pool.request()
      .input("id", nkrId)
      .query(`
        SELECT
          x1.ID AS X1ID,
          s.Kod,
          s.Ad AS HizmetAd,
          s.Method AS Metot,
          x1.Sonuc,
          x1.Limit,
          x1.Birim,
          x1.Degerlendirme,
          x1.HizmetDurum
        FROM NumuneX1 x1
        LEFT JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
        WHERE x1.RaporID = @id
        ORDER BY x1.ID
      `);

    return Response.json({ hizmetler: res.recordset });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
