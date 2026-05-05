import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import styles from "@/app/styles/table.module.css";
import En71RawDataFlow from "./En71RawDataFlow";

export const metadata = { title: "Eurolab - Yeni Hamveri" };

export default async function NewEurolabRawdataPage() {
  await getServerSession(authOptions);

  return (
    <div className={styles.page} style={{ maxWidth: "none", width: "100%" }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Yeni Hamveri</h1>
          <p className={styles.pageSubtitle}>EN 71-1:2026 oyuncak mekanik ve fiziksel analizleri için test seçim akışı.</p>
        </div>
      </div>

      <En71RawDataFlow />
    </div>
  );
}
