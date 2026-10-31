import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portalYetki";
import SpektrotekRequestsClient from "./SpektrotekRequestsClient";
export const metadata={title:"Spektrotek Talep"};
export default async function Page(){
  const user=await getPortalUser();if(!user)redirect("/login");if(!user.can("iletisim.spektrotek-talep"))redirect("/");
  return <SpektrotekRequestsClient/>;
}
