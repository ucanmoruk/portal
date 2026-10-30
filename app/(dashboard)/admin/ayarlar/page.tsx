import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAllSettings } from "@/lib/settings";
import AyarlarForm from "./AyarlarForm";
import Link from "next/link";

export const metadata = { title: "Ayarlar" };

// Admin: Oğuzhan Eker (2)
const ADMIN_IDS = new Set(["2"]);

export default async function AyarlarPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const uid = String(session.user?.userId ?? "");
  if (!ADMIN_IDS.has(uid)) redirect("/");

  const settings = await getAllSettings();

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Sistem Ayarları</h1>
      <p style={{ color: "var(--color-text-secondary)", fontSize: 14, marginBottom: 32 }}>
        Şirket bilgileri, mail (SMTP) ve Telegram bildirim ayarları
      </p>
      <Link href="/admin/ayarlar/otomasyonlar" style={{ display: "block", maxWidth: 720, padding: 20, marginBottom: 28, border: "1px solid var(--color-border)", borderRadius: 10, textDecoration: "none", color: "var(--color-text-primary)" }}>
        <strong>Otomasyonlar →</strong>
        <span style={{ display: "block", marginTop: 8, color: "var(--color-text-secondary)", fontSize: 13 }}>Günlük vade raporlarını, kurulum durumunu ve onaylı ödeme hatırlatmalarını takip edin.</span>
      </Link>
      <Link href="/admin/ayarlar/telegram" style={{ display: "block", maxWidth: 720, padding: 20, marginBottom: 28, border: "1px solid var(--color-border)", borderRadius: 10, textDecoration: "none", color: "var(--color-text-primary)" }}>
        <strong>Telegram Bildirimleri →</strong>
        <span style={{ display: "block", marginTop: 8, color: "var(--color-text-secondary)", fontSize: 13 }}>Alıcıları, günlük ve haftalık özetleri, geciken iş hatırlatmalarını yönetin.</span>
      </Link>
      <AyarlarForm initial={settings} />
    </div>
  );
}
