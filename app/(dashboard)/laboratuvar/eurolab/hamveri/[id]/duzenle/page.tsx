import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import styles from "@/app/styles/table.module.css";
import En71RawDataFlow from "../../yeni/En71RawDataFlow";

export const metadata = { title: "Eurolab - Hamveri Düzenle" };

export default async function EditEurolabRawdataPage({ params }: { params: Promise<{ id: string }> }) {
  await getServerSession(authOptions);
  const { id } = await params;

  return (
    <div className={styles.page} style={{ maxWidth: "none", width: "100%" }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Hamveri Düzenle</h1>
          <p className={styles.pageSubtitle}>Kayıtlı EN 71-1 hamveri akışını güncelleyin.</p>
        </div>
      </div>

      <En71RawDataFlow rawdataId={id} />
    </div>
  );
}
