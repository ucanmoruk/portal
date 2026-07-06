import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import styles from "@/app/styles/table.module.css";
import AnalizNumuneTable from "./AnalizNumuneTable";

export const metadata = { title: "Analiz - Numune Listesi" };

export default async function AnalizNumuneListesiPage() {
  await getServerSession(authOptions);

  return (
    <div className={styles.page} style={{ width: "100%", maxWidth: 1300 }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Analiz - Numune Listesi</h1>
          <p className={styles.pageSubtitle}>
            Numunelere atanmış analiz hizmetlerini hizmet ve rapor bilgileriyle izleyin.
          </p>
        </div>
      </div>
      <AnalizNumuneTable />
    </div>
  );
}
