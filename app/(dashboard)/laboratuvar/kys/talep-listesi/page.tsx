import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import styles from "@/app/styles/table.module.css";
import TalepListesiClient from "./TalepListesiClient";

export const metadata = { title: "KYS - Talep Listesi" };

export default async function TalepListesiPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className={styles.page} style={{ maxWidth: "none" }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Talep Listesi</h1>
          <p className={styles.pageSubtitle}>Satın alma talebi, onay, işleme alma ve kabul takibi.</p>
        </div>
      </div>
      <TalepListesiClient />
    </div>
  );
}
