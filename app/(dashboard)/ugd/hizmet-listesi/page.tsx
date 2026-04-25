import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import HizmetTable from "../../laboratuvar/hizmet-listesi/HizmetTable";
import styles from "@/app/styles/table.module.css";

export const metadata = { title: "Hizmet Listesi" };

export default async function UgdHizmetListesiPage() {
  await getServerSession(authOptions);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Hizmet Listesi</h1>
          <p className={styles.pageSubtitle}>
            Laboratuvar analiz hizmetleri - akreditasyonlu testler yıldız (*) ile işaretlidir.
          </p>
        </div>
      </div>
      <HizmetTable />
    </div>
  );
}
