import Link from "next/link";
import { redirect } from "next/navigation";
import { paymentReminderApprover } from "@/lib/paymentReminderAuth";
import AutomationMonitor from "./AutomationMonitor";
import styles from "./otomasyonlar.module.css";

export const metadata = { title: "Otomasyonlar | Ayarlar" };

export default async function AutomationsPage() {
  if (!await paymentReminderApprover()) redirect("/login");
  return <div className={styles.page}>
    <Link href="/admin/ayarlar" className={styles.back}>Ayarlar</Link>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>Ayarlar / Otomasyonlar</p><h1>Otomasyonlar</h1><p>Günlük ödeme raporlarını ve onayladığınız hatırlatmaların gönderimlerini takip edin.</p></div>
      <Link href="/musteriler/fatura-takip/hatirlatmalar" className={styles.primaryLink}>Hatırlatmaları incele ve onayla</Link>
    </header>
    <AutomationMonitor />
  </div>;
}
