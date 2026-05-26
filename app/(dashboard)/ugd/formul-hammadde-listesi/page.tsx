import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import FormulHammaddeTable from "./FormulHammaddeTable";
import styles from "@/app/styles/table.module.css";

export const metadata = { title: "Formül Hammadde Listesi" };

export default async function Page() {
  await getServerSession(authOptions);
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Formül Hammadde Listesi</h1>
          <p className={styles.pageSubtitle}>
            Tüm ürünlerin formül satırları. Bir hammaddenin hangi ürünlerde geçtiğini ara.
          </p>
        </div>
      </div>
      <FormulHammaddeTable />
    </div>
  );
}
