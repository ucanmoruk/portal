import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import TeklifTable from "../../musteriler/teklif-listesi/TeklifTable";
import styles from "@/app/styles/table.module.css";

export const metadata = { title: "Teklif Listesi" };

export default async function UgdTeklifListesiPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Teklif Listesi</h1>
        <p className={styles.pageSubtitle}>Aktif müşteri teklifleri.</p>
      </div>
      <TeklifTable userName={session.user?.name ?? ""} />
    </div>
  );
}
