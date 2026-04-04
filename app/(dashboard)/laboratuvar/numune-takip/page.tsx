import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import NumuneKabulTable from "./NumuneKabulTable";
import styles from "@/app/styles/table.module.css";

export const metadata = { title: "Numune Kabul" };

export default async function NumuneKabulPage() {
  await getServerSession(authOptions);

  return (
    <div className={styles.page} style={{ maxWidth: "none" }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Numune Kabul</h1>
          <p className={styles.pageSubtitle}>
            Laboratuvara kabul edilen numunelerin takibi ve yönetimi.
          </p>
        </div>
      </div>
      <NumuneKabulTable />
    </div>
  );
}
