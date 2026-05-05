import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import styles from "@/app/styles/table.module.css";
import InventoryTable from "./InventoryTable";

export const metadata = { title: "Eurolab - Envanter" };

export default async function EurolabInventoryPage() {
  await getServerSession(authOptions);

  return (
    <div className={styles.page} style={{ maxWidth: "none", width: "100%" }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Envanter</h1>
          <p className={styles.pageSubtitle}>Eurolab cihaz, standart ve numune hazırlama envanteri.</p>
        </div>
      </div>

      <InventoryTable />
    </div>
  );
}
