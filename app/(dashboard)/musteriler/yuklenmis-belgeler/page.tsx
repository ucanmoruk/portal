import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import YuklenmisBelgelerClient from "./YuklenmisBelgelerClient";
import styles from "@/app/styles/table.module.css";

export const metadata = {
  title: "Yüklenmiş Belgeler — ÜGD Portal",
};

export default async function YuklenmisBelgelerPage() {
  await getServerSession(authOptions);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Yüklenmiş Belgeler</h1>
          <p className={styles.pageSubtitle}>
            Müşteri portalı &quot;Belgelerim&quot;de görünen yüklenmiş belgeler. Geri çekmek için silin.
          </p>
        </div>
      </div>
      <YuklenmisBelgelerClient />
    </div>
  );
}
