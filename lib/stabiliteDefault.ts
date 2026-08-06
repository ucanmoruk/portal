// Stabilite veri modeli + varsayılan config.
// Hem render (StabiliteReport) hem giriş ekranı (StabiliteEntryClient) buradan
// alır → önizlemede görünen testler girişte de otomatik gelir. Kayıt yoksa bu
// kullanılır; kullanıcı istediğini siler/ekler/düzenler.

export interface StabiliteTest {
  ad: string;
  adEn?: string;
  birim: string;
  metot: string;
  limit: string;
  akredite: boolean;                 // "*" ön eki + akredite kutu tetikler
  sonuclar: Record<string, string>;  // key: "1|25°C"
}
export interface StabiliteVeri {
  gunler: number[];
  sicakliklar: string[];
  degerlendirme: string;
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

// Varsayılan config — iletilen örnek Stabilite raporundan (26030055).
export const DEFAULT_STABILITE_VERI: StabiliteVeri = {
  gunler: _G,
  sicakliklar: _T,
  degerlendirme: STABILITE_DEGERLENDIRME_VARSAYILAN,
  testler: [
    { ad: "Aerobik Koloni Sayımı", birim: "kob/g", metot: "ISO 21149", limit: "1000", akredite: true, sonuclar: stabAyni(_G, _T, "<10") },
    { ad: "Küf - Maya Sayımı", birim: "kob/g", metot: "ISO 16212", limit: "1000", akredite: true, sonuclar: stabAyni(_G, _T, "<10") },
    { ad: "Pseudomonas aeruginosa", birim: "g", metot: "ISO 22717", limit: "Bulunmamalı", akredite: true, sonuclar: stabAyni(_G, _T, "Tespit Edilmedi") },
    { ad: "Candida albicans Aranması", birim: "g", metot: "ISO 18416", limit: "Bulunmamalı", akredite: true, sonuclar: stabAyni(_G, _T, "Tespit Edilmedi") },
    { ad: "Staphylococcus aureus", birim: "g", metot: "ISO 22718", limit: "Bulunmamalı", akredite: true, sonuclar: stabAyni(_G, _T, "Tespit Edilmedi") },
    { ad: "Escherichia coli Aranması", birim: "g", metot: "ISO 21150", limit: "Bulunmamalı", akredite: true, sonuclar: stabAyni(_G, _T, "Tespit Edilmedi") },
    { ad: "Renk", birim: "-", metot: "TS EN ISO 5492", limit: "Değişim Gözlenmemeli", akredite: true, sonuclar: stabAyni(_G, _T, "Değişim görülmedi") },
    { ad: "Koku", birim: "-", metot: "TS EN ISO 5492", limit: "Değişim Gözlenmemeli", akredite: true, sonuclar: stabAyni(_G, _T, "Değişim görülmedi") },
    { ad: "Görünüm", birim: "-", metot: "TS EN ISO 5492", limit: "Değişim Gözlenmemeli", akredite: true, sonuclar: stabAyni(_G, _T, "Değişim görülmedi") },
    { ad: "Ambalaj", birim: "-", metot: "Organoleptik", limit: "Çatlama, sızdırma olmamalı", akredite: false, sonuclar: stabAyni(_G, _T, "Değişim görülmedi") },
    { ad: "Faz Ayrımı", birim: "-", metot: "Organoleptik", limit: "Faz ayrımı olmamalı", akredite: false, sonuclar: stabAyni(_G, _T, "Gözlenmedi") },
    { ad: "pH Tayini", birim: "-", metot: "TS 518", limit: "-", akredite: true, sonuclar: { "1|4°C": "5,67", "1|25°C": "5,69", "1|45°C": "5,64", "90|4°C": "5,62", "90|25°C": "5,66", "90|45°C": "5,72" } },
    { ad: "Yoğunluk Tayini", birim: "g/cm³", metot: "OECD 109", limit: "-", akredite: true, sonuclar: { "1|4°C": "1,0109", "1|25°C": "1,0187", "1|45°C": "1,0182", "90|4°C": "1,0168", "90|25°C": "1,0070", "90|45°C": "1,0136" } },
  ],
};
