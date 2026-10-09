import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portalYetki";
import CustomerRequestsClient from "../CustomerRequestsClient";
export const metadata = { title: "Müşteri Talep" };
export default async function Page({ params }: { params: Promise<{ path?: string[] }> }) {
  const user = await getPortalUser();
  if (!user) redirect("/login");
  if (!user.can("iletisim.musteri-talep")) redirect("/");
  const path = (await params).path || [];
  if (path.length > 1) redirect("/iletisim/musteri-talep");
  return <CustomerRequestsClient number={path[0]} />;
}
