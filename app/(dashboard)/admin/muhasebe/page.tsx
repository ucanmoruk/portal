import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portalYetki";
import MuhasebeClient from "./MuhasebeClient";

export const metadata = { title: "Muhasebe Ödeme Planı" };

export default async function MuhasebePage() {
  const user = await getPortalUser();
  if (!user) redirect("/login");
  if (!user.isAdmin) redirect("/");
  return <MuhasebeClient />;
}
