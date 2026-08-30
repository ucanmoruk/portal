import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portalYetki";
import { dokumanYetkileri } from "@/lib/kysDokumanYetki";
import { getKysDokuman } from "@/lib/kysDokumanStore";
import PrintButton from "./PrintButton";
import styles from "./print.module.css";

export const metadata = { title: "KYS Doküman Yazdır" };

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : String(value);
}

export default async function KysDokumanYazdirPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string; pdfMode?: string }> }) {
  const user = await getPortalUser();
  if (!user) redirect("/login");
  if (!dokumanYetkileri(user).goruntule) redirect("/laboratuvar/kys/dokuman-yonetimi");
  const { id } = await params;
  const documentId = Number(id);
  if (!Number.isInteger(documentId) || documentId <= 0) notFound();
  const doc = await getKysDokuman(documentId);
  if (!doc) notFound();
  if (doc.hasDosya) redirect(`/api/kys/dokumanlar/${doc.id}/dosya`);
  const query = await searchParams;
  if (query.print === "1") redirect(`/api/kys/dokumanlar/${doc.id}/pdf`);
  const pdfMode = query.pdfMode === "1";

  return (
    <main className={styles.screen}>
      <div className={`${styles.document} ${pdfMode ? styles.pdfMode : ""}`}>
        <header className={styles.header}>
          <Image src="/unique-logo-wide.png" alt="UNIQUE Analyse" width={500} height={71} preload unoptimized />
          <h1>{doc.baslik}</h1>
          <table><tbody>
            <tr><th>Doküman No</th><td>{doc.kod}</td></tr>
            <tr><th>Revizyon</th><td>{doc.revizyonEtiket}</td></tr>
            <tr><th>Yürürlük Tarihi</th><td>{formatDate(doc.yururlukTarihi)}</td></tr>
          </tbody></table>
        </header>
        <article className={styles.content} dangerouslySetInnerHTML={{ __html: doc.icerik || "" }} />
        <section className={styles.appendix}>
          <h2>Revizyon Geçmişi</h2>
          <table><thead><tr><th>Rev.</th><th>Madde No</th><th>Açıklama</th><th>Yayın Tarihi</th></tr></thead>
            <tbody>{doc.revizyonlar.map(rev => <tr key={rev.id}><td>{rev.revizyonEtiket}</td><td>{rev.maddeNo || "-"}</td><td>{rev.aciklama || "-"}</td><td>{formatDate(rev.yayinTarihi)}</td></tr>)}</tbody>
          </table>
          <div className={styles.signatures}>
            <div><span>Hazırlayan</span><strong>{doc.hazirlayanAd || "-"}</strong><i>Islak İmza</i></div>
            <div><span>Onaylayan</span><strong>{doc.onaylayanAd || "-"}</strong><i>Islak İmza</i></div>
          </div>
        </section>
        <footer><span className={styles.pageNumber}>Sayfa </span><strong>ELEKTRONİK NÜSHA. BASILMIŞ HALİ KONTROLSÜZ KOPYADIR.</strong></footer>
      </div>
      {!pdfMode && <PrintButton documentId={doc.id} />}
    </main>
  );
}
