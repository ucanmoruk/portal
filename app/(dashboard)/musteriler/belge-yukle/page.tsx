import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import BelgeYukleClient from "./BelgeYukleClient";
import styles from "@/app/styles/table.module.css";

export const metadata = {
  title: "Belge Yükle — ÜGD Portal",
};

export default async function BelgeYuklePage() {
  await getServerSession(authOptions);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Belge Yükle</h1>
          <p className={styles.pageSubtitle}>
            Müşteri portalı &quot;Belgelerim&quot; altında görünecek belgeleri yükleyin.
          </p>
        </div>
      </div>
      <BelgeYukleClient />
    </div>
  );
}
