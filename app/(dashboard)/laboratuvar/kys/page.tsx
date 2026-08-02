import { redirect } from "next/navigation";

export const metadata = { title: "KYS" };

export default async function KysPage() {
  redirect("/laboratuvar/kys/stok-listesi");
}
