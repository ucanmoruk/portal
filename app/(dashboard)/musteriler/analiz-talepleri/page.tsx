import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import styles from "@/app/styles/table.module.css";
import TalepTable from "../_components/TalepTable";

export const metadata = { title: "Analiz Talepleri" };

export default async function AnalizTalepleriPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Analiz Talepleri</h1>
        <p className={styles.pageSubtitle}>Müşteri portalı üzerinden iletilen analiz talepleri.</p>
      </div>
      <TalepTable tur="Analiz" />
    </div>
  );
}
