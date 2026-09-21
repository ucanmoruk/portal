import { getPortalUser } from "@/lib/portalYetki";
import { redirect } from "next/navigation";
import IletisimClient from "./IletisimClient";
import styles from "@/app/styles/table.module.css";

export const metadata={title:"KYS - İletişim"};
export default async function Page(){const user=await getPortalUser();if(!user)redirect("/login");if(!user.isAdmin&&!user.can("laboratuvar.kys")&&!user.can("laboratuvar.kys.iletisim")&&!user.keys.some(key=>key.startsWith("laboratuvar.kys.")))redirect("/");return <div className={styles.page} style={{maxWidth:"none"}}><div className={styles.pageHeader}><div><h1 className={styles.pageTitle}>İletişim</h1><p className={styles.pageSubtitle}>Duyuruları, özel konuşmaları ve görevlerin ilerleyişini tek yerden yönetin.</p></div></div><IletisimClient currentUserId={user.userId}/></div>}
