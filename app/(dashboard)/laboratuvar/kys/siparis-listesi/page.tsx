import {redirect} from "next/navigation";
import {getPortalUser} from "@/lib/portalYetki";
import styles from "@/app/styles/table.module.css";
import TalepListesiClient from "../talep-listesi/TalepListesiClient";
export const metadata={title:"KYS - Sipariş Listesi"};
export default async function Page(){const user=await getPortalUser();if(!user)redirect("/login");if(!user.can("laboratuvar.kys.talep-listesi"))return <p>Yetkiniz yok.</p>;return <div className={styles.page} style={{maxWidth:"none"}}><div className={styles.pageHeader}><div><h1 className={styles.pageTitle}>Sipariş Listesi</h1><p className={styles.pageSubtitle}>Sipariş, fatura ve ödeme takibi.</p></div></div><TalepListesiClient ordersOnly/></div>;}