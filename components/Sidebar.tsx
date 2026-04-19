"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Sidebar.module.css";

interface NavItem {
  label: string;
  href: string;
  menuKey: string;
}

interface NavGroup {
  id: string;
  menuKey: string;
  label: string;
  icon: React.ReactNode;
  items: NavItem[];
}

interface Props {
  allowedKeys: string[]; // DB'den gelen yetkiler — boşsa kısıtlama yok
  isAdmin: boolean;
}

const navGroups: NavGroup[] = [
  {
    id: "ugd",
    menuKey: "ugd",
    label: "ÜGD Detayları",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
        <path fillRule="evenodd" d="M2 4.25A2.25 2.25 0 0 1 4.25 2h11.5A2.25 2.25 0 0 1 18 4.25v8.5A2.25 2.25 0 0 1 15.75 15h-3.105a3.501 3.501 0 0 0 1.1 1.677A.75.75 0 0 1 13.26 18H6.74a.75.75 0 0 1-.484-1.323A3.501 3.501 0 0 0 7.355 15H4.25A2.25 2.25 0 0 1 2 12.75v-8.5Zm1.5 0a.75.75 0 0 1 .75-.75h11.5a.75.75 0 0 1 .75.75v7.5a.75.75 0 0 1-.75.75H4.25a.75.75 0 0 1-.75-.75v-7.5Z" clipRule="evenodd" />
      </svg>
    ),
    items: [
      { label: "Ürün Listesi",  href: "/ugd/urun-listesi",  menuKey: "ugd.urun-listesi"  },
      { label: "Cosing",        href: "/ugd/cosing",         menuKey: "ugd.cosing"         },
      { label: "Yönetmelik",    href: "/ugd/yonetmelik",     menuKey: "ugd.yonetmelik"     },
      { label: "Firma Listesi", href: "/ugd/firma-listesi",  menuKey: "ugd.firma-listesi"  },
    ],
  },
  {
    id: "musteriler",
    menuKey: "musteriler",
    label: "Müşteriler",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
        <path d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM14.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.615 16.428a1.224 1.224 0 0 1-.569-1.175 6.002 6.002 0 0 1 11.908 0 1.224 1.224 0 0 1-.569 1.175A9.953 9.953 0 0 1 7 18a9.953 9.953 0 0 1-5.385-1.572ZM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 0 0-1.588-3.755 4.502 4.502 0 0 1 5.874 2.636.818.818 0 0 1-.36.98A7.465 7.465 0 0 1 14.5 16Z" />
      </svg>
    ),
    items: [
      { label: "Müşteri Listesi",  href: "/musteriler/musteri-listesi",  menuKey: "musteriler.musteri-listesi"  },
      { label: "Teklif Listesi",   href: "/musteriler/teklif-listesi",   menuKey: "musteriler.teklif-listesi"   },
      { label: "Proforma Listesi", href: "/musteriler/proforma-listesi", menuKey: "musteriler.proforma-listesi" },
      { label: "Fatura Takip",     href: "/musteriler/fatura-takip",     menuKey: "musteriler.fatura-takip"     },
    ],
  },
  {
    id: "laboratuvar",
    menuKey: "laboratuvar",
    label: "Laboratuvar",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
        <path fillRule="evenodd" d="M7 2a1 1 0 0 0-1 1v5.172a3 3 0 0 1-.879 2.12L3.293 12.12A1 1 0 0 0 4 13.828h12a1 1 0 0 0 .707-1.707L14.88 10.293A3 3 0 0 1 14 8.172V3a1 1 0 0 0-1-1H7Zm1 1.5h4v4.672a4.5 4.5 0 0 0 1.318 3.182l.65.646H6.032l.65-.646A4.5 4.5 0 0 0 8 7.172V3.5ZM7.25 15a.75.75 0 0 0 0 1.5h5.5a.75.75 0 0 0 0-1.5h-5.5Z" clipRule="evenodd" />
      </svg>
    ),
    items: [
      { label: "Numune Kabul",      href: "/laboratuvar/numune-takip",    menuKey: "laboratuvar.numune-takip"    },
      { label: "Hizmet Listesi",    href: "/laboratuvar/hizmet-listesi",  menuKey: "laboratuvar.hizmet-listesi"  },
      { label: "Hizmet Paketleri",  href: "/laboratuvar/hizmet-paketleri", menuKey: "laboratuvar.hizmet-paketleri" },
      { label: "Sonuç Girişi",      href: "/laboratuvar/sonuc-giris",     menuKey: "laboratuvar.sonuc-giris"     },
      { label: "Rapor Takip",       href: "/laboratuvar/rapor-takip",     menuKey: "laboratuvar.rapor-takip"     },
    ],
  },
  {
    id: "spektrotek",
    menuKey: "spektrotek",
    label: "Spektrotek",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
        <path d="M10 1a6 6 0 0 0-3.815 10.641 1 1 0 0 1 .315.728V13a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-.631a1 1 0 0 1 .315-.728A6 6 0 0 0 10 1ZM8.5 15a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1h-3Zm.5 2.5a1 1 0 0 0 1 1 1 1 0 0 0 1-1H9Z" />
      </svg>
    ),
    items: [
      { label: "Dashboard",   href: "/laboratuvar/spektrotek",           menuKey: "spektrotek.ozet"      },
      { label: "Talepler",     href: "/laboratuvar/spektrotek/talepler",  menuKey: "spektrotek.talepler"  },
      { label: "Teklifler",    href: "/laboratuvar/spektrotek/teklifler", menuKey: "spektrotek.teklifler" },
      { label: "Teklif Detayları", href: "/laboratuvar/spektrotek/teklif-detaylari", menuKey: "spektrotek.teklif-detaylari" },
      { label: "Müşteriler",   href: "/laboratuvar/spektrotek/musteriler", menuKey: "spektrotek.musteriler" },
      { label: "Ürünler",      href: "/laboratuvar/spektrotek/urunler",    menuKey: "spektrotek.urunler"    },
      { label: "Faturalar",    href: "/laboratuvar/spektrotek/faturalar",  menuKey: "spektrotek.faturalar"  },
      { label: "Satın Alma",   href: "/laboratuvar/spektrotek/satin-alma", menuKey: "spektrotek.satin-alma" },
      { label: "Servis",       href: "/laboratuvar/spektrotek/servis",     menuKey: "spektrotek.servis"     },
    ],
  },
  {
    id: "root-kozmetik",
    menuKey: "laboratuvar.root-kozmetik",
    label: "Root Kozmetik",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
        <path fillRule="evenodd" d="M9.664 1.319a.75.75 0 0 1 .672 0 41.059 41.059 0 0 1 8.198 5.424.75.75 0 0 1-.254 1.285 31.372 31.372 0 0 0-7.86 3.83.75.75 0 0 1-.84 0 31.508 31.508 0 0 0-2.08-1.287V9.394c0-.244.116-.463.302-.592a35.504 35.504 0 0 1 3.305-2.033.75.75 0 0 0-.714-1.319 37 37 0 0 0-3.446 2.12A2.216 2.216 0 0 0 6 9.393v.38a31.293 31.293 0 0 0-4.28-1.746.75.75 0 0 1-.254-1.285 41.059 41.059 0 0 1 8.198-5.424ZM6 11.459a29.848 29.848 0 0 0-2.455-1.158 41.029 41.029 0 0 0-.39 3.114.75.75 0 0 0 .419.74c.528.256 1.046.53 1.554.82-.21.324-.455.63-.739.914a.75.75 0 1 0 1.06 1.06c.37-.369.69-.77.96-1.193a26.61 26.61 0 0 1 3.095 2.348.75.75 0 0 0 .992 0 26.547 26.547 0 0 1 5.93-3.95.75.75 0 0 0 .42-.739 41.053 41.053 0 0 0-.39-3.114 29.925 29.925 0 0 0-5.199 2.801 2.25 2.25 0 0 1-2.514 0c-.41-.275-.826-.541-1.247-.798Z" clipRule="evenodd" />
      </svg>
    ),
    items: [
      { label: "Teklif Listesi", href: "/laboratuvar/root-kozmetik/teklif-listesi", menuKey: "laboratuvar.root-kozmetik.teklif-listesi" },
    ],
  },
];

