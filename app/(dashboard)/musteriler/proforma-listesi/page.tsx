import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import styles from "@/app/styles/table.module.css";
import ProformaTable from "./ProformaTable";

export const metadata = { title: "Proforma Listesi" };

export default async function ProformaListesiPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className={styles.page} style={{ maxWidth: "none" }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Proforma Listesi</h1>
          <p className={styles.pageSubtitle}>Proforma kayıtları, durum takibi ve yazdırma işlemleri.</p>
        </div>
      </div>
      <ProformaTable />
    </div>
  );
}
