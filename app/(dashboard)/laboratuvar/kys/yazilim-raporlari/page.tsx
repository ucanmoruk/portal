import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import VerificationReports from "@/components/kys-workspace/VerificationReports";
import { WORKSPACES } from "@/lib/kysWorkspaceConfig";
import { workspaceAccess } from "@/lib/kysWorkspaceAccess";
export const metadata = { title: "KYS - " + WORKSPACES["yazilim-raporlari"].title };
export default async function Page() {
  const access = await workspaceAccess("yazilim-raporlari");
  if (!access) redirect("/login");
  if (!access.view) notFound();
  return <Suspense fallback={<p>Yükleniyor…</p>}><VerificationReports /></Suspense>;
}
