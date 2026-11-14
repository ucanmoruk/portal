import { Suspense } from "react";
import { redirect,notFound } from "next/navigation";
import { workspaceAccess } from "@/lib/kysWorkspaceAccess";
import VerificationReports from "@/components/kys-workspace/VerificationReports";
export const metadata={title:"Yazılım Doğrulama Raporları"};
export default async function Page(){const a=await workspaceAccess('yazilim-dogrulama');if(!a)redirect('/login');if(!a.view)notFound();return <Suspense fallback={<p>Yükleniyor…</p>}><VerificationReports/></Suspense>}
