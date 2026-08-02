import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import styles from "@/app/styles/table.module.css";
import TalepDetayClient from "./TalepDetayClient";

export const metadata = { title: "KYS - Talep Detayı" };

export default async function TalepDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const { id } = await params;

  return (
    <div className={styles.page} style={{ maxWidth: "none" }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Talep Detayı</h1>
          <p className={styles.pageSubtitle}>Talep kalemleri, onay/işleme alma ve kabul değerlendirmesi.</p>
        </div>
      </div>
      <TalepDetayClient id={Number(id)} />
    </div>
  );
}
