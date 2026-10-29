import { kysRequestCompany } from "@/lib/kysRequestCompany";
import { requestFormMarkup } from "@/lib/kysRequestForm";
import { REQUEST_FORM_CSS } from "@/lib/kysRequestFormStyle";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portalYetki";
import { getKysRequestDetail } from "@/lib/kysStore";
import { getAllSettings } from "@/lib/settings";
import PrintButton from "./PrintButton";
import styles from "./print.module.css";

export const metadata = { title: "KYS Talep Formu" };


export default async function RequestPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) redirect("/login");
  if (!user.can("laboratuvar.kys.talep-listesi")) return <p>Bu talebi görüntüleme yetkiniz yok.</p>;
  const { id } = await params;
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) notFound();
  const detail = await getKysRequestDetail(Number(id));
  if (!detail) notFound();
  if (!user.firmalar.includes(detail.talep.seri)) return <p>Bu firmanın talebini görüntüleme yetkiniz yok.</p>;
  const brand = kysRequestCompany(detail.talep.seri);
  const spektrotek = Boolean(brand);
  // These brands already contain their company details. Optional legacy settings
  // must not prevent a request stored in the laboratory database from printing.
  const cfg: Record<string, string> = brand ? {} : await getAllSettings().catch((error: unknown) => {
    console.warn("KYS talep yazdırma: şirket ayarları alınamadı, varsayılan şirket adı kullanılacak.", error instanceof Error ? error.message : "");
    return {};
  });
  const english = spektrotek && detail.talep.talepTuru !== "Sipariş";
  const label = (tr:string,en:string) => english ? en : tr;
  const company = spektrotek ? detail.talep.seri : cfg.SIRKET_ADI || process.env.SIRKET_ADI || "UNIQUE Analiz";
  return <main className="kys-request-form-page" lang={english ? "en" : "tr"}>
    <div className={styles.toolbar}><Link href={`/laboratuvar/kys/talep-listesi/${id}`}>{label("← Talep detayına dön", "← Back to request")}</Link><PrintButton english={english} /></div>
    <style>{REQUEST_FORM_CSS}</style>
    <div dangerouslySetInnerHTML={{__html:requestFormMarkup({...detail.talep,kalemler:detail.kalemler},{company})}} />
  </main>;
}
