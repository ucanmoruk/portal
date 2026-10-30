import Link from "next/link";
import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portalYetki";
import TelegramSettings from "../TelegramSettings";

export const metadata = { title: "Telegram Bildirimleri | Ayarlar" };

export default async function TelegramPage() {
  const user = await getPortalUser();
  if (!user) redirect("/login");
  if (!user.isAdmin) redirect("/");

  return <div>
    <Link href="/admin/ayarlar">← Ayarlar</Link>
    <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 20, marginBottom: 8 }}>Telegram Bildirimleri</h1>
    <p style={{ color: "var(--color-text-secondary)", fontSize: 14, marginBottom: 24 }}>Alıcılar, bildirim tercihleri ve gönderim kayıtları.</p>
    <TelegramSettings />
  </div>;
}
