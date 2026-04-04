import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import FormulKontrol from "./FormulKontrol";
import styles from '@/app/styles/table.module.css';
export const metadata = { title: "Formül Kontrol" };

export default async function FormulKontrolPage() {
  const session = await getServerSession(authOptions);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Formül Kontrol</h1>
          <p className={styles.pageSubtitle}>Cosmetic Ingredient Database ve Yönetmelik karşılaştırmalı formül analizi.</p>
        </div>
      </div>

      <FormulKontrol />
    </div>
  );
}
