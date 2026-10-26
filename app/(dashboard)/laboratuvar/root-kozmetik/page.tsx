import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Metadata } from "next";

export const metadata: Metadata = { title: "Root Kozmetik" };

export default async function RootKozmetikPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  redirect("/laboratuvar/root-kozmetik/numune-takip");
}
