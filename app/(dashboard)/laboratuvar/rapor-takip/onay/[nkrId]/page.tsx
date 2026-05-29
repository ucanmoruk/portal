import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import OnayClient from "./OnayClient";

export const metadata = { title: "Rapor Önizleme & Onay — ÜGD Portal" };

interface PageProps {
  params: Promise<{ nkrId: string }>;
  searchParams: Promise<{ format?: string }>;
}

export default async function RaporOnayPage({ params, searchParams }: PageProps) {
  await getServerSession(authOptions);

  const { nkrId } = await params;
  const sp = await searchParams;
  const format = sp.format || "";

  return <OnayClient nkrId={nkrId} format={format} />;
}
