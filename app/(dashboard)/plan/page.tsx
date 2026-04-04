import styles from "@/app/styles/table.module.css";
import ProjeNotlariEditor from "./ProjeNotlariEditor";

export const metadata = { title: "Geliştirme Planı" };

export default function PlanPage() {
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Geliştirme planı</h1>
          <p className={styles.pageSubtitle}>
            Buraya yazdıklarınız projede kalır; bir sonraki oturumda aynı sayfadan veya{" "}
            <code style={{ fontSize: "0.85em" }}>data/proje-notlari.md</code> dosyasından devam edebilirsiniz.
          </p>
        </div>
      </div>

      <div className={styles.tableCard} style={{ padding: "28px 32px 36px" }}>
        <ProjeNotlariEditor />
      </div>
    </div>
  );
}
