export interface GrupTur {
  Grup: string;
  Tur: string;
}

export interface RUGDTipRow {
  ID: number;
  Kategori: string;
  UrunTipi: string;
  UygulamaBolgesi: string | null;
  ADegeri: string | null;
}

export interface PaketOpt {
  ID: number;
  ListeAdi: string;
  Aciklama?: string | null;
}

export interface LookupData {
  grupTurleri: GrupTur[];
  rUGDTipler: RUGDTipRow[];
  paketler: PaketOpt[];
}

export interface NkrFormData {
  Tarih: string;
  Barkod: string;
  Teklif_No: string;
  Talep_No: string;
  Evrak_No: string;
  RaporNo: string;
  Revno: string;
  Grup: string;
  Tur: string;
  Karar: string;
  Dil: string;
  Firma_ID: number | null;
  FirmaAd: string;
  ProjeID: number | null;
  ProjeAd: string;
  Numune_Adi: string;
  Numune_Adi_En: string;
  Miktar: string;
  Birim: string;
  TesteMiktar: string;
  TesteMiktarBirim: string;
  SeriNo: string;
  UretimTarihi: string;
  SKT: string;
  Aciklama: string;
  Urun_Tipi: string;
  UGDTip_Kategori: string;
  UGDTip_ID: number | null;
  Hedef_Grup: string;
  FotoFile: File | null;
  FotoPreview: string;
  FotoPath: string;
}

export interface HizmetRow {
  key: string;
  AnalizID: number;
  Termin: string;
  x3ID: number | null;
  Kod?: string;
  Ad?: string;
  Metot?: string;
  Sure?: number | null;
}

export interface FormulRow {
  key: string;
  HammaddeID: number | null;
  INCIName: string;
  Miktar: string;
  DaP: string;
  Noael: string;
  Cas?: string;
  Regulation?: string;
}

export function emptyForm(): NkrFormData {
  const today = new Date().toISOString().split("T")[0];
  return {
    Tarih: today,
    Barkod: "",
    Teklif_No: "",
    Talep_No: "",
    Evrak_No: "",
    RaporNo: "",
    Revno: "0",
    Grup: "Özel",
    Tur: "",
    Karar: "Basit Karar Kuralı",
    Dil: "Türkçe",
    Firma_ID: null,
    FirmaAd: "",
    ProjeID: null,
    ProjeAd: "",
    Numune_Adi: "",
    Numune_Adi_En: "",
    Miktar: "",
    Birim: "mL",
    TesteMiktar: "",
    TesteMiktarBirim: "Adet",
    SeriNo: "",
    UretimTarihi: "",
    SKT: "",
    Aciklama: "",
    Urun_Tipi: "",
    UGDTip_Kategori: "",
    UGDTip_ID: null,
    Hedef_Grup: "Yetişkinler",
    FotoFile: null,
    FotoPreview: "",
    FotoPath: "",
  };
}
