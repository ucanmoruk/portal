import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portalYetki";
import styles from "@/app/styles/table.module.css";
import CrmAgentClient from "./CrmAgentClient";

export const metadata = { title: "CRM Agent" };
export default async function Page() {
  const user = await getPortalUser();
  if (!user) redirect("/login");
  if (!user.isAdmin && !user.can("musteriler.musteri-listesi") && !user.can("musteriler.notlar")) redirect("/");
  return <div className={styles.page} style={{ maxWidth: 1200 }}><div className={styles.pageHeader}><div><h1 className={styles.pageTitle}>CRM Agent</h1><p className={styles.pageSubtitle}>Müşteri notları, teklifler, proformalar ve faturalar üzerinden firma özelinde veya genel CRM soruları sorun.</p></div></div><CrmAgentClient /></div>;
}
