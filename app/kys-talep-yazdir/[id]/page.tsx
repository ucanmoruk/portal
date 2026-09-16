import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portalYetki";
import { getKysRequestDetail } from "@/lib/kysStore";
import { getAllSettings } from "@/lib/settings";
import PrintButton from "./PrintButton";
import styles from "./print.module.css";

type RequestPrintItem = { id: number; kod: string; stokKod: string; malzemeAdi: string; ozellik: string; kullaniciNotu: string; marka: string; miktar: number; birim: string };

export const metadata = { title: "KYS Talep Formu" };
const date = (value: string | null) => value ? value.slice(0, 10).split("-").reverse().join(".") : "—";
const quantity = (value: number) => Number(value).toLocaleString("tr-TR", { maximumFractionDigits: 4 });

export default async function RequestPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) redirect("/login");
  if (!user.can("laboratuvar.kys.talep-listesi")) return <p>Bu talebi görüntüleme yetkiniz yok.</p>;
  const { id } = await params;
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) notFound();
  const detail = await getKysRequestDetail(Number(id));
  if (!detail) notFound();
  const cfg = await getAllSettings();
  const company = cfg.SIRKET_ADI || process.env.SIRKET_ADI || "UNIQUE Analiz";
  return <main className={styles.page}>
    <div className={styles.toolbar}><Link href={`/laboratuvar/kys/talep-listesi/${id}`}>← Talep detayına dön</Link><PrintButton /></div>
    <article className={styles.paper}>
      <header className={styles.header}>
        <div><Image src="/unique-logo.png" alt="UNIQUE" width={220} height={65} unoptimized priority className={styles.logo} /></div>
        <div className={styles.title}><h1>Talep Formu</h1><strong>{detail.talep.talepNo}</strong><p>{date(detail.talep.olusturmaTarihi)}</p></div>
      </header>
      <h2>Talep edilen malzeme / hizmetler</h2>
      <table className={styles.table}>
        <colgroup><col style={{ width: "5%" }} /><col style={{ width: "12%" }} /><col style={{ width: "33%" }} /><col style={{ width: "32%" }} /><col style={{ width: "10%" }} /><col style={{ width: "8%" }} /></colgroup>
        <thead><tr><th>No</th><th>Kod</th><th>Malzeme / hizmet adı</th><th>Özellik / açıklama</th><th>Miktar</th><th>Birim</th></tr></thead>
        <tbody>{detail.kalemler.map((item: RequestPrintItem, index: number) => <tr key={item.id}><td>{index + 1}</td><td>{item.kod || item.stokKod || "—"}</td><td>{item.malzemeAdi}</td><td>{[item.ozellik, item.kullaniciNotu, item.marka && `Marka: ${item.marka}`].filter(Boolean).join("\n") || "—"}</td><td className={styles.numeric}>{quantity(item.miktar)}</td><td>{item.birim}</td></tr>)}</tbody>
      </table>
      {detail.talep.teknikSartname && <section className={styles.notes}><h2>Teknik şartname</h2><p>{detail.talep.teknikSartname}</p></section>}
      <section className={styles.notes}><h2>Notlar / teslimat bilgileri</h2><p>{detail.talep.notlar || "—"}</p></section>
      <div className={styles.signatures}><div><span>Talep eden</span><strong>{detail.talep.olusturanAd || ""}</strong></div><div><span>Onaylayan</span><strong>{detail.talep.onaylayanAd || ""}</strong></div><div><span>Tedarikçi / teslim tarihi</span></div></div>
      <footer className={styles.footer}><span>{company}</span><span className={styles.pageNumber}>Sayfa </span></footer>
    </article>
  </main>;
}
