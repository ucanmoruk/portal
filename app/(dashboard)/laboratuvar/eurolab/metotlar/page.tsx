import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import styles from '@/app/styles/table.module.css';
import MetotTable from "./MetotTable";

export const metadata = { title: "Eurolab - Metotlar" };

export default async function EurolabMetotlarPage() {
  await getServerSession(authOptions);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Metotlar</h1>
          <p className={styles.pageSubtitle}>Eurolab analiz metotları ve validasyon yönetimi.</p>
        </div>
      </div>

      <MetotTable />
    </div>
  );
}
