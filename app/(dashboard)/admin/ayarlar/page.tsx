import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAllSettings } from "@/lib/settings";
import AyarlarForm from "./AyarlarForm";

export const metadata = { title: "Ayarlar" };

const ADMIN_IDS = new Set(["1", "2"]);

export default async function AyarlarPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const uid = String((session.user as any)?.userId ?? "");
  if (!ADMIN_IDS.has(uid)) redirect("/");

  const settings = await getAllSettings();

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Sistem Ayarları</h1>
      <p style={{ color: "var(--color-text-secondary)", fontSize: 14, marginBottom: 32 }}>
        Şirket bilgileri ve mail (SMTP) yapılandırması
      </p>
      <AyarlarForm initial={settings} />
    </div>
  );
}
