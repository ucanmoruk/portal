import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

export type AccessLevel = "edit" | "view";

// Selin (1) ve Oğuzhan (2) → admin, her zaman edit
const ADMIN_USER_IDS = new Set(["1", "2"]);

export interface EurolabAccessSnapshot {
  isAdmin: boolean;
  // Yalnız eurolab.* key'leri. Anahtar yoksa varsayım 'edit' (admin) ya da menüde yetki yok demektir.
  levels: Record<string, AccessLevel>;
}

/**
 * Server-side: aktif oturumdaki kullanıcı için Eurolab menü yetki seviyelerini döner.
 * - Admin ise tüm key'ler için 'edit' kabul edilir.
 * - Aksi halde PortalYetki tablosundan eurolab.* satırlarının Yetki kolonu okunur.
 */
export async function loadEurolabAccess(): Promise<EurolabAccessSnapshot> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.userId as string | undefined;
  const isAdmin = userId ? ADMIN_USER_IDS.has(userId) : false;

  if (isAdmin) return { isAdmin: true, levels: {} };

  if (!userId) return { isAdmin: false, levels: {} };

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("userId", parseInt(userId))
      .query(`SELECT MenuKey, Yetki FROM PortalYetki WHERE KullaniciID = @userId AND MenuKey LIKE 'eurolab%'`);

    const levels: Record<string, AccessLevel> = {};
    for (const row of result.recordset as Array<{ MenuKey: string; Yetki?: string | null }>) {
      levels[row.MenuKey] = row.Yetki === "view" ? "view" : "edit";
    }
    return { isAdmin: false, levels };
  } catch {
    // DB hatası → güvenli taraf: tüm Eurolab view-only
    return { isAdmin: false, levels: {} };
  }
}

export function canEdit(snapshot: EurolabAccessSnapshot, menuKey: string): boolean {
  if (snapshot.isAdmin) return true;
  // Belirtilen key kayıtlıysa onun seviyesini uygula
  if (menuKey in snapshot.levels) return snapshot.levels[menuKey] === "edit";
  // Üst eurolab kategorisi belirlenmişse onu uygula (örn. eurolab → eurolab.validasyon)
  if ("eurolab" in snapshot.levels) return snapshot.levels.eurolab === "edit";
  // Hiçbir kayıt yoksa: güvenli taraf — view-only
  return false;
}
