// Sunucu tarafı yetki kontrolü — PortalYetki tablosundaki MenuKey listesini okur.
// İstemci tarafındaki /api/me/yetki ile aynı kaynağı kullanır; fark, buradaki
// kontrolün API route'larında zorlayıcı (enforcing) olmasıdır.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

// Admin yetkisi olan kullanıcı ID'leri (Oğuzhan Eker: 2) — (dashboard)/layout.tsx ile aynı
const ADMIN_USER_IDS = new Set(["2"]);

export type PortalUser = {
  userId: string;
  userName: string;
  isAdmin: boolean;
  keys: string[];
  can: (key: string) => boolean;
};

/** Oturum yoksa null döner. Oturum varsa kullanıcının yetki anahtarlarıyla birlikte döner. */
export async function getPortalUser(): Promise<PortalUser | null> {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const userId = String(session.user?.userId ?? "");
  const userName = String(session.user?.name ?? "").trim() || "Bilinmeyen kullanıcı";
  const isAdmin = ADMIN_USER_IDS.has(userId);

  let keys: string[] = [];
  if (!isAdmin && userId) {
    try {
      const pool = await poolPromise;
      const res = await pool.request()
        .input("userId", parseInt(userId, 10) || 0)
        .query("SELECT MenuKey FROM PortalYetki WHERE KullaniciID = @userId");
      keys = res.recordset.map((r: { MenuKey: string }) => r.MenuKey);
    } catch {
      // DB hatası → yetki yok kabul et (fail-closed)
      keys = [];
    }
  }

  return {
    userId,
    userName,
    isAdmin,
    keys,
    can: (key: string) => isAdmin || keys.includes(key),
  };
}
