import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import styles from "@/app/styles/table.module.css";
import DokumanListesiClient from "./DokumanListesiClient";

export const metadata = { title: "KYS - Doküman Yönetimi" };

export default async function DokumanYonetimiPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className={styles.page} style={{ maxWidth: "none" }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Doküman Yönetimi</h1>
          <p className={styles.pageSubtitle}>
            KYS dokümanlarını oluşturun, revize edin, kontrol ve yayın onayından geçirin.
          </p>
        </div>
      </div>
      <DokumanListesiClient />
    </div>
  );
}
