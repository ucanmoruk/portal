export interface AltParametreRow {
  AltParametreID?: number | null;
  BilesenAdi: string;
  BilesenAdiEn: string;
  Birim: string;
  BirimEn: string;
  LOQ: string;
  LOQEn: string;
  Limit: string;
  LimitEn: string;
  /** Per-rapor girilen sonuç (NumuneX1AltParametre) — girilmemişse boş. */
  Sonuc?: string;
  SonucEn?: string;
  Degerlendirme?: string;
}

export interface HizmetRow {
  AnalizID: number;
  X1ID?: number;
  RaporSira?: number | null;
  Kod: string;
  Ad: string;
  AdEn?: string | null;
  Akreditasyon: string;
  Metot: string;
  MetotEn?: string | null;
  Birim: string;
  BirimEn?: string | null;
  LimitDeger: string | null;
  LimitEn?: string | null;
  LOQ: string | null;
  LOQEn?: string | null;
  Sonuc: string | null;
  SonucEn?: string | null;
  Degerlendirme: string | null;
  DegerlendirmeEn?: string | null;
  Termin: string | null;
  /** Hizmete bağlı alt parametreler/bileşenler (StokAnalizAltParametre). */
  altParametreler?: AltParametreRow[];
}

export interface RaporHeader {
  NkrID: number;
  RaporNo: string;
  /** Revizyon numarası (NKR.Revno, metin). Boş/null → 0. */
  Revno?: string | null;
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
  /** "AÇIKLAMALAR" başlığı altındaki serbest metin. Düzenleme ekranından girilir;
   *  boşsa rapor varsayılan açıklama cümlesine düşer (DB kolonu değildir, edit payload'da taşınır). */
  Aciklamalar?: string | null;
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
  /** Revize açıklaması (NKR_RaporOnay.Notlar) — revize edilmiş raporlarda dolu. */
  notlar?: string | null;
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
  /** Revize açıklaması — revize edilmiş raporlarda (revNo > 0) gösterilir. */
  revizeNot?: string | null;
  /** Stabilite formatı için kayıtlı matris verisi (NKR_StabiliteVeri.VeriJson parse edilmiş). */
  stabiliteVeri?: unknown;
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

// Rapor düzenleme (WYSIWYG) modunda formata geçirilen handler'lar. `edit`
// verilmişse format bileşeni metin yerine inline input/select render eder ve
// satır ekle/sil kontrolleri gösterir. Önizleme/PDF tarafında `edit` verilmez →
// görünüm birebir aynı kalır.
export interface ReportEditHandlers {
  onHeaderChange: (patch: Partial<RaporHeader>) => void;
  onRowChange: (index: number, patch: Partial<HizmetRow>) => void;
  onAddRow: () => void;
  onRemoveRow: (index: number) => void;
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
  /** Düzenleme modu — verilirse rapor inline düzenlenebilir hale gelir. */
  edit?: ReportEditHandlers;
  /** Düzenleme ekranında onay toolbar'ı gizlenir (kendi toolbar'ı vardır). */
  hideToolbar?: boolean;
}
