import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import styles from "@/app/styles/table.module.css";

export const metadata = { title: "KYS" };

export default async function KysPage() {
  await getServerSession(authOptions);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>KYS</h1>
          <p className={styles.pageSubtitle}>Kalite yönetim sistemi modülü — içerik eklenecek.</p>
        </div>
      </div>
    </div>
  );
}
