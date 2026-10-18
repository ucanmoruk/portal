import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import styles from "@/app/styles/table.module.css";
import StokDetayClient from "../../stok-listesi/[id]/StokDetayClient";

export const metadata = { title: "KYS - Ürün Detayı" };

export default async function UrunDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const { id } = await params;
  return <div className={styles.page} style={{ maxWidth: "none" }}>
    <div className={styles.pageHeader}><div><h1 className={styles.pageTitle}>Ürün Detayı</h1><p className={styles.pageSubtitle}>Ürün kartı, stok hareketleri, görseller ve web bilgileri.</p></div></div>
    <StokDetayClient id={Number(id)} products />
  </div>;
}
