"use client";

import { emptyKysProduct, PRODUCT_AVAILABILITY, PRODUCT_CURRENCIES, type KysProduct } from "@/lib/kysProduct";
import styles from "@/app/styles/table.module.css";
import kys from "../kys.module.css";

export type ProductDraft = Omit<KysProduct, "satisFiyati" | "listeFiyati" | "kdvOrani"> & {
  satisFiyati: number | string | null;
  listeFiyati: number | string | null;
  kdvOrani: number | string | null;
};

export { emptyKysProduct };

export default function KysProductFields({ value, onChange, disabled = false }: {
  value: ProductDraft;
  onChange: (value: ProductDraft) => void;
  disabled?: boolean;
}) {
  function field(key: keyof ProductDraft, next: string | boolean) {
    onChange({ ...value, [key]: next });
  }
  return <fieldset className={kys.productFieldset} disabled={disabled}>
    <legend>Ürün ve web bilgileri</legend>
    <div className={styles.formGrid3}>
      {([
        ["kategori", "Kategori", 160], ["marka", "Marka", 160],
        ["satisFiyati", "Satış fiyatı (KDV hariç)", 20], ["listeFiyati", "Liste fiyatı (KDV hariç, isteğe bağlı)", 20],
        ["kdvOrani", "KDV oranı (%)", 6], ["teslimSuresi", "Teslim / tedarik süresi", 160],
      ] as const).map(([key, label, maxLength]) => <div className={styles.formGroup} key={key}>
        <label htmlFor={`product-${key}`}>{label}</label>
        <input id={`product-${key}`} maxLength={maxLength} inputMode={["satisFiyati", "listeFiyati", "kdvOrani"].includes(key) ? "decimal" : undefined} value={value[key] ?? ""} onChange={e => field(key, e.target.value)} />
      </div>)}
      <div className={styles.formGroup}><label htmlFor="product-currency">Para birimi</label><select id="product-currency" value={value.paraBirimi} onChange={e => field("paraBirimi", e.target.value)}>{PRODUCT_CURRENCIES.map(currency => <option key={currency}>{currency}</option>)}</select></div>
      <div className={styles.formGroup}><label htmlFor="product-availability">Satış / tedarik durumu</label><select id="product-availability" value={value.tedarikDurumu} onChange={e => field("tedarikDurumu", e.target.value)}>{PRODUCT_AVAILABILITY.map(status => <option key={status}>{status}</option>)}</select></div>
      <div className={styles.formGroup}><label htmlFor="product-web-id">Web ürün kimliği</label><input id="product-web-id" maxLength={120} value={value.webUrunId} onChange={e => field("webUrunId", e.target.value)} /><span className={kys.formHint}>Mevcut web ürünüyle eşleştirmek için.</span></div>
      <div className={styles.formGroup}><label htmlFor="product-slug">Web adresi (slug)</label><input id="product-slug" maxLength={180} placeholder="ornek-urun-adi" value={value.webSlug} onChange={e => field("webSlug", e.target.value)} /></div>
      <div className={`${styles.formGroup} ${styles.colSpan3}`}><label htmlFor="product-short">Kısa açıklama</label><textarea id="product-short" maxLength={1000} rows={2} value={value.kisaAciklama} onChange={e => field("kisaAciklama", e.target.value)} /></div>
      <div className={`${styles.formGroup} ${styles.colSpan3}`}><label htmlFor="product-description">Ürün açıklaması</label><textarea id="product-description" maxLength={30000} rows={5} value={value.urunAciklamasi} onChange={e => field("urunAciklamasi", e.target.value)} /><span className={kys.formHint}>Teknik bilgiler, paket içeriği ve uyumluluk bilgileri. Düz metin olarak saklanır.</span></div>
      <div className={styles.formGroup}><label htmlFor="product-reference-price">Referans fiyat / fiyat aralığı</label><input id="product-reference-price" maxLength={160} value={value.referansFiyat} onChange={e => field("referansFiyat", e.target.value)} /><span className={kys.formHint}>Satış fiyatı değildir; kaynak listedeki fiyat bilgisini korur.</span></div>
      <div className={`${styles.formGroup} ${styles.colSpan3}`}><label htmlFor="product-internal-notes">İç notlar</label><textarea id="product-internal-notes" maxLength={8000} rows={3} value={value.icNotlar} onChange={e => field("icNotlar", e.target.value)} /><span className={kys.formHint}>Stok, kod ve araştırma belirsizlikleri; web ürün açıklamasından ayrıdır.</span></div>
      <div className={`${styles.formGroup} ${styles.colSpan3}`}><label htmlFor="product-research-sources">Araştırma kaynakları</label><textarea id="product-research-sources" rows={3} value={value.arastirmaKaynaklari.join("\n")} onChange={e => onChange({ ...value, arastirmaKaynaklari: e.target.value.split("\n").map(line => line.trim()).filter(Boolean) })} /><span className={kys.formHint}>Her satıra bir kaynak bağlantısı.</span></div>
      <label className={`${kys.productCheck} ${styles.colSpan3}`}><input type="checkbox" checked={value.webSecili} onChange={e => field("webSecili", e.target.checked)} />Web senkronizasyonuna dahil et</label>
      <p className={`${kys.formHint} ${styles.colSpan3}`}>Bu seçim henüz web sitesine veri göndermez. Web satışı için kategori, marka, açıklama, pozitif satış fiyatı ve KDV oranı doldurulmalıdır. Teklifle satılan ürünlerde fiyat zorunlu değildir.</p>
    </div>
  </fieldset>;
}
