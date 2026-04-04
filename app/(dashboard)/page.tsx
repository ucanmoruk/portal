import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import styles from "./page.module.css";

export const metadata = {
  title: "Dashboard",
};

const stats = [
  { label: "Toplam Ürün", value: "—", icon: "📦", color: "#0071e3" },
  { label: "Aktif Formül", value: "—", icon: "🧪", color: "#30d158" },
  { label: "Cosing Kaydı", value: "—", icon: "🔬", color: "#ff9f0a" },
  { label: "Firma Sayısı", value: "—", icon: "🏢", color: "#bf5af2" },
];

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  return (
    <div className={styles.page}>
      {/* Welcome Banner */}
      <div className={styles.welcomeBanner}>
        <div>
          <h1 className={styles.welcomeTitle}>
            Hoş Geldiniz, {session?.user?.name?.split(" ")[0]} 👋
          </h1>
          <p className={styles.welcomeSubtitle}>
            ÜGD Portal sistemine erişiminiz aktif. Soldaki menüden ilgili modüle geçiş yapabilirsiniz.
          </p>
        </div>
        <div className={styles.welcomeBadge}>
          <span className={styles.badgeDot} />
          Sistem Aktif
        </div>
      </div>

      {/* Stats Grid */}
      <div className={styles.statsGrid}>
        {stats.map((stat) => (
          <div key={stat.label} className={styles.statCard}>
            <div className={styles.statIcon} style={{ background: `${stat.color}15`, color: stat.color }}>
              {stat.icon}
            </div>
            <div className={styles.statBody}>
              <span className={styles.statValue}>{stat.value}</span>
              <span className={styles.statLabel}>{stat.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Access */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Hızlı Erişim</h2>
        <div className={styles.quickLinks}>
          {[
            { href: "/ugd/urun-listesi", label: "Ürün Listesi", desc: "Tüm ürünlere göz at", icon: "📦" },
            { href: "/ugd/formul-kontrol", label: "Formül Kontrol", desc: "Formül doğrulama", icon: "🧪" },
            { href: "/ugd/cosing", label: "Cosing", desc: "Bileşen veritabanı", icon: "🔬" },
            { href: "/ugd/yonetmelik", label: "Yönetmelik", desc: "Mevzuat takibi", icon: "📋" },
            { href: "/ugd/firma-listesi", label: "Firma Listesi", desc: "Tedarikçi firmaları", icon: "🏢" },
          ].map((link) => (
            <a key={link.href} href={link.href} className={styles.quickLink}>
              <span className={styles.quickLinkIcon}>{link.icon}</span>
              <div>
                <span className={styles.quickLinkLabel}>{link.label}</span>
                <span className={styles.quickLinkDesc}>{link.desc}</span>
              </div>
              <svg className={styles.quickLinkArrow} viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
