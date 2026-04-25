import { MethodDefinitionWizard } from "@/components/validation/MethodDefinitionWizard";
import styles from "./page.module.css";

export const metadata = { title: "Eurolab - Yeni Validasyon" };

export default async function NewMethodPage({ searchParams }: { searchParams?: Promise<{ edit?: string }> }) {
    const params = await searchParams;
    const editId = params?.edit;

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <div className={styles.eyebrow}>Eurolab Validasyon</div>
                    <h1 className={styles.title}>{editId ? "Validasyon Protokolünü Güncelle" : "Yeni Metot Validasyonu"}</h1>
                    <p className={styles.subtitle}>
                        ISO 17025 gerekliliklerine göre validasyon veya verifikasyon çalışmasını yapılandırın.
                    </p>
                </div>
                <div className={styles.meta}>
                    <span className={styles.dot} />
                    {editId ? "Protokol güncelleme" : "Taslak oluşturma"}
                </div>
            </div>

            <MethodDefinitionWizard editId={editId} />
        </div>
    );
}
