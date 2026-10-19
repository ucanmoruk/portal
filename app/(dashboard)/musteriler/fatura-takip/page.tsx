import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import styles from "@/app/styles/table.module.css";
import FaturaTable from "./FaturaTable";
import Link from "next/link";
import { paymentReminderApprover } from "@/lib/paymentReminderAuth";

export const metadata = { title: "Fatura Takip" };

export default async function FaturaTakipPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className={styles.page} style={{ maxWidth: "none" }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Fatura Takip</h1>
          <p className={styles.pageSubtitle}>Proformadan üretilen faturalar ve ödeme durumu takibi.</p>
        </div>
      </div>
      {await paymentReminderApprover() && <Link href="/musteriler/fatura-takip/hatirlatmalar">Ödeme hatırlatmalarını incele ve onayla</Link>}
      <FaturaTable />
    </div>
  );
}
