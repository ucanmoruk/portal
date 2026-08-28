// Stabilite veri modeli + varsayılan config.
// Hem render (StabiliteReport) hem giriş ekranı (StabiliteEntryClient) buradan
// alır → önizlemede görünen testler girişte de otomatik gelir. Kayıt yoksa bu
// kullanılır; kullanıcı istediğini siler/ekler/düzenler.

export interface StabiliteTest {
  ad: string;
  adEn?: string;
  birim: string;
  birimEn?: string;
  metot: string;
  metotEn?: string;
  limit: string;
  limitEn?: string;
  akredite: boolean;                 // "*" ön eki + akredite kutu tetikler
  sonuclar: Record<string, string>;  // key: "1|25°C"
  sonuclarEn?: Record<string, string>;
}
export interface StabiliteVeri {
  gunler: number[];
  sicakliklar: string[];
  degerlendirme: string;
  degerlendirmeEn?: string;
  testler: StabiliteTest[];
}

// Tüm gün/sıcaklık kombinasyonuna aynı değeri yaz (mikro/organoleptik testler).
export function stabAyni(gunler: number[], sicakliklar: string[], v: string): Record<string, string> {
  const o: Record<string, string> = {};
  for (const g of gunler) for (const s of sicakliklar) o[`${g}|${s}`] = v;
  return o;
}

const _G = [1, 90];
const _T = ["4°C", "25°C", "45°C"];

export const STABILITE_DEGERLENDIRME_VARSAYILAN =
  "90 günlük hızlandırılmış stabilite testi sonucunda ürünün ilgili limitlere uygun olduğu ve stabil olduğu gözlemlendi.";
export const STABILITE_DEGERLENDIRME_VARSAYILAN_EN =
  "As a result of the 90-day accelerated stability test, the product was observed to comply with the relevant limits and remain stable.";

// Varsayılan config — iletilen örnek Stabilite raporundan (26030055).
export const DEFAULT_STABILITE_VERI: StabiliteVeri = {
  gunler: _G,
  sicakliklar: _T,
  degerlendirme: STABILITE_DEGERLENDIRME_VARSAYILAN,
  degerlendirmeEn: STABILITE_DEGERLENDIRME_VARSAYILAN_EN,
  testler: [
    { ad: "Aerobik Koloni Sayımı", adEn: "Aerobic Colony Count", birim: "kob/g", birimEn: "cfu/g", metot: "ISO 21149", limit: "1000", akredite: true, sonuclar: stabAyni(_G, _T, "<10") },
    { ad: "Küf - Maya Sayımı", adEn: "Yeast and Mold Count", birim: "kob/g", birimEn: "cfu/g", metot: "ISO 16212", limit: "1000", akredite: true, sonuclar: stabAyni(_G, _T, "<10") },
    { ad: "Pseudomonas aeruginosa", adEn: "Pseudomonas aeruginosa", birim: "g", metot: "ISO 22717", limit: "Bulunmamalı", limitEn: "Absent", akredite: true, sonuclar: stabAyni(_G, _T, "Tespit Edilmedi"), sonuclarEn: stabAyni(_G, _T, "Not Detected") },
    { ad: "Candida albicans Aranması", adEn: "Detection of Candida albicans", birim: "g", metot: "ISO 18416", limit: "Bulunmamalı", limitEn: "Absent", akredite: true, sonuclar: stabAyni(_G, _T, "Tespit Edilmedi"), sonuclarEn: stabAyni(_G, _T, "Not Detected") },
    { ad: "Staphylococcus aureus", adEn: "Staphylococcus aureus", birim: "g", metot: "ISO 22718", limit: "Bulunmamalı", limitEn: "Absent", akredite: true, sonuclar: stabAyni(_G, _T, "Tespit Edilmedi"), sonuclarEn: stabAyni(_G, _T, "Not Detected") },
    { ad: "Escherichia coli Aranması", adEn: "Detection of Escherichia coli", birim: "g", metot: "ISO 21150", limit: "Bulunmamalı", limitEn: "Absent", akredite: true, sonuclar: stabAyni(_G, _T, "Tespit Edilmedi"), sonuclarEn: stabAyni(_G, _T, "Not Detected") },
    { ad: "Renk", adEn: "Color", birim: "-", metot: "TS EN ISO 5492", limit: "Değişim Gözlenmemeli", limitEn: "No change should be observed", akredite: true, sonuclar: stabAyni(_G, _T, "Değişim görülmedi"), sonuclarEn: stabAyni(_G, _T, "No change observed") },
    { ad: "Koku", adEn: "Odor", birim: "-", metot: "TS EN ISO 5492", limit: "Değişim Gözlenmemeli", limitEn: "No change should be observed", akredite: true, sonuclar: stabAyni(_G, _T, "Değişim görülmedi"), sonuclarEn: stabAyni(_G, _T, "No change observed") },
    { ad: "Görünüm", adEn: "Appearance", birim: "-", metot: "TS EN ISO 5492", limit: "Değişim Gözlenmemeli", limitEn: "No change should be observed", akredite: true, sonuclar: stabAyni(_G, _T, "Değişim görülmedi"), sonuclarEn: stabAyni(_G, _T, "No change observed") },
    { ad: "Ambalaj", adEn: "Packaging", birim: "-", metot: "Organoleptik", metotEn: "Organoleptic", limit: "Çatlama, sızdırma olmamalı", limitEn: "No cracking or leakage should occur", akredite: false, sonuclar: stabAyni(_G, _T, "Değişim görülmedi"), sonuclarEn: stabAyni(_G, _T, "No change observed") },
    { ad: "Faz Ayrımı", adEn: "Phase Separation", birim: "-", metot: "Organoleptik", metotEn: "Organoleptic", limit: "Faz ayrımı olmamalı", limitEn: "No phase separation should occur", akredite: false, sonuclar: stabAyni(_G, _T, "Gözlenmedi"), sonuclarEn: stabAyni(_G, _T, "Not observed") },
    { ad: "pH Tayini", adEn: "pH Determination", birim: "-", metot: "TS 518", limit: "-", akredite: true, sonuclar: { "1|4°C": "5,67", "1|25°C": "5,69", "1|45°C": "5,64", "90|4°C": "5,62", "90|25°C": "5,66", "90|45°C": "5,72" } },
    { ad: "Yoğunluk Tayini", adEn: "Density Determination", birim: "g/cm³", metot: "OECD 109", limit: "-", akredite: true, sonuclar: { "1|4°C": "1,0109", "1|25°C": "1,0187", "1|45°C": "1,0182", "90|4°C": "1,0168", "90|25°C": "1,0070", "90|45°C": "1,0136" } },
  ],
};
