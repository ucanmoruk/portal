import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import styles from "@/app/styles/table.module.css";

export const metadata = { title: "Eurolab" };

export default async function EurolabPage() {
  await getServerSession(authOptions);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Eurolab</h1>
          <p className={styles.pageSubtitle}>Eurolab modülü — içerik eklenecek.</p>
        </div>
      </div>
    </div>
  );
}
