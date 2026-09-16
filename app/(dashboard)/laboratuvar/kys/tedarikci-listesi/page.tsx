import {getPortalUser} from "@/lib/portalYetki";
import {redirect} from "next/navigation";
import TedarikciClient from "./TedarikciClient";
export const metadata={title:"KYS - Tedarikçi Listesi"};
export default async function Page(){const user=await getPortalUser();if(!user)redirect("/login");if(!user.can("laboratuvar.kys.tedarikci-listesi"))return <p>Bu sayfayı görüntüleme yetkiniz yok.</p>;return <TedarikciClient/>;}
