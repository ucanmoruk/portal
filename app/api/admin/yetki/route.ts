import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { type NextRequest } from "next/server";
import { allMenuKeys } from "@/lib/menuConfig";

// GET /api/admin/yetki?userId=X — kullanıcının yetkili menü key'leri
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) return Response.json({ error: "userId gerekli" }, { status: 400 });

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("userId", parseInt(userId))
      .query(`SELECT MenuKey FROM PortalYetki WHERE KullaniciID = @userId`);

    const keys = result.recordset.map((r: any) => r.MenuKey as string);
    return Response.json({ keys });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/admin/yetki — { userId, keys: string[] } kaydeder (replace all)
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  try {
    const body = await request.json();
    const { userId, keys } = body as { userId: number; keys: string[] };

    if (!userId) return Response.json({ error: "userId gerekli" }, { status: 400 });

    // Gelen key'lerin geçerli olduğunu doğrula
    const valid = new Set(allMenuKeys());
    const safeKeys = (keys || []).filter(k => valid.has(k));

    const pool = await poolPromise;
    const tx = pool.transaction();
    await tx.begin();

    try {
      // Önce bu kullanıcının tüm yetkilerini sil
      await tx.request()
        .input("userId", userId)
        .query(`DELETE FROM PortalYetki WHERE KullaniciID = @userId`);

      // Yeni yetkileri tek tek ekle
      for (const key of safeKeys) {
        await tx.request()
          .input("userId", userId)
          .input("menuKey", key)
          .query(`INSERT INTO PortalYetki (KullaniciID, MenuKey) VALUES (@userId, @menuKey)`);
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
