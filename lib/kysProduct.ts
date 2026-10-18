export const PRODUCT_CURRENCIES = ["EUR", "USD", "TRY", "GBP"] as const;
export const PRODUCT_AVAILABILITY = ["Stoktan", "Tedarik süreli", "Teklif ile"] as const;

export type KysProduct = {
  kategori: string;
  marka: string;
  satisFiyati: number | null;
  listeFiyati: number | null;
  paraBirimi: string;
  kdvOrani: number | null;
  kisaAciklama: string;
  urunAciklamasi: string;
  tedarikDurumu: string;
  teslimSuresi: string;
  webSecili: boolean;
  webUrunId: string;
  webSlug: string;
  referansFiyat: string;
  icNotlar: string;
  arastirmaKaynaklari: string[];
  aktarimKimligi: string;
};

export const emptyKysProduct: KysProduct = {
  kategori: "", marka: "", satisFiyati: null, listeFiyati: null,
  paraBirimi: "EUR", kdvOrani: null, kisaAciklama: "", urunAciklamasi: "",
  tedarikDurumu: "Stoktan", teslimSuresi: "", webSecili: false, webUrunId: "", webSlug: "",
  referansFiyat: "", icNotlar: "", arastirmaKaynaklari: [], aktarimKimligi: "",
};

function amount(value: unknown, label: string, max = 9999999999.99): number | null {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error(`${label}: en fazla iki ondalıklı, negatif olmayan bir sayı girin.`);
  const number = Number(normalized);
  if (!Number.isFinite(number) || number > max) throw new Error(`${label} geçersiz.`);
  return number;
}

/** Full product document; omitted `urun` on stock updates preserves the stored document. */
export function normalizeKysProduct(input: unknown, source: string): KysProduct {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Ürün bilgileri geçersiz.");
  const data = input as Record<string, unknown>;
  const product = { ...emptyKysProduct };
  for (const [key, limit] of [["kategori", 160], ["marka", 160], ["kisaAciklama", 1000], ["urunAciklamasi", 30000], ["teslimSuresi", 160], ["webUrunId", 120], ["webSlug", 180], ["referansFiyat", 160], ["icNotlar", 8000], ["aktarimKimligi", 120]] as const) {
    product[key] = String(data[key] ?? "").trim();
    if (product[key].length > limit) throw new Error(`${key} en fazla ${limit} karakter olabilir.`);
  }
  if (data.arastirmaKaynaklari !== undefined && (!Array.isArray(data.arastirmaKaynaklari) || data.arastirmaKaynaklari.length > 12)) throw new Error("Araştırma için en fazla 12 kaynak bağlantısı eklenebilir.");
  product.arastirmaKaynaklari = (data.arastirmaKaynaklari as unknown[] | undefined ?? []).map(value => {
    if (typeof value !== "string" || value.length > 2000) throw new Error("Araştırma bağlantısı geçersiz.");
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) throw new Error("Araştırma bağlantısı HTTP veya HTTPS olmalıdır.");
    return url.href;
  });
  product.paraBirimi = String(data.paraBirimi ?? "EUR");
  product.tedarikDurumu = String(data.tedarikDurumu ?? "Stoktan");
  if (!PRODUCT_CURRENCIES.some(currency => currency === product.paraBirimi)) throw new Error("Para birimi geçersiz.");
  if (!PRODUCT_AVAILABILITY.some(status => status === product.tedarikDurumu)) throw new Error("Tedarik durumu geçersiz.");
  product.satisFiyati = amount(data.satisFiyati, "Satış fiyatı");
  product.listeFiyati = amount(data.listeFiyati, "Liste fiyatı");
  product.kdvOrani = amount(data.kdvOrani, "KDV oranı", 100);
  if (product.listeFiyati != null && product.satisFiyati != null && product.listeFiyati < product.satisFiyati) throw new Error("Liste fiyatı satış fiyatından düşük olamaz.");
  if (data.webSecili != null && typeof data.webSecili !== "boolean") throw new Error("Web seçimi geçersiz.");
  product.webSecili = data.webSecili === true;
  if (product.webSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.webSlug)) throw new Error("Web adresi yalnızca küçük harf, rakam ve tire içerebilir.");
  if (product.webSecili) {
    if (source === "Unique") throw new Error("Web için yalnızca Root ve Spektrotek ürünleri seçilebilir.");
    if (!product.kategori || !product.marka || !product.urunAciklamasi) throw new Error("Web seçimi için kategori, marka ve ürün açıklaması gereklidir.");
    if (product.tedarikDurumu !== "Teklif ile" && (product.satisFiyati == null || product.satisFiyati <= 0 || product.kdvOrani == null)) throw new Error("Web satışı için pozitif satış fiyatı ve KDV oranı gereklidir.");
  }
  return product;
}

export function readKysProduct(value: unknown): KysProduct {
  if (!value) return { ...emptyKysProduct };
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return { ...emptyKysProduct, ...parsed };
}
