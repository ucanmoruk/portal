import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import RootKozTeklifListesi from "./RootKozTeklifListesi";

export const metadata: Metadata = { title: "Root Kozmetik — Teklif Listesi" };

export default async function Page() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return <RootKozTeklifListesi />;
}
