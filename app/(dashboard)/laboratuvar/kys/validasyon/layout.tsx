import { notFound, redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portalYetki";
import { loadEurolabAccess } from "@/lib/eurolabAccess";
import { EurolabAccessProvider } from "@/components/eurolab/EurolabAccessProvider";
export default async function Layout({ children }: { children: React.ReactNode }) {
 const user = await getPortalUser(); if (!user) redirect("/login");
 if (!user.can("eurolab.validasyon") && !user.can("eurolab")) notFound();
 return <EurolabAccessProvider value={await loadEurolabAccess()}>{children}</EurolabAccessProvider>;
}
