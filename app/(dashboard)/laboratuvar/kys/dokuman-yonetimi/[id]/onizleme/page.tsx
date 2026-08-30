import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portalYetki";
import { dokumanYetkileri } from "@/lib/kysDokumanYetki";
import { getKysDokuman } from "@/lib/kysDokumanStore";
import { formatDate } from "../../dokumanTypes";
import styles from "./onizleme.module.css";
import PrintControls from "./PrintControls";

export const metadata = { title: "KYS Doküman Önizleme" };

const slug = (value: string, index: number) => {
  const clean = value.toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
    .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return clean ? `${clean}-${index + 1}` : `baslik-${index + 1}`;
};

function prepareContent(html: string) {
  const headings: Array<{ id: string; title: string; level: number }> = [];
  let index = 0;
  const content = html.replace(/<h([2-4])([^>]*)>([\s\S]*?)<\/h\1>/gi, (_full, level, attrs, inner) => {
    const title = String(inner).replace(/<[^>]+>/g, "").trim() || `Başlık ${index + 1}`;
    const currentId = String(attrs).match(/\bid=["']([^"']+)["']/i)?.[1];
    const id = currentId || slug(title, index);
    headings.push({ id, title, level: Number(level) });
    index += 1;
    const cleanAttrs = String(attrs).replace(/\s+id=["'][^"']+["']/i, "");
    return `<h${level}${cleanAttrs} id="${id}">${inner}</h${level}>`;
  }).replace(/<a([^>]*)>/gi, (_full, attrs) => {
    const clean = String(attrs).replace(/\s+target=["'][^"']*["']/gi, "").replace(/\s+rel=["'][^"']*["']/gi, "");
    return `<a${clean} target="_blank" rel="noopener noreferrer">`;
  });
  return { content, headings };
}

export default async function DokumanOnizlemePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string }> }) {
  const user = await getPortalUser();
  if (!user) redirect("/login");
  if (!dokumanYetkileri(user).goruntule) redirect("/laboratuvar/kys/dokuman-yonetimi");
  const { id } = await params;
  const documentId = Number(id);
  if (!Number.isInteger(documentId) || documentId <= 0) notFound();
  const doc = await getKysDokuman(documentId);
  if (!doc) notFound();
  if (doc.hasDosya) redirect(`/api/kys/dokumanlar/${doc.id}/dosya`);
  if ((await searchParams).print === "1") redirect(`/kys-dokuman-yazdir/${doc.id}?print=1`);
  const { content, headings } = prepareContent(doc.icerik || "");

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Image src="/unique-logo-wide.png" alt="UNIQUE Analyse" width={500} height={71} preload unoptimized />
        <h1>{doc.baslik}</h1>
        <table><tbody>
          <tr><th>Doküman No</th><td>{doc.kod}</td></tr>
          <tr><th>Revizyon</th><td>{doc.revizyonEtiket}</td></tr>
          <tr><th>Yürürlük Tarihi</th><td>{formatDate(doc.yururlukTarihi)}</td></tr>
        </tbody></table>
      </header>
      <div className={styles.body}>
        <aside>
          <strong>Başlıklar</strong>
          {headings.map(item => <a key={item.id} href={`#${item.id}`} style={{ paddingLeft: `${(item.level - 2) * 12 + 8}px` }}>{item.title}</a>)}
        </aside>
        <article dangerouslySetInnerHTML={{ __html: content }} />
      </div>
      <section className={styles.printAppendix}>
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
      <PrintControls documentId={doc.id} />
    </main>
  );
}
