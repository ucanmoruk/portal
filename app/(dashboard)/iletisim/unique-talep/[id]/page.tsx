import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portalYetki";
import UniqueRequestDetail from "../UniqueRequestDetail";
export const metadata = { title: "Unique Talep · İncele" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) redirect("/login");
  if (!user.can("iletisim.unique-talep")) redirect("/");
  const { id } = await params;
  return <UniqueRequestDetail id={id} />;
}
