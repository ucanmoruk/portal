import { MethodDefinitionWizard } from "@/components/validation/MethodDefinitionWizard";
import styles from "@/app/(dashboard)/laboratuvar/eurolab/validasyon/yeni/page.module.css";

export const metadata = { title: "KYS - Yeni Validasyon" };

export default async function Page({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Unique Validasyon / Verifikasyon</div>
          <h1 className={styles.title}>{edit ? "Validasyon Protokolünü Güncelle" : "Yeni Metot Validasyonu"}</h1>
          <p className={styles.subtitle}>ISO 17025 gerekliliklerine göre validasyon veya verifikasyon çalışmasını yapılandırın.</p>
        </div>
        <div className={styles.meta}>
          <span className={styles.dot} />
          {edit ? "Protokol güncelleme" : "Taslak oluşturma"}
        </div>
      </div>
      <MethodDefinitionWizard editId={edit} />
    </div>
  );
}
