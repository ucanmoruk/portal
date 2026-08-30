import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";

// GET /api/numune-form/next-no?grup=Özel
// Döner: { evrakNo, raporNo }
// Özel ve K.D. için hem Evrak_No hem RaporNo ayrı sıra.
// Özel: YYxxx (örn. 26061), K.D.: YY1xxx (örn. 261061).
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const grup = request.nextUrl.searchParams.get("grup") || "Özel";

  try {
    const pool = await cosmoPool;
    const yy = String(new Date().getFullYear()).slice(-2);
    const isKd = grup.trim() === "K.D.";
    const minEvrakNo = Number(`${yy}${isKd ? "1000" : "000"}`);
    const maxEvrakNo = Number(`${yy}${isKd ? "1999" : "999"}`);

    const minRaporNo = isKd ? 0 : Number(`${yy}1000`);
    const maxRaporNo = isKd ? 999999999999 : Number(`${yy}1999`);
    const [evrakRes, raporRes] = await Promise.all([
      pool.request()
        .input("minEvrakNo", minEvrakNo)
        .input("maxEvrakNo", maxEvrakNo)
        .query(`
          SELECT ISNULL(MAX(TRY_CAST(Evrak_No AS INT)), @minEvrakNo - 1) + 1 AS NextNo
          FROM NKR
          WHERE TRY_CAST(Evrak_No AS INT) BETWEEN @minEvrakNo AND @maxEvrakNo
        `),
      pool.request()
        .input("grup", grup)
        .input("minRaporNo", minRaporNo)
        .input("maxRaporNo", maxRaporNo)
        .query(
          `SELECT ISNULL(MAX(TRY_CAST(RaporNo AS BIGINT)), @minRaporNo - 1) + 1 AS NextNo
           FROM NKR
           WHERE Grup = @grup AND TRY_CAST(RaporNo AS BIGINT) BETWEEN @minRaporNo AND @maxRaporNo`
        ),
    ]);

    return Response.json({
      evrakNo: String(evrakRes.recordset[0].NextNo),
      raporNo: String(raporRes.recordset[0].NextNo),
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
