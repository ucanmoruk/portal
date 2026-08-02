import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import styles from "@/app/styles/table.module.css";
import StokHareketleriClient from "./StokHareketleriClient";

export const metadata = { title: "KYS - Stok Ekle / Düş" };

export default async function StokHareketleriPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className={styles.page} style={{ maxWidth: "none" }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Stok Ekle / Düş</h1>
          <p className={styles.pageSubtitle}>Depo girişi, laboratuvara aktarım ve kullanım çıkışı.</p>
        </div>
      </div>
      <StokHareketleriClient />
    </div>
  );
}
