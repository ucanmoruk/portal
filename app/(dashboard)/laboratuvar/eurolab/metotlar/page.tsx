import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import styles from '@/app/styles/table.module.css';
import MetotTable from "./MetotTable";
import { ReadOnlyBanner } from "@/components/eurolab/ReadOnlyBanner";

export const metadata = { title: "Eurolab - Metotlar" };

export default async function EurolabMetotlarPage() {
  await getServerSession(authOptions);

  return (
    <div className={styles.page}>
      <ReadOnlyBanner menuKey="eurolab.metotlar" />
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
