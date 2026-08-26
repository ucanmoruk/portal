import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import styles from "@/app/styles/table.module.css";
import MusteriNotlariClient from "./MusteriNotlariClient";

export const metadata = { title: "Müşteri Notları" };

export default async function MusteriNotlariPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className={styles.page} style={{ maxWidth: "none" }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Müşteri Notları</h1>
          <p className={styles.pageSubtitle}>
            Firma bazlı takip, görüşme hatırlatmaları ve ödeme notlarını durumlarına göre yönetin.
          </p>
        </div>
      </div>
      <MusteriNotlariClient />
    </div>
  );
}
