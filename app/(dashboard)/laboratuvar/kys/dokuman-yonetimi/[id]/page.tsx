import { getPortalUser } from "@/lib/portalYetki";
import { dokumanYetkileri } from "@/lib/kysDokumanYetki";
import { notFound, redirect } from "next/navigation";
import styles from "@/app/styles/table.module.css";
import DokumanYonetimiClient from "../DokumanYonetimiClient";

export const metadata = { title: "KYS - Doküman Detayı" };

export default async function DokumanDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) redirect("/login");
  const yetki = dokumanYetkileri(user);
  if (!yetki.goruntule) redirect("/");

  const { id } = await params;
  const documentId = Number(id);
  if (!Number.isInteger(documentId) || documentId <= 0) notFound();
  if (!yetki.duzenle && !yetki.kontrol && !yetki.onayla) redirect(`/laboratuvar/kys/dokuman-yonetimi/${documentId}/onizleme`);

  return (
    <div className={styles.page} style={{ maxWidth: "none" }}>
      <DokumanYonetimiClient documentId={documentId} />
    </div>
  );
}
