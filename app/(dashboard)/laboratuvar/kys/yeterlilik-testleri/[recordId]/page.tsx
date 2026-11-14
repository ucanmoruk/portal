import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import WorkspaceClient from "@/components/kys-workspace/WorkspaceClient";
import { WORKSPACES } from "@/lib/kysWorkspaceConfig";
import { workspaceAccess } from "@/lib/kysWorkspaceAccess";
export const metadata = { title: "KYS - " + WORKSPACES["yeterlilik-testleri"].title };
export default async function Page({ params }: { params: Promise<{ recordId: string }> }) {
  const access = await workspaceAccess("yeterlilik-testleri");
  if (!access) redirect("/login");
  if (!access.view) notFound();
  const { recordId } = await params;
  return <Suspense fallback={<p>Yükleniyor…</p>}><WorkspaceClient module="yeterlilik-testleri" recordId={recordId} /></Suspense>;
}
