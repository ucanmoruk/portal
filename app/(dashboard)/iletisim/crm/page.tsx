import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portalYetki";
import CrmClient from "./SalesClient";

export const metadata = { title: "AI Satış Asistanı" };
export default async function Page() {
  const user = await getPortalUser();
  if (!user) redirect("/login");
  if (!user.can("iletisim.crm")) redirect("/");
  return <CrmClient />;
}
