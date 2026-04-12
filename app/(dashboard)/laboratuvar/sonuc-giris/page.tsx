import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import styles from "@/app/styles/table.module.css";
import SonucGirisTable from "./SonucGirisTable";

export const metadata = { title: "Sonuç Girişi" };

export default async function SonucGirisPage() {
  await getServerSession(authOptions);
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Sonuç Girişi</h1>
          <p className={styles.pageSubtitle}>
            Analiz sonuçlarını girin, raporları tamamlayın ve yazdırın.
          </p>
        </div>
      </div>
      <SonucGirisTable />
    </div>
  );
}
