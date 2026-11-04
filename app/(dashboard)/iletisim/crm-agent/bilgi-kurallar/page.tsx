import Link from "next/link";
import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portalYetki";
import CrmKnowledgeEditor from "./CrmKnowledgeEditor";
import styles from "@/app/styles/table.module.css";

export const metadata = { title: "CRM Agent Bilgi ve Kurallar" };
export default async function Page() {
  const user = await getPortalUser();
  if (!user) redirect("/login");
  if (!user.isAdmin) redirect("/iletisim/crm-agent");
  return <div className={styles.page} style={{ maxWidth: 1000 }}>
    <Link href="/iletisim/crm-agent">← CRM Agent’a dön</Link>
    <h1 className={styles.pageTitle} style={{ marginTop: 16 }}>Bilgi ve Kurallar</h1>
    <p>CRM Agent’ın müşteri taleplerini nasıl yorumlayacağını buradan düzeltin. Kaydedilen bilgiler tüm kullanıcıların sonraki analizlerinde geçerli olur. Mevcut teklif taslakları değişmez.</p>
    <CrmKnowledgeEditor />
  </div>;
}
