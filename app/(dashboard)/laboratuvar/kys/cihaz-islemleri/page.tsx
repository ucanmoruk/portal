import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import WorkspaceClient from "@/components/kys-workspace/WorkspaceClient";
import { WORKSPACES } from "@/lib/kysWorkspaceConfig";
import { workspaceAccess } from "@/lib/kysWorkspaceAccess";
export const metadata = { title: "KYS - " + WORKSPACES["cihaz-islemleri"].title };
export default async function Page() {
  const access = await workspaceAccess("cihaz-islemleri");
  if (!access) redirect("/login");
  if (!access.view) notFound();
  
  return <Suspense fallback={<p>Yükleniyor…</p>}><WorkspaceClient module="cihaz-islemleri" /></Suspense>;
}
