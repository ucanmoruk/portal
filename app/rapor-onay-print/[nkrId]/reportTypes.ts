export interface HizmetRow {
  Kod: string;
  Ad: string;
  Akreditasyon: string;
  Metot: string;
  Birim: string;
  LimitDeger: string | null;
  LOQ: string | null;
  Sonuc: string | null;
  Degerlendirme: string | null;
  Termin: string | null;
}

export interface RaporHeader {
  NkrID: number;
  RaporNo: string;
  Tarih: string | null;
  Numune_Adi: string;
  Numune_Adi_En: string | null;
  Urun_Tipi: string | null;
  TesteMiktar: string | null;
  TesteMiktarBirim: string | null;
  FirmaAd: string;
  FirmaAdres: string;
  FirmaYetkili: string;
  FirmaEmail: string;
  FirmaTelefon: string;
  Karar: string | null;
  Dil: string | null;
  SeriNo: string | null;
  UretimTarihi: string | null;
  SKT: string | null;
  Evrak_No: string;
}

export interface OnayInfo {
  token: string;
  durum: string;
  onayTarihi: string;
  yayinTarihi: string | null;
  yayinUrl: string | null;
  onaylayanAd: string | null;
  /** ÜGAM/RR26/XXXX — onay anında üretilir, migration 018 sonrası dolar. */
  disRaporKodu: string | null;
}

export interface ReportMeta {
  revNo: string;
  kabulTarihi: string;
  yayinTarihi: string;
  hazirlayanAd: string;
  hazirlayanUnvan: string;
  onaylayanAd: string;
  onaylayanUnvan: string;
  docKodu: string;
  sirketAdi: string;
}

export interface KarekodInfo {
  /** Karekodun gösterdiği public doğrulama adresi (query param'li, müşteri otomatik doğrulama formuna düşer). */
  url: string;
  /** QR kodun data URL'i (PNG, base64). Boşsa onay henüz yapılmamıştır. */
  qrDataUrl: string;
  /** Belge dijital imzası (SHA-256/HMAC hex) — varsa. */
  imzaHash: string | null;
  /** QR'ın altında müşteriye gösterilen 8 karakterli doğrulama kodu. Manuel doğrulamada bu kullanılır. */
  dogrulamaKod: string;
  /** Doğrulama sayfasında "Rapor No" alanına yazılacak değer (dış kod > iç kod). */
  raporNoForVerify: string;
}

export interface ReportFormatProps {
  nkrId: number;
  format: string;
  header: RaporHeader;
  hizmetler: HizmetRow[];
  testBaslangic: string | null;
  testBitis: string | null;
  onay: OnayInfo | null;
  meta: ReportMeta;
  karekod: KarekodInfo | null;
}
