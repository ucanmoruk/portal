import { notFound, redirect } from "next/navigation";
import { WORKSPACES } from "@/lib/kysWorkspaceConfig";
import { workspaceAccess } from "@/lib/kysWorkspaceAccess";
export const metadata = { title: "KYS - " + WORKSPACES["kalibrasyon-belirsizlikleri"].title };
export default async function Page({searchParams}:{searchParams:Promise<{deviceId?:string}>}) {
  const access = await workspaceAccess("kalibrasyon-belirsizlikleri");
  if (!access) redirect("/login");
  if (!access.view) notFound();
  
  const {deviceId}=await searchParams;
  redirect(deviceId?`/laboratuvar/kys/cihaz-listesi/${encodeURIComponent(deviceId)}?sekme=belirsizlikler`:'/laboratuvar/kys/cihaz-listesi');
}
