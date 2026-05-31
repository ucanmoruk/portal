import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { type NextRequest } from "next/server";
import { allMenuKeys } from "@/lib/menuConfig";

export type AccessLevel = "edit" | "view";

// Sadece şu key'ler altında view/edit seçimi anlamlıdır; diğerlerinde her zaman 'edit'.
// (Denetim sırasında Eurolab üzerinde personelin sadece görüntüleme yapması istendi.)
const LEVELLED_PREFIX = "eurolab";

const normalizeLevel = (raw: unknown): AccessLevel =>
  raw === "view" ? "view" : "edit";

// GET /api/admin/yetki?userId=X
//   → { keys: string[], levels: Record<string, 'edit'|'view'> }
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) return Response.json({ error: "userId gerekli" }, { status: 400 });

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("userId", parseInt(userId))
      .query(`SELECT MenuKey, Yetki FROM PortalYetki WHERE KullaniciID = @userId`);

    const keys: string[] = [];
    const levels: Record<string, AccessLevel> = {};
    for (const row of result.recordset as Array<{ MenuKey: string; Yetki?: string | null }>) {
      const key = row.MenuKey;
      keys.push(key);
      // Sadece Eurolab altında anlamlı; diğerlerinde gönderme.
      if (key.startsWith(LEVELLED_PREFIX)) {
        levels[key] = normalizeLevel(row.Yetki);
      }
    }
    return Response.json({ keys, levels });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/admin/yetki — { userId, keys: string[], levels?: Record<string, 'edit'|'view'> }
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  try {
    const body = await request.json();
    const { userId, keys, levels } = body as {
      userId: number;
      keys: string[];
      levels?: Record<string, AccessLevel>;
    };

    if (!userId) return Response.json({ error: "userId gerekli" }, { status: 400 });

    const valid = new Set(allMenuKeys());
    const safeKeys = (keys || []).filter(k => valid.has(k));
    const safeLevels = levels || {};

    const pool = await poolPromise;
    const tx = pool.transaction();
    await tx.begin();

    try {
      await tx.request()
        .input("userId", userId)
        .query(`DELETE FROM PortalYetki WHERE KullaniciID = @userId`);

      for (const key of safeKeys) {
        const level: AccessLevel = key.startsWith(LEVELLED_PREFIX)
          ? normalizeLevel(safeLevels[key])
          : "edit";
        await tx.request()
          .input("userId", userId)
          .input("menuKey", key)
          .input("yetki", level)
          .query(`INSERT INTO PortalYetki (KullaniciID, MenuKey, Yetki) VALUES (@userId, @menuKey, @yetki)`);
      }

      await tx.commit();
      return Response.json({ message: "Yetkiler kaydedildi", count: safeKeys.length });
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
