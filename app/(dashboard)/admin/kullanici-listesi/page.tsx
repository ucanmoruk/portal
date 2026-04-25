import styles from "@/app/styles/table.module.css";
import KullaniciTable from "./KullaniciTable";

export const metadata = { title: "Kullanıcı Listesi" };

export default function KullaniciListesiPage() {
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Kullanıcı Listesi</h1>
          <p className={styles.pageSubtitle}>Portal kullanıcılarını ve çalıştıkları birimi yönetin.</p>
        </div>
      </div>
      <KullaniciTable />
    </div>
  );
}
