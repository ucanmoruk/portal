import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import WorkspaceClient from "@/components/kys-workspace/WorkspaceClient";
import { WORKSPACES } from "@/lib/kysWorkspaceConfig";
import { workspaceAccess } from "@/lib/kysWorkspaceAccess";
export const metadata = { title: "KYS - " + WORKSPACES["degisiklik-kontrolu"].title };
export default async function Page() {
  const access = await workspaceAccess("degisiklik-kontrolu");
  if (!access) redirect("/login");
  if (!access.view) notFound();
  return <Suspense fallback={<p>Yükleniyor…</p>}><WorkspaceClient module="degisiklik-kontrolu" /></Suspense>;
}
