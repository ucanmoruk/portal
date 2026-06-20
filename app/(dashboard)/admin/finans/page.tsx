import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import FinansClient from "./FinansClient";

export const metadata = { title: "Finans" };

const ADMIN_IDS = new Set(["2"]);

export default async function FinansPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const uid = String((session.user as { userId?: string | number } | undefined)?.userId ?? "");
  if (!ADMIN_IDS.has(uid)) redirect("/");

  return <FinansClient />;
}
