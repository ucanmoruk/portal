import { Suspense } from "react";
import NumuneTakipLabClient from "./NumuneTakipLabClient";
import styles from "@/app/styles/table.module.css";

export const metadata = {
  title: "Numune Takip — ÜGD Portal",
};

export default function NumuneTakipLabPage() {
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Numune Takip</h1>
          <p className={styles.pageSubtitle}>
            Laboratuvar kabul ve sonuç giriş ekranı. Önce &quot;Kabul Bekleyenler&quot; sekmesinden numuneleri teslim alın,
            sonra ilgili rapor formatı sekmesinde sonuçları girin.
          </p>
        </div>
      </div>

      {/* useSearchParams Suspense gerektirir */}
      <Suspense fallback={<div style={{ padding: 20 }}>Yükleniyor…</div>}>
        <NumuneTakipLabClient />
      </Suspense>
    </div>
  );
}
