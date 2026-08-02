import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import styles from "@/app/styles/table.module.css";
import VeriAsistaniClient from "./VeriAsistaniClient";

export const metadata = { title: "Veri Asistani" };

const ADMIN_USER_IDS = new Set(["2"]);
type SessionUser = { userId?: string | number | null };

export default async function VeriAsistaniPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const userId = String((session.user as SessionUser)?.userId || "");
  if (!ADMIN_USER_IDS.has(userId)) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Veri Asistani</h1>
            <p className={styles.pageSubtitle}>Bu alan sadece admin kullaniciya acik.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page} style={{ maxWidth: "none" }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Veri Asistani</h1>
          <p className={styles.pageSubtitle}>
            MySQL veritabani uzerinden salt okunur sorular sorun. Sistem sadece izinli tablolarda SELECT calistirir.
          </p>
        </div>
      </div>
      <VeriAsistaniClient />
    </div>
  );
}
