import { getPortalUser } from "@/lib/portalYetki";
import { getPermissionPool } from "@/lib/permissionStore";
export async function workspaceAccess(module: string) {
  const user = await getPortalUser();
  if (!user) return null;
  if (user.isAdmin) return { user, view: true, edit: true, approve: true };
  const permissionModule = module === "yazilim-raporlari" ? "yazilim-dogrulama" : module === "kalibrasyon-belirsizlikleri" ? "cihaz-listesi" : module;
  const key = `laboratuvar.kys.${permissionModule}`;
  const pool = await getPermissionPool();
  const result = await pool.request().input("UserID", Number(user.userId)).query("SELECT MenuKey,Yetki FROM PortalYetki WHERE KullaniciID=@UserID");
  const permissions = new Map<string, string>(result.recordset.map((r: { MenuKey: string; Yetki: string }) => [r.MenuKey, r.Yetki]));
  const level = permissions.get(key);
  return { user, view: level !== undefined, edit: level === "edit", approve: permissions.has(`${key}.onayla`) && permissions.get(`${key}.onayla`) !== "view" };
}
