import { redirect } from "next/navigation";
import styles from "@/app/styles/table.module.css";
import { getPortalUser } from "@/lib/portalYetki";
import SatinAlmaGecmisiClient from "./SatinAlmaGecmisiClient";

export const metadata = { title: "KYS - Satın Alma Geçmişi" };

export default async function SatinAlmaGecmisiPage() {
  const user = await getPortalUser();
  if (!user) redirect("/login");
  if (!user.can("laboratuvar.kys.satin-alma-gecmisi")) redirect("/");

  return (
    <div className={styles.page} style={{ maxWidth: "none" }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Satın Alma Geçmişi</h1>
          <p className={styles.pageSubtitle}>Stok malzemelerinin tedarikçi, tarih, miktar ve maliyet geçmişi.</p>
        </div>
      </div>
      <SatinAlmaGecmisiClient />
    </div>
  );
}
