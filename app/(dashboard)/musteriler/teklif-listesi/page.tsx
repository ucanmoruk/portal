import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import styles from "@/app/styles/table.module.css";
import TeklifTable from "./TeklifTable";

export const metadata = { title: "Teklif Listesi" };

export default async function TeklifListesiPage() {
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
