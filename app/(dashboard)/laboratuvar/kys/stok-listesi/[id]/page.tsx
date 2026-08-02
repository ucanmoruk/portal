import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import styles from "@/app/styles/table.module.css";
import StokDetayClient from "./StokDetayClient";

export const metadata = { title: "KYS - Stok Detayı" };

export default async function StokDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const { id } = await params;

  return (
    <div className={styles.page} style={{ maxWidth: "none" }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Stok Detayı</h1>
          <p className={styles.pageSubtitle}>Stok kartı, hareket izleri ve sertifika dosyaları.</p>
        </div>
      </div>
      <StokDetayClient id={Number(id)} />
    </div>
  );
}
