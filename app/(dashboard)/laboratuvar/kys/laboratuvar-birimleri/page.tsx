import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import styles from "@/app/styles/table.module.css";
import LaboratuvarBirimleriClient from "./LaboratuvarBirimleriClient";

export const metadata = { title: "KYS - Laboratuvar Birimleri" };

export default async function LaboratuvarBirimleriPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Laboratuvar Birimleri</h1>
          <p className={styles.pageSubtitle}>Analiz ve stok hareketlerinin bağlı olduğu laboratuvar/depo birimleri.</p>
        </div>
      </div>
      <LaboratuvarBirimleriClient />
    </div>
  );
}
