import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import styles from "@/app/styles/table.module.css";
import DokumanYonetimiClient from "../DokumanYonetimiClient";

export const metadata = { title: "KYS - Doküman Detayı" };

export default async function DokumanDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { id } = await params;
  const documentId = Number(id);
  if (!Number.isInteger(documentId) || documentId <= 0) notFound();

  return (
    <div className={styles.page} style={{ maxWidth: "none" }}>
      <DokumanYonetimiClient documentId={documentId} />
    </div>
  );
}
