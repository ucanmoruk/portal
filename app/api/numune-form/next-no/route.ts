import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { type NextRequest } from "next/server";

// GET /api/numune-form/next-no?grup=Özel
// Döner: { evrakNo, raporNo }
// Özel ve K.D. için RaporNo ayrı sıra; Evrak_No tüm kayıtlarda ortak
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const grup = request.nextUrl.searchParams.get("grup") || "Özel";

  try {
    const pool = await poolPromise;

    const [evrakRes, raporRes] = await Promise.all([
      pool.request().query(
        "SELECT ISNULL(MAX(TRY_CAST(Evrak_No AS INT)), 0) + 1 AS NextNo FROM NKR"
      ),
      pool.request()
        .input("grup", grup)
        .query(
          "SELECT ISNULL(MAX(TRY_CAST(RaporNo AS INT)), 0) + 1 AS NextNo FROM NKR WHERE Grup = @grup"
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
