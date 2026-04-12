import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import RaporEditor from "./RaporEditor";

export const metadata = { title: "Sonuç Girişi — Rapor" };

export default async function RaporEditorPage({
  params,
}: {
  params: Promise<{ raporId: string }>;
}) {
  await getServerSession(authOptions);
  const { raporId } = await params;
  return <RaporEditor raporId={raporId} />;
}
