// Tüm uygulamadaki menü ağacı — Sidebar ve Yetki sayfası bu kaynağı kullanır

export interface MenuItem {
  key: string;
  label: string;
  href?: string;
  children?: MenuItem[];
}

export const MENU_TREE: MenuItem[] = [
  {
    key: "ugd",
    label: "ÜGD Detayları",
    children: [
      { key: "ugd.urun-listesi",  label: "Ürün Listesi",  href: "/ugd/urun-listesi"  },
      { key: "ugd.cosing",        label: "Cosing",         href: "/ugd/cosing"         },
      { key: "ugd.yonetmelik",    label: "Yönetmelik",     href: "/ugd/yonetmelik"     },
      { key: "ugd.firma-listesi", label: "Firma Listesi",  href: "/ugd/firma-listesi"  },
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
      { key: "musteriler.fatura-takip",     label: "Fatura Takip",      href: "/musteriler/fatura-takip"     },
    ],
  },
  {
    key: "laboratuvar",
    label: "Laboratuvar",
    children: [
      { key: "laboratuvar.numune-takip",     label: "Numune Kabul",     href: "/laboratuvar/numune-takip"     },
      { key: "laboratuvar.rapor-takip",      label: "Rapor Takip",      href: "/laboratuvar/rapor-takip"      },
      { key: "laboratuvar.sonuc-giris",      label: "Sonuç Girişi",     href: "/laboratuvar/sonuc-giris"      },
      { key: "laboratuvar.hizmet-listesi",   label: "Hizmet Listesi",   href: "/laboratuvar/hizmet-listesi"   },
      { key: "laboratuvar.hizmet-paketleri", label: "Hizmet Paketleri", href: "/laboratuvar/hizmet-paketleri" },
    ],
  },
  { key: "laboratuvar.kys", label: "KYS", href: "/laboratuvar/kys" },
  {
    key: "eurolab",
    label: "Eurolab",
    children: [
      { key: "eurolab.metotlar",           label: "Metotlar",            href: "/laboratuvar/eurolab/metotlar" },
      { key: "eurolab.validasyon",         label: "Validasyon",          href: "/laboratuvar/eurolab/validasyon" },
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
