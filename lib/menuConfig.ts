// Tüm uygulamadaki menü ağacı — Sidebar ve Yetki sayfası bu kaynağı kullanır

export interface MenuItem {
  key: string;
  label: string;
  href?: string;
  children?: MenuItem[];
  /** true → Sadece yetki yönetiminde görünür, sidebar'da gizli (sayfa değil, aksiyon yetkisi) */
  virtual?: boolean;
}

export const MENU_TREE: MenuItem[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    href: "/",
  },
  {
    key: "ugd",
    label: "ÜGD Detayları",
    children: [
      { key: "ugd.urun-listesi",  label: "Ürün Listesi",  href: "/ugd/urun-listesi"  },
      { key: "ugd.cosing",        label: "Cosing",         href: "/ugd/cosing"         },
      { key: "ugd.yonetmelik",    label: "Yönetmelik",     href: "/ugd/yonetmelik"     },
      { key: "ugd.firma-listesi", label: "Firma Listesi",  href: "/ugd/firma-listesi"  },
      { key: "ugd.musteri-listesi", label: "Müşteri Listesi", href: "/ugd/musteri-listesi" },
      { key: "ugd.teklif-listesi", label: "Teklif Listesi", href: "/ugd/teklif-listesi" },
      { key: "ugd.hizmet-listesi", label: "Hizmet Listesi", href: "/ugd/hizmet-listesi" },
    ],
  },
  {
    key: "formul-kontrol",
    label: "Formül Kontrol",
    href: "/ugd/formul-kontrol",
  },
  {
    key: "musteriler",
    label: "Müşteriler",
    children: [
      { key: "musteriler.musteri-listesi",  label: "Müşteri Listesi",   href: "/musteriler/musteri-listesi"  },
      { key: "musteriler.teklif-listesi",   label: "Teklif Listesi",    href: "/musteriler/teklif-listesi"   },
      { key: "musteriler.proforma-listesi", label: "Proforma Listesi",  href: "/musteriler/proforma-listesi" },
      { key: "musteriler.analiz-talepleri", label: "Analiz Talepleri",  href: "/musteriler/analiz-talepleri" },
      { key: "musteriler.destek-talepleri", label: "Destek Talepleri",  href: "/musteriler/destek-talepleri" },
      { key: "musteriler.fatura-takip",     label: "Fatura Takip",      href: "/musteriler/fatura-takip"     },
      { key: "musteriler.belge-yukle",      label: "Belge Yükle",       href: "/musteriler/belge-yukle"      },
      { key: "musteriler.yuklenmis-belgeler", label: "Yüklenmiş Belgeler", href: "/musteriler/yuklenmis-belgeler" },
    ],
  },
  {
    key: "laboratuvar",
    label: "Laboratuvar",
    children: [
      { key: "laboratuvar.numune-takip",     label: "Numune Kabul",     href: "/laboratuvar/numune-takip"     },
      { key: "laboratuvar.numune-takip-lab", label: "Numune Takip",     href: "/laboratuvar/numune-takip-lab" },
      { key: "laboratuvar.rapor-takip",      label: "Rapor Takip",      href: "/laboratuvar/rapor-takip"      },
      { key: "laboratuvar.hizmet-listesi",   label: "Hizmet Listesi",   href: "/laboratuvar/hizmet-listesi"   },
      { key: "laboratuvar.hizmet-paketleri", label: "Hizmet Paketleri", href: "/laboratuvar/hizmet-paketleri" },
      { key: "laboratuvar.sonuc-giris",      label: "Sonuç Girişi",     href: "/laboratuvar/sonuc-giris"      },
      { key: "laboratuvar.analiz-numune-listesi", label: "Analiz - Numune Listesi", href: "/laboratuvar/analiz-numune-listesi" },
      { key: "laboratuvar.rapor-onayla",     label: "Rapor Onaylama",   href: "#",                            virtual: true },
    ],
  },
  {
    key: "laboratuvar.kys",
    label: "KYS",
    children: [
      { key: "laboratuvar.kys.stok-listesi", label: "Stok Listesi", href: "/laboratuvar/kys/stok-listesi" },
      { key: "laboratuvar.kys.laboratuvar-birimleri", label: "Laboratuvar Birimleri", href: "/laboratuvar/kys/laboratuvar-birimleri" },
      { key: "laboratuvar.kys.stok-hareketleri", label: "Stok Ekle / Düş", href: "/laboratuvar/kys/stok-hareketleri" },
      { key: "laboratuvar.kys.son-kullanim", label: "Son Kullanım Listesi", href: "/laboratuvar/kys/son-kullanim" },
      { key: "laboratuvar.kys.talep-listesi", label: "Talep Listesi", href: "/laboratuvar/kys/talep-listesi" },
    ],
  },
  {
    key: "eurolab",
    label: "Eurolab",
    children: [
      { key: "eurolab.metotlar",           label: "Metotlar",            href: "/laboratuvar/eurolab/metotlar" },
      { key: "eurolab.validasyon",         label: "Validasyon",          href: "/laboratuvar/eurolab/validasyon" },
      { key: "eurolab.qc-kartlar",         label: "QC Kartlar",          href: "/laboratuvar/eurolab/qc-kartlar" },
      { key: "eurolab.hamveri",            label: "Hamveri",             href: "/laboratuvar/eurolab/hamveri" },
      { key: "eurolab.hamveri-talimatlar", label: "Hamveri Talimatları", href: "/laboratuvar/eurolab/hamveri/talimatlar" },
      { key: "eurolab.gereklilik-gorselleri", label: "Gereklilik Görselleri", href: "/laboratuvar/eurolab/hamveri/gereklilik-gorselleri" },
      { key: "eurolab.olcum-belirsizligi", label: "Ölçüm Belirsizliği", href: "/laboratuvar/eurolab/olcum-belirsizligi" },
      { key: "eurolab.raporlar",           label: "Raporlar",            href: "/laboratuvar/eurolab/raporlar" },
    ],
  },
  {
    key: "spektrotek",
    label: "Spektrotek",
    children: [
      { key: "spektrotek.ozet",       label: "Dashboard",      href: "/laboratuvar/spektrotek"                },
      { key: "spektrotek.talepler",   label: "Talepler",       href: "/laboratuvar/spektrotek/talepler"       },
      { key: "spektrotek.teklifler",  label: "Teklifler",      href: "/laboratuvar/spektrotek/teklifler"      },
      { key: "spektrotek.teklif-detaylari", label: "Teklif Detayları", href: "/laboratuvar/spektrotek/teklif-detaylari" },
      { key: "spektrotek.musteriler", label: "Müşteriler",     href: "/laboratuvar/spektrotek/musteriler"     },
      { key: "spektrotek.urunler",    label: "Ürünler",        href: "/laboratuvar/spektrotek/urunler"        },
      { key: "spektrotek.faturalar",  label: "Faturalar",      href: "/laboratuvar/spektrotek/faturalar"      },
      { key: "spektrotek.satin-alma", label: "Satın Alma",     href: "/laboratuvar/spektrotek/satin-alma"     },
      { key: "spektrotek.servis",     label: "Servis",         href: "/laboratuvar/spektrotek/servis"         },
    ],
  },
  { key: "laboratuvar.root-kozmetik", label: "Root Kozmetik", href: "/laboratuvar/root-kozmetik" },
  {
    key: "admin",
    label: "Admin",
    children: [
      { key: "admin.yetki-listesi", label: "Yetki Listesi", href: "/admin/yetki-listesi" },
      { key: "admin.kullanici-listesi", label: "Kullanıcı Listesi", href: "/admin/kullanici-listesi" },
      { key: "admin.muhasebe", label: "Muhasebe", href: "/admin/muhasebe" },
      { key: "admin.finans", label: "Finans", href: "/admin/finans" },
      { key: "admin.veri-asistani", label: "Veri Asistanı", href: "/admin/veri-asistani" },
      { key: "admin.ayarlar", label: "Ayarlar", href: "/admin/ayarlar" },
    ],
  },
];

/** Tüm key'leri düz dizi olarak döner */
export function allMenuKeys(): string[] {
  const keys: string[] = [];
  const walk = (items: MenuItem[]) => {
    for (const item of items) {
      keys.push(item.key);
      if (item.children) walk(item.children);
    }
  };
  walk(MENU_TREE);
  return keys;
}

export function firstAllowedHref(keys: string[]): string | null {
  const allowed = new Set(keys);
  const walk = (items: MenuItem[]): string | null => {
    for (const item of items) {
      if (allowed.has(item.key) && item.href) return item.href;
      if (item.children) {
        const childHref = walk(item.children);
        if (childHref) return childHref;
      }
    }
    return null;
  };
  return walk(MENU_TREE);
}
