import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const prefix = request.nextUrl.searchParams.get("prefix")?.trim() || "";
  if (!prefix) return Response.json({ error: "Prefix gerekli." }, { status: 400 });

  try {
    const pool = await cosmoPool;
    const result = await pool.request()
      .input("prefix", prefix)
      .query(`
        SELECT Kod
        FROM StokAnalizListesi
        WHERE ISNULL(Kod, '') COLLATE Turkish_CI_AS LIKE @prefix + N'%'
      `);

    let max = 0;
    let width = 0;
    const suffixRe = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`);
    for (const row of result.recordset as Array<{ Kod?: string | null }>) {
      const kod = String(row.Kod || "").trim();
      const match = kod.match(suffixRe);
      if (!match) continue;
      const suffix = match[1] || "";
      const n = Number(suffix);
      if (!Number.isFinite(n)) continue;
      if (n > max) {
        max = n;
        width = suffix.length;
      }
    }

    const next = max + 1;
    const suffix = width > 1 ? String(next).padStart(width, "0") : String(next);
    return Response.json({ kod: `${prefix}${suffix}`, next, max });
  } catch (e: any) {
    return Response.json({ error: e.message || "Kod önerisi alınamadı." }, { status: 500 });
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
