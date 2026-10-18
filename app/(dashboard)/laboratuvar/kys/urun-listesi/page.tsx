import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import styles from "@/app/styles/table.module.css";
import StokListesiClient from "../stok-listesi/StokListesiClient";

export const metadata = { title: "KYS - Ürün Listesi" };

export default async function UrunListesiPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return <div className={styles.page} style={{ maxWidth: "none" }}>
    <div className={styles.pageHeader}><div>
      <h1 className={styles.pageTitle}>Ürün Listesi</h1>
      <p className={styles.pageSubtitle}>Root ve Spektrotek ürünleri, stok takibi ve web kataloğu bilgileri.</p>
    </div></div>
    <StokListesiClient products />
  </div>;
}
