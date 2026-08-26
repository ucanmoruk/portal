import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import styles from "@/app/styles/table.module.css";
import DisKaynakliDokumanClient from "./DisKaynakliDokumanClient";

export const metadata = { title: "KYS - Dış Kaynaklı Doküman" };

export default async function DisKaynakliDokumanPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className={styles.page} style={{ maxWidth: "none" }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Dış Kaynaklı Doküman</h1>
          <p className={styles.pageSubtitle}>
            Standart, rehber ve kurum yayınlarını PDF dosyası, kaynak linki ve güncellik kontrol kaydıyla takip edin.
          </p>
        </div>
      </div>
      <DisKaynakliDokumanClient />
    </div>
  );
}
