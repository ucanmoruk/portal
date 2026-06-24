import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import RaporDuzenleClient from "./RaporDuzenleClient";

export const metadata = { title: "Rapor Düzenle" };

export default async function RaporDuzenlePage({
  params,
  searchParams,
}: {
  params: Promise<{ nkrId: string }>;
  searchParams: Promise<{ format?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { nkrId } = await params;
  const sp = await searchParams;
  const nkrIdNum = parseInt(nkrId, 10);
  const format = (sp.format || "").trim();
  if (!Number.isFinite(nkrIdNum) || !format) {
    return <div style={{ padding: 40, fontFamily: "system-ui" }}>Geçersiz rapor / format.</div>;
  }

  return <RaporDuzenleClient nkrId={nkrIdNum} format={format} />;
}
