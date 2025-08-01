import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { ensureRaporMailLogTable } from "@/lib/raporMailLog";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(10, Number.parseInt(searchParams.get("limit") || "25", 10) || 25));
    const search = (searchParams.get("search") || "").trim();
    const status = (searchParams.get("status") || "").trim();
    const offset = (page - 1) * limit;
    const pool = await cosmoPool;
    await ensureRaporMailLogTable(pool);

    const filter = `WHERE (@search = '' OR
        EvrakNo LIKE @searchLike OR FirmaAdi LIKE @searchLike OR
        MailAdresi LIKE @searchLike OR CAST(NkrID AS NVARCHAR(30)) LIKE @searchLike)
      AND (@status = '' OR Durum = @status)`;
    const [countResult, rowsResult] = await Promise.all([
      pool.request()
        .input("search", search)
        .input("searchLike", `%${search}%`)
        .input("status", status)
        .query(`SELECT COUNT(*) AS Total FROM NKR_RaporMailLog ${filter}`),
      pool.request()
        .input("search", search)
        .input("searchLike", `%${search}%`)
        .input("status", status)
        .input("offset", offset)
        .input("limit", limit)
        .query(`
          SELECT LogID, NkrID, RaporFormati, EvrakNo, FirmaAdi, MailAdresi,
                 GonderimTarihi, Durum, Aciklama, Gonderen, MessageId
          FROM NKR_RaporMailLog
          ${filter}
          ORDER BY ID DESC
          OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `),
    ]);

    const total = Number(countResult.recordset?.[0]?.Total || 0);
    return Response.json({ data: rowsResult.recordset || [], total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error: unknown) {
    console.error("[rapor-takip mail-log]", error);
    return Response.json({ error: error instanceof Error ? error.message : "Mail logları yüklenemedi." }, { status: 500 });
  }
}
