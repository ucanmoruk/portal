import { redirect } from "next/navigation";
import Link from "next/link";
import { paymentReminderApprover } from "@/lib/paymentReminderAuth";
import PaymentReminderClient from "./PaymentReminderClient";
import styles from "@/app/styles/table.module.css";

export const metadata = { title: "Ödeme Hatırlatma Onayı" };

export default async function PaymentRemindersPage() {
  if (!await paymentReminderApprover()) redirect("/musteriler/fatura-takip");
  return <div className={styles.page} style={{ maxWidth: "none" }}>
    <Link href="/musteriler/fatura-takip">Fatura takibine dön</Link>
    <h1 className={styles.pageTitle}>Ödeme hatırlatma onayı</h1>
    <p>Günlük rapor: oguzhan@uniqueanalyse.com ve muhasebe@uniqueanalyse.com. Planlanan saat: 09.00 (Türkiye).</p>
    <p>Bugün vadesi gelen veya geçmiş, açık bakiyesi bulunan Unique faturaları. Yalnızca seçip onayladığınız faturalar için müşteriye e-posta gönderilir.</p>
    <PaymentReminderClient />
  </div>;
}
