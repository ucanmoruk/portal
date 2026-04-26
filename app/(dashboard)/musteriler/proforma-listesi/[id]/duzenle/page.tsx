import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import ProformaForm from "../../ProformaForm";

export const metadata = { title: "Proforma Düzenle" };

export default async function ProformaDuzenlePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const { id } = await params;

  return <ProformaForm id={id} />;
}
