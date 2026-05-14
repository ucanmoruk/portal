import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import RaporTakipTable from "./RaporTakipTable";
import styles from "@/app/styles/table.module.css";

export const metadata = {
  title: "Rapor Takip — ÜGD Portal",
};

export default async function RaporTakipPage() {
  const session = await getServerSession(authOptions);
  
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Rapor Takip</h1>
          <p className={styles.pageSubtitle}>Rapor formatı sekmeleriyle ilgili laboratuvar kayıtlarını listeleyin.</p>
        </div>
      </div>

      <RaporTakipTable />
    </div>
  );
}
