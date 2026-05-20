import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import styles from "@/app/styles/table.module.css";
import RequirementVisualManager from "./RequirementVisualManager";

export const metadata = { title: "Eurolab - Gereklilik Kontrol Görselleri" };

export default async function EurolabRequirementVisualsPage() {
  await getServerSession(authOptions);

  return (
    <div className={styles.page} style={{ maxWidth: "none", width: "100%" }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Gereklilik Kontrol Görselleri</h1>
          <p className={styles.pageSubtitle}>EN 71-1 Madde 4 karar akış PDFlerini yükleyin ve ilgili maddelerle eşleştirin.</p>
        </div>
      </div>

      <RequirementVisualManager />
    </div>
  );
}
