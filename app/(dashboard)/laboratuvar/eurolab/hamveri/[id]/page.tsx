import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import styles from "@/app/styles/table.module.css";
import RawdataPrintView from "./RawdataPrintView";

export const metadata = { title: "Eurolab - Hamveri Görüntüle" };

export default async function EurolabRawdataDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await getServerSession(authOptions);
  const { id } = await params;

  return (
    <div className={styles.page} style={{ maxWidth: "none", width: "100%" }}>
      <div className={`${styles.pageHeader} print:hidden`}>
        <div>
          <h1 className={styles.pageTitle}>Hamveri Görüntüle</h1>
          <p className={styles.pageSubtitle}>Kayıtlı hamveri formunu görüntüleyin ve çıktı alın.</p>
        </div>
      </div>

      <RawdataPrintView id={id} />
    </div>
  );
}
