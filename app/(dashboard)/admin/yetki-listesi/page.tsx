import styles from "@/app/styles/table.module.css";
import YetkiTable from "./YetkiTable";

export const metadata = { title: "Yetki Listesi" };

export default function YetkiListesiPage() {
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Yetki Listesi</h1>
          <p className={styles.pageSubtitle}>
            Aktif personelin portal menü erişim yetkilerini buradan yönetin.
          </p>
        </div>
      </div>
      <YetkiTable />
    </div>
  );
}
