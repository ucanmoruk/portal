import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import styles from "@/app/styles/table.module.css";

export const metadata = { title: "Root Kozmetik" };

export default async function RootKozmetikPage() {
  await getServerSession(authOptions);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Root Kozmetik</h1>
          <p className={styles.pageSubtitle}>Root Kozmetik modülü — içerik eklenecek.</p>
        </div>
      </div>
    </div>
  );
}
