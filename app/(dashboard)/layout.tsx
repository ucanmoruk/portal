import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import styles from "./dashboard-layout.module.css";
import poolPromise from "@/lib/db";

// Admin yetkisi olan kullanıcı ID'leri (Oğuzhan Eker: 2, Selin Eker: 1)
const ADMIN_USER_IDS = new Set(["1", "2"]);

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const userId  = (session.user as any)?.userId as string | undefined;
  const isAdmin = userId ? ADMIN_USER_IDS.has(userId) : false;

  // Admin → null (kısıtlama yok), diğerleri DB'den çek
  // null  = her şeyi gör (admin)
  // []    = hiçbir şeyi görme (DB hata veya PortalYetki'de satır yok)
  // [...] = sadece listedekiler
  let allowedKeys: string[] | null = isAdmin ? null : [];
  if (!isAdmin) {
    try {
      const pool   = await poolPromise;
      const result = await pool.request()
        .input("userId", userId ? parseInt(userId) : 0)
        .query("SELECT MenuKey FROM PortalYetki WHERE KullaniciID = @userId");
      allowedKeys = result.recordset.map((r: any) => r.MenuKey as string);
    } catch {
      // DB hatası → hiçbir menü gösterme (fail-closed)
      allowedKeys = [];
    }
  }

  return (
    <div className={styles.shell}>
      <Sidebar allowedKeys={allowedKeys} isAdmin={isAdmin} />
      <div className={styles.main}>
        <Header />
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
