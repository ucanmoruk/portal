import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import poolPromise from "@/lib/db";
import { firstAllowedHref } from "@/lib/menuConfig";
import { getDashboardOverview, type RankedMetric } from "@/lib/dashboardOverview";
import styles from "./page.module.css";

export const metadata = {
  title: "Dashboard",
};

const ADMIN_USER_IDS = new Set(["2"]);
type SessionUser = { userId?: string | number | null };

function formatRankValue(row: RankedMetric, mode: "count" | "money") {
  if (mode === "money") {
    return `${Number(row.amount || 0).toLocaleString("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} TL`;
  }
  return `${Number(row.value || 0).toLocaleString("tr-TR")} adet`;
}

function RankingCard({
  title,
  rows,
  mode = "count",
}: {
  title: string;
  rows: RankedMetric[];
  mode?: "count" | "money";
}) {
  return (
    <div className={styles.rankCard}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.rankList}>
        {rows.length === 0 ? (
          <div className={styles.emptyState}>Veri bulunamadi.</div>
        ) : rows.map((row, index) => (
          <div key={`${title}-${index}-${row.label}`} className={styles.rankRow}>
            <span className={styles.rankNo}>{index + 1}</span>
            <div className={styles.rankMain}>
              <span className={styles.rankLabel}>{row.label}</span>
              {row.sub && <span className={styles.rankSub}>{row.sub}</span>}
            </div>
            <span className={styles.rankValue}>{formatRankValue(row, mode)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const userId = String((session.user as SessionUser)?.userId || "");
  const isAdmin = userId ? ADMIN_USER_IDS.has(userId) : false;

  if (!isAdmin) {
    let allowedKeys: string[] = [];
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input("userId", userId ? parseInt(userId) : 0)
        .query("SELECT MenuKey FROM PortalYetki WHERE KullaniciID = @userId");
      allowedKeys = result.recordset.map((r: { MenuKey: string }) => r.MenuKey);
    } catch {
      allowedKeys = [];
    }

    if (!allowedKeys.includes("dashboard")) {
      const fallbackHref = firstAllowedHref(allowedKeys);
      if (fallbackHref) redirect(fallbackHref);

      return (
        <div className={styles.page}>
          <div className={styles.welcomeBanner}>
            <div>
              <h1 className={styles.welcomeTitle}>Yetki tanimli degil</h1>
              <p className={styles.welcomeSubtitle}>
                Bu kullanici icin goruntulenebilir bir menu yetkisi bulunmuyor.
              </p>
            </div>
          </div>
        </div>
      );
    }
  }

  const overview = await getDashboardOverview();

  return (
    <div className={styles.page}>
      <div className={styles.welcomeBanner}>
        <div>
          <h1 className={styles.welcomeTitle}>
            Hos Geldiniz, {session?.user?.name?.split(" ")[0]}
          </h1>
          <p className={styles.welcomeSubtitle}>
            Laboratuvar, fatura ve musteri hareketlerini tek ekrandan ozetleyin.
          </p>
        </div>
        <div className={styles.welcomeBadge}>
          <span className={styles.badgeDot} />
          Sistem Aktif
        </div>
      </div>

      <div className={styles.statsGrid}>
        {overview.cards.map((stat) => (
          <div
            key={stat.label}
            className={styles.statCard}
            style={{ "--stat-color": stat.color } as React.CSSProperties}
          >
            <div className={styles.statIcon} style={{ background: `${stat.color}15`, color: stat.color }}>
              #
            </div>
            <div className={styles.statBody}>
              <span className={styles.statValue}>{stat.value}</span>
              <span className={styles.statLabel}>{stat.label}</span>
              <span className={styles.statSub}>{stat.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {overview.error && (
        <div className={styles.errorPanel}>
          Dashboard verileri alinamadi: {overview.error}
        </div>
      )}

      <div className={styles.rankGrid}>
        <RankingCard title="Bu Ay En Cok Yapilan 10 Test" rows={overview.topTestsThisMonth} />
        <RankingCard title="Son 1 Yilda En Cok Yapilan Testler" rows={overview.topTestsLastYear} />
        <RankingCard title="En Yuksek Ciroya Sahip 10 Firma" rows={overview.topRevenueFirms} mode="money" />
        <RankingCard title="En Cok Numuneye Sahip 10 Firma" rows={overview.topSampleFirms} />
        <RankingCard title="Is Gelistirme: Takip Edilecek Firmalar" rows={overview.followUpFirms} />
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Hizli Erisim</h2>
        <div className={styles.quickLinks}>
          {[
            { href: "/ugd/urun-listesi", label: "Ürün Listesi", desc: "Tüm ürünlere göz at", icon: "ÜR" },
            { href: "/ugd/formul-kontrol", label: "Formül Kontrol", desc: "Formül doğrulama", icon: "FK" },
            { href: "/ugd/cosing", label: "Cosing", desc: "Bileşen veritabanı", icon: "CO" },
            { href: "/ugd/yonetmelik", label: "Yönetmelik", desc: "Mevzuat takibi", icon: "YN" },
            { href: "/ugd/firma-listesi", label: "Firma Listesi", desc: "Tedarikçi firmaları", icon: "FL" },
            { href: "/musteriler/fatura-takip", label: "Fatura Takip", desc: "Fatura ve odeme durumu", icon: "FT" },
            { href: "/laboratuvar/numune-takip-lab", label: "Numune Takip", desc: "Laboratuvar akisi", icon: "NT" },
            { href: "/laboratuvar/analiz-numune-listesi", label: "Analiz - Numune", desc: "Hizmet bazli liste", icon: "AN" },
            { href: "/admin/veri-asistani", label: "Veri Asistanı", desc: "MySQL verileriyle soru sor", icon: "AI" },
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
