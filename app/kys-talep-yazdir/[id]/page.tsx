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

export default async function RequestPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) redirect("/login");
  if (!user.can("laboratuvar.kys.talep-listesi")) return <p>Bu talebi görüntüleme yetkiniz yok.</p>;
  const { id } = await params;
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) notFound();
  const detail = await getKysRequestDetail(Number(id));
  if (!detail) notFound();
  const cfg = await getAllSettings();
  const spektrotek = detail.talep.seri === "Spektrotek";
  const english = spektrotek && detail.talep.talepTuru !== "Sipariş";
  const label = (tr:string,en:string) => english ? en : tr;
  const unit = (value:string) => english ? ({Adet:"pcs",Kutu:"box",Paket:"pack",Şişe:"bottle",Litre:"L",Gram:"g",Kilogram:"kg"} as Record<string,string>)[value] || value : value;
  const company = spektrotek ? "Spektrotek" : cfg.SIRKET_ADI || process.env.SIRKET_ADI || "UNIQUE Analiz";
  return <main className={styles.page} lang={english ? "en" : "tr"}>
    <div className={styles.toolbar}><Link href={`/laboratuvar/kys/talep-listesi/${id}`}>{label("← Talep detayına dön", "← Back to request")}</Link><PrintButton english={english} /></div>
    <article className={styles.paper}>
      <header className={styles.header}>
        <div>{spektrotek ? <Image src="/spektrotek-logo.png" alt="Spektrotek" width={2364} height={539} unoptimized priority className={styles.logo} /> : <Image src="/unique-logo.png" alt="UNIQUE" width={220} height={65} unoptimized priority className={styles.logo} />}</div>
        <div className={styles.title}><h1>{spektrotek && !english ? "Sipariş Formu" : label("Talep Formu", "PURCHASE ORDER")}</h1>{spektrotek ? <dl className={styles.orderMeta}><div><dt>{label("Sipariş No", "Order No")}</dt><dd>{detail.talep.talepNo}</dd></div><div><dt>{label("Tarih", "Date")}</dt><dd>{date(detail.talep.olusturmaTarihi)}</dd></div></dl> : <><strong>{detail.talep.talepNo}</strong><p>{date(detail.talep.olusturmaTarihi)}</p></>}</div>
      </header>
      {spektrotek && <section className={styles.notes}><h2>{label("Firma", "Company")}</h2><p>{detail.talep.firmaAdi}</p></section>}
      <h2>{label("Talep edilen malzeme / hizmetler", "Requested materials / services")}</h2>
      <table className={styles.table}>
        <colgroup><col style={{ width: "5%" }} /><col style={{ width: "12%" }} /><col style={{ width: "33%" }} /><col style={{ width: "32%" }} /><col style={{ width: "10%" }} /><col style={{ width: "8%" }} /></colgroup>
        <thead><tr><th>No</th><th>{label("Kod", "Code")}</th><th>{label("Malzeme / hizmet adı", "Material / service")}</th><th>{label("Özellik / açıklama", "Specification / description")}</th><th>{label("Miktar", "Quantity")}</th><th>{label("Birim", "Unit")}</th></tr></thead>
        <tbody>{detail.kalemler.map((item: RequestPrintItem, index: number) => <tr key={item.id}><td>{index + 1}</td><td>{item.kod || item.stokKod || "—"}</td><td>{item.malzemeAdi}</td><td>{[item.ozellik, item.kullaniciNotu, item.marka && `${label("Marka", "Brand")}: ${item.marka}`].filter(Boolean).join("\n") || "—"}</td><td className={styles.numeric}>{Number(item.miktar).toLocaleString(english ? "en-GB" : "tr-TR", {maximumFractionDigits:4})}</td><td>{unit(item.birim)}</td></tr>)}</tbody>
      </table>
      {detail.talep.teknikSartname && <section className={styles.notes}><h2>{label("Teknik şartname", "Technical specification")}</h2><p>{detail.talep.teknikSartname}</p></section>}
      <section className={styles.notes}><h2>{label("Notlar / teslimat bilgileri", "Notes / delivery information")}</h2><p>{detail.talep.notlar || "—"}</p></section>
      {spektrotek ? <section className={styles.companyDetails}><strong>Spektrotek Laboratuvar Cihazları Paz. Pro. ve Dan. A.Ş.</strong><p>Atatürk Mah. Hadımköy Yolu Cad. No:10 / 7 Esenyurt İstanbul - Turkey</p><p><a href="https://www.spektrotek.com">www.spektrotek.com</a> , <a href="mailto:info@spektrotek.com">info@spektrotek.com</a></p><p>+90 212 706 10 76</p></section> : <div className={styles.signatures}><div><span>{label("Talep eden", "Requested by")}</span><strong>{detail.talep.olusturanAd || ""}</strong></div><div><span>{label("Onaylayan", "Approved by")}</span><strong>{detail.talep.onaylayanAd || ""}</strong></div><div><span>{label("Tedarikçi / teslim tarihi", "Supplier / delivery date")}</span></div></div>}
      <footer className={styles.footer}><span>{!spektrotek && company}</span><span className={styles.pageNumber}>{label("Sayfa ", "Page ")}</span></footer>
    </article>
  </main>;
}
