import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import styles from "@/app/styles/table.module.css";
import HamveriTable from "./HamveriTable";

export const metadata = { title: "Eurolab - Hamveri" };

export default async function EurolabHamveriPage() {
  await getServerSession(authOptions);

  return (
    <div className={styles.page} style={{ maxWidth: "none", width: "100%" }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Hamveri</h1>
          <p className={styles.pageSubtitle}>EN 71-1 oyuncak fiziksel analizleri için hamveri kayıtları ve test karar akışı.</p>
        </div>
      </div>

      <HamveriTable />
    </div>
  );
}
