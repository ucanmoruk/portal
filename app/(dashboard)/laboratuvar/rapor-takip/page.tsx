import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import RaporTakipTable from "./RaporTakipTable";
import styles from "@/app/styles/table.module.css";

export const metadata = {
  title: "Rapor Takip — ÜGD Portal",
};

export default async function RaporTakipPage() {
  await getServerSession(authOptions);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Rapor Takip</h1>
          <p className={styles.pageSubtitle}>Rapor formatı sekmeleriyle ilgili laboratuvar kayıtlarını listeleyin.</p>
        </div>
      </div>

      {/* phase="approval" — sadece "Onaya Gönder" basılmış (Onay Bekleniyor)
          ve laboratuvar kabulü yapılmış raporlar görünsün. */}
      <RaporTakipTable acceptedOnly phase="approval" />
    </div>
  );
}
