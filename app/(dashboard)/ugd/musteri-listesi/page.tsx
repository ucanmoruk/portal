import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import MusteriTable from "../../musteriler/musteri-listesi/MusteriTable";
import styles from "@/app/styles/table.module.css";

export const metadata = { title: "Müşteri Listesi" };

export default async function UgdMusteriListesiPage() {
  await getServerSession(authOptions);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Müşteri Listesi</h1>
          <p className={styles.pageSubtitle}>Aktif müşteri ve tedarikçi kayıtları.</p>
        </div>
      </div>

      <MusteriTable filterKimin="Ozeco" />
    </div>
  );
}
