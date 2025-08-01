import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Link from "next/link";
import styles from "@/app/styles/table.module.css";
import RaporMailLogTable from "./RaporMailLogTable";

export const metadata = { title: "Rapor Mail Logları — ÜGD Portal" };

export default async function RaporMailLogPage() {
  await getServerSession(authOptions);
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Rapor Mail Logları</h1>
          <p className={styles.pageSubtitle}>E-posta ile gönderilen raporların başarılı ve başarısız gönderim kayıtları.</p>
        </div>
        <Link href="/laboratuvar/rapor-takip" className={styles.addBtn}>Rapor Takip&apos;e dön</Link>
      </div>
      <RaporMailLogTable />
    </div>
  );
}
