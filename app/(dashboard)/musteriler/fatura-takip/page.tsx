import styles from "@/app/styles/table.module.css";
export const metadata = { title: "Fatura Takip" };

export default function FaturaTakipPage() {
  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Fatura Takip</h1>
        <p className={styles.pageSubtitle}>Fatura takibi burada yapılacak.</p>
      </div>
    </div>
  );
}
