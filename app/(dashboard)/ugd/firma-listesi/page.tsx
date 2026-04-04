import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import MusteriTable from "./MusteriTable";
import styles from '@/app/styles/table.module.css';
export const metadata = { title: "Firma Listesi" };

export default async function FirmaListesiPage() {
  const session = await getServerSession(authOptions);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Firma Listesi</h1>
          <p className={styles.pageSubtitle}>Aktif müşteri ve tedarikçi kayıtları.</p>
        </div>
      </div>

      <MusteriTable />
    </div>
  );
}
