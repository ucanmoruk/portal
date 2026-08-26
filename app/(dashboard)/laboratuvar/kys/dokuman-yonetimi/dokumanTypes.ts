import styles from "./dokumanYonetimi.module.css";

export const DOKUMAN_TURLERI = [
  "Prosedür",
  "Talimat",
  "SOP",
  "Form",
  "Liste",
  "Plan",
  "Politika",
  "Rehber",
] as const;

export const DOKUMAN_DURUMLARI = [
  "Taslak",
  "Kontrol Bekliyor",
  "Onay Bekliyor",
  "Yayında",
  "Revize Ediliyor",
  "Arşiv",
] as const;

export type DokumanTuru = (typeof DOKUMAN_TURLERI)[number];
export type DokumanDurumu = (typeof DOKUMAN_DURUMLARI)[number];

export type DokumanYetki = {
  goruntule: boolean;
  olustur: boolean;
  duzenle: boolean;
  kontrol: boolean;
  onayla: boolean;
  sil: boolean;
  isAdmin: boolean;
};

export const BOS_YETKI: DokumanYetki = {
  goruntule: false,
  olustur: false,
  duzenle: false,
  kontrol: false,
  onayla: false,
  sil: false,
  isAdmin: false,
};

export type DokumanOzet = {
  id: number;
  kod: string;
  baslik: string;
  tur: string;
  durum: DokumanDurumu;
  revizyon: number;
  revizyonEtiket: string;
  birimId: number | null;
  hazirlayanId: string;
  hazirlayanAd: string;
  kontrolEdenId: string;
  kontrolEdenAd: string;
  onaylayanId: string;
  onaylayanAd: string;
  yururlukTarihi: string | null;
  kontrolTarihi: string | null;
  onayTarihi: string | null;
  arsivTarihi: string | null;
  ozet: string;
  duzenlenebilir: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type DokumanRevizyon = {
  id: number;
  revizyon: number;
  revizyonEtiket: string;
  aciklama: string;
  yayinTarihi: string | null;
  hazirlayanAd: string;
  kontrolEdenAd: string;
  onaylayanAd: string;
  olusturanAd: string;
  createdAt: string | null;
};

export type DokumanLog = {
  id: number;
  islem: string;
  oncekiDurum: string;
  yeniDurum: string;
  revizyon: number | null;
  aciklama: string;
  kullaniciAd: string;
  createdAt: string | null;
};

export type DokumanDetay = DokumanOzet & {
  icerik: string;
  revizyonlar: DokumanRevizyon[];
  loglar: DokumanLog[];
};

export const statusTone: Record<string, string> = {
  "Taslak": styles.statusDraft,
  "Kontrol Bekliyor": styles.statusWaiting,
  "Onay Bekliyor": styles.statusWaiting,
  "Yayında": styles.statusLive,
  "Revize Ediliyor": styles.statusRevision,
  "Arşiv": styles.statusArchive,
};

export const errorMessage = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** ISO tarih/zaman → 24.08.2026 14:35 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ISO tarih → 24.08.2026 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(value);
}
