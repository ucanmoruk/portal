import { notFound, redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portalYetki";
import { loadEurolabAccess } from "@/lib/eurolabAccess";
import { EurolabAccessProvider } from "@/components/eurolab/EurolabAccessProvider";
import GroupNav from "@/components/kys-workspace/GroupNav";
export default async function Layout({ children }: { children: React.ReactNode }) {
 const user = await getPortalUser(); if (!user) redirect("/login");
 if (!user.can("eurolab.qc-kartlar") && !user.can("eurolab")) notFound();
 const items = [...(user.can("eurolab.validasyon") || user.can("eurolab") ? [{ href: "/laboratuvar/kys/validasyon", title: "Validasyon / Verifikasyon" }] : []), { href: "/laboratuvar/kys/qc-kartlar", title: "QC Kartları" }];
 return <EurolabAccessProvider value={await loadEurolabAccess()}><GroupNav label="Metot güvencesi" items={items} />{children}</EurolabAccessProvider>;
}
