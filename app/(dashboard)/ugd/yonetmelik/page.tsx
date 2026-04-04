import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import YonetmelikTable from "./YonetmelikTable";
import styles from '@/app/styles/table.module.css';
export const metadata = { title: "Yönetmelik" };

export default async function YonetmelikPage() {
  const session = await getServerSession(authOptions);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Yönetmelik</h1>
          <p className={styles.pageSubtitle}>Bileşen ve kullanım sınırlandırmaları listesi.</p>
        </div>
      </div>

      <YonetmelikTable />
    </div>
  );
}
