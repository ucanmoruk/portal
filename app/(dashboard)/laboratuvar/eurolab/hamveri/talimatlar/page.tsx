import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import styles from "@/app/styles/table.module.css";
import RawdataInstructionManager from "./RawdataInstructionManager";

export const metadata = { title: "Eurolab - Hamveri Analiz Talimatları" };

export default async function EurolabRawdataInstructionsPage() {
  await getServerSession(authOptions);

  return (
    <div className={styles.page} style={{ maxWidth: "none", width: "100%" }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Hamveri Analiz Talimatları</h1>
          <p className={styles.pageSubtitle}>Hamveri test listesinde madde ve yöntemlere tıklanınca açılacak PDF talimatlarını eşleştirin.</p>
        </div>
      </div>

      <RawdataInstructionManager />
    </div>
  );
}
