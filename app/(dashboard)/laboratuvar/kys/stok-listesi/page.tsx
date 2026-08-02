import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import styles from "@/app/styles/table.module.css";
import StokListesiClient from "./StokListesiClient";

export const metadata = { title: "KYS - Stok Listesi" };

export default async function StokListesiPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className={styles.page} style={{ maxWidth: "none" }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Stok Listesi</h1>
          <p className={styles.pageSubtitle}>
            Barkodlu stok kartları, kritik limit ve birim bazlı stok takibi.
          </p>
        </div>
      </div>
      <StokListesiClient />
    </div>
  );
}
