import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import OnayliRaporTable from "./OnayliRaporTable";
import styles from "@/app/styles/table.module.css";
import Link from "next/link";

export const metadata = {
  title: "Rapor Takip — ÜGD Portal",
};

export default async function RaporTakipPage() {
  await getServerSession(authOptions);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Rapor Takip</h1>
          <p className={styles.pageSubtitle}>Onaylanmış raporlar — imzalı PDF indirme ve portala gönderim.</p>
        </div>
        <Link href="/laboratuvar/rapor-takip/mail-log" className={styles.addBtn}>Mail Gönderim Logları</Link>
      </div>

      <OnayliRaporTable />
    </div>
  );
}
