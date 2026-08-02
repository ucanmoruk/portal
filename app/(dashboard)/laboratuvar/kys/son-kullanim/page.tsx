import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import styles from "@/app/styles/table.module.css";
import SonKullanimClient from "./SonKullanimClient";

export const metadata = { title: "KYS - Son Kullanım Listesi" };

export default async function SonKullanimPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className={styles.page} style={{ maxWidth: "none" }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Son Kullanım Listesi</h1>
          <p className={styles.pageSubtitle}>SKT bilgisi olan stok girişleri ve yaklaşan kullanım süresi kontrolleri.</p>
        </div>
      </div>
      <SonKullanimClient />
    </div>
  );
}