/** Laboratuvar grubundan sonra — üst düzey (tek satır) menü */
const topLevelAfterLaboratuvar: NavItem[] = [
  { label: "KYS", href: "/laboratuvar/kys", menuKey: "laboratuvar.kys" },
];

/** Gezilen sayfaya ait tek bir accordion grubu (üst menü linkleri hariç). */
function groupIdForPath(path: string): string | null {
  if (path.startsWith("/admin")) return "admin";
  if (path.startsWith("/ugd/formul-kontrol")) return "ugd";
  if (path.startsWith("/laboratuvar/numune-form")) return "laboratuvar";
  if (path.startsWith("/laboratuvar/spektrotek")) return "spektrotek";
  if (path.startsWith("/laboratuvar/root-kozmetik")) return "root-kozmetik";
  for (const g of navGroups) {
    if (g.items.some(item => path === item.href || path.startsWith(`${item.href}/`))) return g.id;
  }
  return null;
}

function openGroupsForPath(path: string): string[] {
  const id = groupIdForPath(path);
  return id ? [id] : [];
}

export default function Sidebar({ allowedKeys, isAdmin }: Props) {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<string[]>(() => openGroupsForPath(pathname));

  useEffect(() => {
    setOpenGroups(openGroupsForPath(pathname));
  }, [pathname]);

  // allowedKeys boşsa → kısıtlama yok (henüz yetki tanımlanmamış kullanıcı)
  const noRestriction = allowedKeys.length === 0;
  const allowed       = new Set(allowedKeys);

  const canSee = (key: string) => noRestriction || allowed.has(key);

  const toggleGroup = (id: string) =>
    setOpenGroups(prev => (prev.length === 1 && prev[0] === id ? [] : [id]));

  const isGroupActive = (group: NavGroup) =>
    group.items.some(item => pathname.startsWith(item.href));

  return (
    <aside className={styles.sidebar}>
      {/* Logo */}
      <div className={styles.brand}>
        <div className={styles.brandIcon}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M9.5 3A6.5 6.5 0 0 1 16 9.5c0 1.61-.59 3.09-1.56 4.23l.27.27h.79l5 5-1.5 1.5-5-5v-.79l-.27-.27A6.516 6.516 0 0 1 9.5 16 6.5 6.5 0 0 1 3 9.5 6.5 6.5 0 0 1 9.5 3m0 2C7 5 5 7 5 9.5S7 14 9.5 14 14 12 14 9.5 12 5 9.5 5z"/>
          </svg>
        </div>
        <div className={styles.brandText}>
          <span className={styles.brandName}>ÜGD Portal</span>
          <span className={styles.brandSub}>Laboratuvar Sistemi</span>
        </div>
      </div>

      <div className={styles.divider} />

      <nav className={styles.nav}>
        {/* Dashboard — her zaman görünür */}
        <Link href="/" className={`${styles.navLink} ${pathname === "/" ? styles.navLinkActive : ""}`}>
          <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
            <path fillRule="evenodd" d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z" clipRule="evenodd" />
          </svg>
          <span>Dashboard</span>
        </Link>

        {/* Geliştirme Planı — her zaman görünür */}
        <Link href="/plan" className={`${styles.navLink} ${pathname === "/plan" ? styles.navLinkActive : ""}`}>
          <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
            <path fillRule="evenodd" d="M4.5 2A2.5 2.5 0 0 0 2 4.5v11A2.5 2.5 0 0 0 4.5 18h11a2.5 2.5 0 0 0 2.5-2.5V7.621a2.5 2.5 0 0 0-.732-1.768l-2.621-2.621A2.5 2.5 0 0 0 12.379 2H4.5Zm10.06 4.5-2.56-2.56a1 1 0 0 0-.5-.25v2.81h2.81a1 1 0 0 0-.25-.5ZM13.5 10a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 13.5 10Zm-3.75 2a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5a.75.75 0 0 1 .75-.75Zm-3.75-.5a.75.75 0 0 1 .75.75v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
          </svg>
          <span>Geliştirme Planı</span>
        </Link>

        {/* Gruplar — yetki filtrelidir */}
        {navGroups.map(group => {
          // Grubun görünmesi için: parent key veya en az 1 child key yetkili olmalı
          const visibleItems = group.items.filter(item => canSee(item.menuKey));
          const groupVisible = canSee(group.menuKey) || visibleItems.length > 0;
          if (!groupVisible) return null;

          const isOpen  = openGroups.includes(group.id);
          const active  = isGroupActive(group);

          return (
            <div key={group.id} className={styles.navGroup}>
              <button
                className={`${styles.navGroupHeader} ${active ? styles.navGroupHeaderActive : ""}`}
                onClick={() => toggleGroup(group.id)}
                aria-expanded={isOpen}
              >
                <span className={styles.navGroupHeaderLeft}>
                  {group.icon}
                  <span>{group.label}</span>
                </span>
                <svg className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`} viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                  <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
              </button>

              {isOpen && visibleItems.length > 0 && (
                <div className={styles.navGroupItems}>
                  {visibleItems.map(item => {
                    const isActive = item.href === "/laboratuvar/spektrotek"
                      ? pathname === item.href
                      : pathname === item.href || pathname.startsWith(item.href + "/");
                    return (
                      <Link key={item.href} href={item.href}
                        className={`${styles.navSubLink} ${isActive ? styles.navSubLinkActive : ""}`}
                      >
                        <span className={styles.navSubDot} />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}

              {/* Formül Kontrol — ÜGD grubunun hemen altına */}
              {group.id === "ugd" && canSee("formul-kontrol") && (
                <Link
                  href="/ugd/formul-kontrol"
                  className={`${styles.navLink} ${
                    pathname.startsWith("/ugd/formul-kontrol") ? styles.navLinkActive : ""
                  }`}
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                    <path fillRule="evenodd" d="M4.5 2A2.5 2.5 0 0 0 2 4.5v11A2.5 2.5 0 0 0 4.5 18h11a2.5 2.5 0 0 0 2.5-2.5V7.621a2.5 2.5 0 0 0-.732-1.768l-2.621-2.621A2.5 2.5 0 0 0 12.379 2H4.5Zm4.75 5.75a.75.75 0 0 0-1.5 0v1.5h-1.5a.75.75 0 0 0 0 1.5h1.5v1.5a.75.75 0 0 0 1.5 0v-1.5h1.5a.75.75 0 0 0 0-1.5h-1.5v-1.5Zm3.25 4.5a.75.75 0 1 0 0 1.5h1.5a.75.75 0 0 0 0-1.5h-1.5Z" clipRule="evenodd" />
                  </svg>
                  <span>Formül Kontrol</span>
                </Link>
              )}
            </div>
          );
        })}

        {topLevelAfterLaboratuvar.filter(item => canSee(item.menuKey)).map(item => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navLink} ${isActive ? styles.navLinkActive : ""}`}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden>
                <path fillRule="evenodd" d="M4.5 2A2.5 2.5 0 0 0 2 4.5v11A2.5 2.5 0 0 0 4.5 18h11a2.5 2.5 0 0 0 2.5-2.5v-9A2.5 2.5 0 0 0 15.268 4.73L12.647 2.11A2.5 2.5 0 0 0 10.379 1H4.5Zm1.75 6a.75.75 0 0 0 0 1.5h8a.75.75 0 0 0 0-1.5h-8Zm0 3.5a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5h-5Z" clipRule="evenodd" />
              </svg>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* ── Admin — sadece isAdmin kullanıcısında görünür ── */}
      {isAdmin && (
        <>
          <div className={styles.divider} style={{ marginTop: "auto", marginBottom: 8 }} />
          <nav className={styles.nav} style={{ paddingBottom: 12 }}>
            <div className={styles.navGroup}>
              <button
                className={`${styles.navGroupHeader} ${pathname.startsWith("/admin") ? styles.navGroupHeaderActive : ""}`}
                onClick={() => toggleGroup("admin")}
                aria-expanded={openGroups.includes("admin")}
              >
                <span className={styles.navGroupHeaderLeft}>
                  <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
                  </svg>
                  <span>Admin</span>
                </span>
                <svg className={`${styles.chevron} ${openGroups.includes("admin") ? styles.chevronOpen : ""}`} viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                  <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
              </button>

              {openGroups.includes("admin") && (
                <div className={styles.navGroupItems}>
                  <Link href="/admin/yetki-listesi"
                    className={`${styles.navSubLink} ${pathname.startsWith("/admin/yetki-listesi") ? styles.navSubLinkActive : ""}`}
                  >
                    <span className={styles.navSubDot} />
                    Yetki Listesi
                  </Link>
                  <Link href="/admin/muhasebe"
                    className={`${styles.navSubLink} ${pathname.startsWith("/admin/muhasebe") ? styles.navSubLinkActive : ""}`}
                  >
                    <span className={styles.navSubDot} />
                    Muhasebe
                  </Link>
                  <Link href="/admin/ayarlar"
                    className={`${styles.navSubLink} ${pathname.startsWith("/admin/ayarlar") ? styles.navSubLinkActive : ""}`}
                  >
                    <span className={styles.navSubDot} />
                    Ayarlar
                  </Link>
                </div>
              )}
            </div>
          </nav>
        </>
      )}
    </aside>
  );
}
