import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

// GET /api/me/yetki
// Mevcut kullanıcının yetki anahtarlarını döner.
// Admin (Oğuzhan:2) ise isAdmin=true → tüm yetkilere sahip kabul edilir.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const userId = (session.user as { userId?: number | string } | undefined)?.userId;
  const userIdNum = typeof userId === "string" ? parseInt(userId, 10) : (userId as number | undefined);
  const isAdmin = userIdNum === 2;

  if (!userIdNum) {
    return Response.json({ keys: [], isAdmin: false });
  }
  if (isAdmin) {
    return Response.json({ keys: [], isAdmin: true });
  }

  try {
    const pool = await poolPromise;
    const r = await pool.request()
      .input("userId", userIdNum)
      .query(`SELECT MenuKey FROM PortalYetki WHERE KullaniciID = @userId`);
    const keys = r.recordset.map((row: { MenuKey: string }) => row.MenuKey);
    return Response.json({ keys, isAdmin: false });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Hata";
    return Response.json({ error: msg, keys: [], isAdmin: false }, { status: 500 });
  }
}
