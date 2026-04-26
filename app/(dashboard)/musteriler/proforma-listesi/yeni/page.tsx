import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import ProformaForm from "../ProformaForm";

export const metadata = { title: "Yeni Proforma" };

export default async function YeniProformaPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <ProformaForm />;
}
