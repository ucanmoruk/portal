import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import StabiliteEntryClient from "./StabiliteEntryClient";

export const metadata = { title: "Stabilite Sonuç Girişi" };

export default async function StabiliteGirisPage({
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
  const format = (sp.format || "Stabilite").trim();

  return <StabiliteEntryClient nkrId={parseInt(nkrId, 10)} format={format} />;
}
