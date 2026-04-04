import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import styles from "@/app/styles/table.module.css";

export const metadata = { title: "Spektrotek" };

export default async function SpektrotekPage() {
  await getServerSession(authOptions);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Spektrotek</h1>
          <p className={styles.pageSubtitle}>Spektrotek modülü — içerik eklenecek.</p>
        </div>
      </div>
    </div>
  );
}
