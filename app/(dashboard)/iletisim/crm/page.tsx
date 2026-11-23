import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portalYetki";
import CrmClient from "./CrmClient";

export const metadata = { title: "CRM" };
export default async function Page() {
  const user = await getPortalUser();
  if (!user) redirect("/login");
  if (!user.can("iletisim.crm")) redirect("/");
  return <CrmClient />;
}
