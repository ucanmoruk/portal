import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import MusteriTable from "./MusteriTable";
import styles from '@/app/styles/table.module.css';
export const metadata = { title: "Müşteri Listesi" };

export default async function MusteriListesiPage() {
  const session = await getServerSession(authOptions);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Müşteri Listesi</h1>
          <p className={styles.pageSubtitle}>Aktif müşteri ve tedarikçi kayıtları.</p>
        </div>
      </div>

      <MusteriTable />
    </div>
  );
}
