import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import UrunTable from "./UrunTable";
import styles from '@/app/styles/table.module.css';
export const metadata = { title: "Ürün Listesi" };

export default async function UrunListesiPage() {
  const session = await getServerSession(authOptions);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Ürün Listesi</h1>
          <p className={styles.pageSubtitle}>Sistemde kayıtlı aktif ÜGD ürünlerinin listesi.</p>
        </div>
      </div>

      <UrunTable />
    </div>
  );
}
