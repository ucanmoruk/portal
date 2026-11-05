import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portalYetki";
import UniqueRequestsClient from "./UniqueRequestsClient";
export const metadata = { title: "Unique Talep" };
export default async function Page() {
  const user = await getPortalUser();
  if (!user) redirect("/login");
  if (!user.can("iletisim.unique-talep")) redirect("/");
  return <UniqueRequestsClient />;
}
