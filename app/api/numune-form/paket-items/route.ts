import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { type NextRequest } from "next/server";

// GET /api/numune-form/paket-items?x3id=123
// Tab2 - NumuneX3 paketinin tüm kalemlerini döner (NumuneX4 → StokAnalizListesi join)
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const x3id = request.nextUrl.searchParams.get("x3id");
  if (!x3id) return Response.json({ error: "x3id gerekli" }, { status: 400 });

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("x3id", parseInt(x3id))
      .query(`
        SELECT
          x4.ID           AS X4ID,
          x4.AltAnalizID  AS AnalizID,
          s.Kod,
          s.Ad,
          s.AdEn,
          s.Method        AS Metot,
          s.Sure,
          x4.LimitDeger,
          x4.LimitBirimi,
          x4.Notlar
        FROM NumuneX4 x4
        LEFT JOIN StokAnalizListesi s ON s.ID = x4.AltAnalizID
        WHERE x4.ListeID = @x3id
        ORDER BY x4.ID
      `);

    return Response.json(result.recordset);
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
