import styles from "@/app/styles/table.module.css";
export const metadata = { title: "Proforma Listesi" };

export default function ProformaListesiPage() {
  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Proforma Listesi</h1>
        <p className={styles.pageSubtitle}>Proforma faturaları burada görüntülenecek.</p>
      </div>
    </div>
  );
}
