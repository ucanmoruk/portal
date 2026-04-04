import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import CosingTable from "./CosingTable";
import styles from '@/app/styles/table.module.css';
export const metadata = { title: "CosIng" };

export default async function CosingPage() {
  const session = await getServerSession(authOptions);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>CosIng Listesi</h1>
          <p className={styles.pageSubtitle}>Cosmetic Ingredient Database (AB Kozmetik İçerik Veri Tabanı).</p>
        </div>
      </div>

      <CosingTable />
    </div>
  );
}
