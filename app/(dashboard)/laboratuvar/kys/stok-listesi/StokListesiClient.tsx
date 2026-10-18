"use client";

import KysProductFields, { emptyKysProduct, type ProductDraft } from "../urun-listesi/KysProductFields";
import type { KysProduct } from "@/lib/kysProduct";
import { KYS_STOCK_SOURCES } from "@/lib/kysStockSources";
import Link from "next/link";
import { Info, Printer } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "@/app/styles/table.module.css";
import kys from "../kys.module.css";

type StockRow = {
  id: number;
  kaynak: string;
  urun: KysProduct;
  barkod: string;
  malzemeTuru: string;
  kod: string;
  ad: string;
  name: string;
  casNo: string;
  ozellik: string;
  ambalaj: string;
  saklamaKosullari: string;
  kritikLimit: number;
  stokMiktari: number;
  kritikMi: boolean;
  stokDurumu: string;
  birim: string;
};

const emptyForm = {
  kaynak: "Unique",
  barkod: "",
  malzemeTuru: "Sarf",
  kod: "",
  ad: "",
  name: "",
  casNo: "",
  ozellik: "",
  ambalaj: "",
  saklamaKosullari: "",
  kritikLimit: "0",
  stokDurumu: "Aktif",
  birim: "Adet",
};
const errorMessage = (e: unknown, fallback: string) => e instanceof Error ? e.message : fallback;
const stockFormFields: Array<[string, keyof typeof emptyForm]> = [
  ["Kod", "kod"],
  ["Ad", "ad"],
  ["Name", "name"],
  ["Cas No", "casNo"],
  ["Ambalaj", "ambalaj"],
  ["Saklama Koşulları", "saklamaKosullari"],
  ["Kritik Limit", "kritikLimit"],
  ["Birim", "birim"],
];
const defaultMaterialTypes = ["Sarf", "Spektrotek", "Cihaz", "Kimyasal", "Referans Standart", "Ambalaj"];

const pageNums = (page: number, totalPages: number) => {
  const nums: Array<number | "..."> = [];
  for (let i = 1; i <= totalPages; i += 1) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "...") nums.push("...");
  }
  return nums;
};

function fmt(value: number) {
  return Number(value || 0).toLocaleString("tr-TR", { maximumFractionDigits: 4 });
}

export default function StokListesiClient({ products = false }: { products?: boolean }) {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [search, setSearch] = useState("");
  const [malzemeTuru, setMalzemeTuru] = useState("");
  const [kaynak, setKaynak] = useState("");
  const [durum, setDurum] = useState("");
  const [kritik, setKritik] = useState(false);
  const [sort, setSort] = useState("miktar-asc");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm, kaynak: products ? "Spektrotek" : "Unique" });
  const [product, setProduct] = useState<ProductDraft>({ ...emptyKysProduct });
  const [productImages, setProductImages] = useState<File[]>([]);
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pages = useMemo(() => pageNums(page, totalPages), [page, totalPages]);
  const materialTypeOptions = useMemo(() => {
    const values = new Set(defaultMaterialTypes);
    rows.forEach(row => {
      if (row.malzemeTuru) values.add(row.malzemeTuru);
    });
    if (form.malzemeTuru) values.add(form.malzemeTuru);
    return Array.from(values);
  }, [form.malzemeTuru, rows]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({
        search,
        liste: products ? "urun" : "stok",
        kaynak: products ? kaynak : "",
        malzemeTuru,
        durum,
        sort,
        page: String(page),
        limit: String(limit),
      });
      if (kritik) qs.set("kritik", "1");
      const res = await fetch(`/api/kys/stoklar?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Stok listesi alınamadı.");
      setRows(json.data || []);
      setTotal(json.total || 0);
      setTotalPages(json.totalPages || 1);
    } catch (e: unknown) {
      setError(errorMessage(e, "Stok listesi alınamadı."));
    } finally {
      setLoading(false);
    }
  }, [durum, kaynak, kritik, limit, malzemeTuru, page, products, search, sort]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview("");
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  function handleSearch(value: string) {
    setSearch(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPage(1), 250);
  }

  function openAdd() {
    setMode("add");
    setEditId(null);
    setForm({ ...emptyForm, kaynak: products ? "Spektrotek" : "Unique" });
    setProduct({ ...emptyKysProduct });
    setProductImages([]);
    setCreatedId(null);
    setImageFile(null);
    setFormError("");
    setModalOpen(true);
  }

  async function uploadImage(stockId: number) {
    if (products) {
      let completed = 0;
      try {
        for (const file of productImages) {
          const data = new FormData();
          data.append("file", file);
          const response = await fetch(`/api/kys/stoklar/${stockId}/gorseller`, { method: "POST", body: data });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Görsel yüklenemedi.");
          completed++;
        }
      } finally { setProductImages(productImages.slice(completed)); }
      return;
    }
    if (!imageFile) return;
    const fd = new FormData();
    fd.append("file", imageFile);
    const res = await fetch(`/api/kys/stoklar/${stockId}/gorsel`, { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Görsel yüklenemedi.");
  }

  async function save() {
    if (saving) return;
    if (!form.kod.trim() || !form.ad.trim()) {
      setFormError("Kod ve ad zorunludur.");
      return;
    }
    const files = products ? productImages : imageFile ? [imageFile] : [];
    if (files.length > 24 || files.some(file => file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
      setFormError("En fazla 24 JPG, PNG veya WebP görseli seçin; her dosya en fazla 5 MB olabilir.");
      return;
    }
    setSaving(true);
    setFormError("");
    let saved = false;
    try {
      const savedId = createdId || editId;
      const url = savedId ? `/api/kys/stoklar/${savedId}` : "/api/kys/stoklar";
      const res = await fetch(url, {
        method: savedId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, kaynak: products ? form.kaynak : "Unique", ...(products ? { urun: product } : {}) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Kayıt tamamlanamadı.");
      const stockId = Number(json.id || savedId || 0);
      if (!savedId && stockId) setCreatedId(stockId);
      saved = true;
      if (stockId) await uploadImage(stockId);
      setModalOpen(false);
      setImageFile(null);
      fetchRows();
    } catch (e: unknown) {
      setFormError(`${saved ? "Kart kaydedildi. Kalan görseller için tekrar Kaydet'e basabilirsiniz. " : ""}${errorMessage(e, "Stok kaydedilemedi.")}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchBox}>
            <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
            </svg>
            <input className={styles.searchInput} placeholder="Barkod, kod, ad, CAS no ara..." value={search} onChange={e => handleSearch(e.target.value)} />
          </div>
          <span className={styles.totalCount}>{total} {products ? "ürün" : "stok kartı"}</span>
        </div>
        <div className={styles.toolbarRight}>
          <button className={styles.addBtn} type="button" onClick={openAdd}>+ {products ? "Ürün" : "Stok kartı"}</button>
        </div>
      </div>

      <div className={kys.filterRow}>
        {products && <select aria-label="Kaynak" className={kys.select} value={kaynak} onChange={e => { setKaynak(e.target.value); setPage(1); }}><option value="">Tüm kaynaklar</option>{KYS_STOCK_SOURCES.filter(source => source !== "Unique").map(source => <option key={source}>{source}</option>)}</select>}
        <select className={kys.select} value={malzemeTuru} onChange={e => { setMalzemeTuru(e.target.value); setPage(1); }}>
          <option value="">Tüm türler</option>
          <option>Sarf</option><option>Spektrotek</option>
          <option>Cihaz</option>
          <option>Kimyasal</option>
          <option>Referans Standart</option>
          <option>Ambalaj</option>
        </select>
        <select className={kys.select} value={durum} onChange={e => { setDurum(e.target.value); setPage(1); }}>
          <option value="">Tüm durumlar</option>
          <option>Aktif</option>
          <option>Pasif</option>
        </select>
        <select className={kys.select} value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}>
          <option value="miktar-asc">Miktar azdan çoğa</option>
          <option value="miktar-desc">Miktar çoktan aza</option>
          <option value="">Yeni kayıtlar</option>
        </select>
        <label className={kys.pill}>
          <input type="checkbox" checked={kritik} onChange={e => { setKritik(e.target.checked); setPage(1); }} />
          Kritik altı
        </label>
        <select className={styles.pageSizeSelect} value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
          {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n} / sayfa</option>)}
        </select>
      </div>

      <div className={styles.tableCard}>
        {error && <div className={styles.errorBar}>{error}</div>}
        <div className={styles.tableWrapper}>
          <table className={`${styles.table} ${products ? kys.productTable : kys.stockFitTable}`}>
            <thead>
              <tr>
                <th>Barkod</th>
                <th>{products ? "Kategori" : "Tür"}</th>
                <th>Kod</th>
                <th>Ad</th>
                {products ? <th>Satış fiyatı</th> : <th>Cas No</th>}
                {!products && <>
                  <th>Ambalaj</th>
                  <th>Saklama</th>
                  <th>Kritik limit</th>
                  <th>Birim</th>
                </>}
                <th>Stok durumu</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}><td colSpan={products ? 7 : 11}><div className={styles.skeleton} /></td></tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={products ? 7 : 11}><div className={styles.empty}>Stok kaydı bulunamadı.</div></td></tr>
              ) : rows.map(row => (
                <tr key={row.id}>
                  <td data-label="Barkod" className={`${styles.tdMono} ${kys.barcodeText}`}>{row.barkod || "-"}</td>
                  <td data-label={products ? "Kategori" : "Tür"}><span className={kys.pill}>{products ? row.urun.kategori || row.malzemeTuru || "—" : row.malzemeTuru}</span></td>
                  <td data-label="Kod" className={styles.tdMono}>{row.kod}</td>
                  <td data-label="Ad" className={styles.tdName}>{row.ad}</td>
                  {products ? <td data-label="Satış fiyatı">{row.urun.satisFiyati == null ? "—" : `${fmt(row.urun.satisFiyati)} ${row.urun.paraBirimi}`}</td> : <td data-label="CAS No" className={styles.tdMono}>{row.casNo || "-"}</td>}
                  {!products && <>
                    <td data-label="Ambalaj">{row.ambalaj || "-"}</td>
                    <td data-label="Saklama">{row.saklamaKosullari || "-"}</td>
                    <td data-label="Kritik limit" className={styles.tdMono}>{fmt(row.kritikLimit)}</td>
                    <td data-label="Birim">{row.birim}</td>
                  </>}
                  <td data-label="Stok durumu">
                    <span className={`${kys.pill} ${row.kritikMi ? kys.pillDanger : kys.pillOk}`}>
                      <span className={row.kritikMi ? kys.lowStock : ""}>{fmt(row.stokMiktari)}</span> {row.birim}
                    </span>
                  </td>
                  <td data-label="İşlem">
                    <div className={`${styles.actionBtns} ${kys.stockActions}`}>
                      <Link className={`${styles.editBtn} ${kys.stockActionButton}`} title="Detay" aria-label={`${row.ad} stok detayını aç`} href={`/laboratuvar/kys/${products ? "urun-listesi" : "stok-listesi"}/${row.id}`}><Info size={14} aria-hidden="true" /></Link>
                      <Link className={`${styles.editBtn} ${kys.stockActionButton}`} title="Yazdır" aria-label={`${row.ad} stok kartını yazdır`} href={`/laboratuvar/kys/stok-karti-yazdir/${row.id}`}><Printer size={14} aria-hidden="true" /></Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.pagination}>
          <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
          {pages.map((p, i) => p === "..." ? <span className={styles.pageDots} key={`ellipsis-${i}`}>...</span> : (
            <button key={`page-${p}`} className={`${styles.pageBtn} ${p === page ? styles.pageBtnActive : ""}`} onClick={() => setPage(p)}>{p}</button>
          ))}
          <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage(page + 1)}>›</button>
          <span className={styles.pageInfo}>Sayfa {page} / {totalPages}</span>
        </div>
      </div>

      {modalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: 860 }}>
            <div className={styles.modalHeader}>
              <h2>{products ? "Yeni ürün" : mode === "add" ? "Yeni stok kartı" : "Stok kartı düzenle"}</h2>
              <button className={styles.modalClose} disabled={saving} aria-label="Kapat" onClick={() => setModalOpen(false)}>×</button>
            </div>
            <div className={styles.modalBody}>
              {formError && <div className={styles.formError}>{formError}</div>}
              <div className={styles.formGrid3}>
                {stockFormFields.map(([label, key]) => (
                  <div className={styles.formGroup} key={key}>
                    <label>{label}{["kod", "ad"].includes(key) && <span className={styles.required}> *</span>}</label>
                    <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                  </div>
                ))}
                {mode === "edit" && (
                  <div className={styles.formGroup}>
                    <label>Barkod</label>
                    <input value={form.barkod} onChange={e => setForm(f => ({ ...f, barkod: e.target.value }))} />
                  </div>
                )}
                {products && <div className={styles.formGroup}>
                  <label htmlFor="stock-source">Kaynak</label>
                  <select id="stock-source" value={form.kaynak} onChange={e => setForm(f => ({ ...f, kaynak: e.target.value }))}>{KYS_STOCK_SOURCES.filter(source => source !== "Unique").map(source => <option key={source}>{source}</option>)}</select>
                </div>}
                <div className={styles.formGroup}>
                  <label>Malzeme türü</label>
                  <input
                    list="kys-material-types"
                    value={form.malzemeTuru}
                    onChange={e => setForm(f => ({ ...f, malzemeTuru: e.target.value }))}
                    placeholder="Seçin veya yeni tür yazın"
                  />
                  <datalist id="kys-material-types">
                    {materialTypeOptions.map(type => <option key={type} value={type} />)}
                  </datalist>
                </div>
                {mode === "edit" && (
                  <div className={styles.formGroup}>
                    <label>Stok durumu</label>
                    <select value={form.stokDurumu} onChange={e => setForm(f => ({ ...f, stokDurumu: e.target.value }))}>
                      <option>Aktif</option><option>Pasif</option>
                    </select>
                  </div>
                )}
                <div className={styles.formGroup}>
                  <label>Ürün görseli</label>
                  <input id="stock-image-file" className={kys.fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple={products} onChange={e => { if (products) setProductImages(Array.from(e.target.files || [])); else setImageFile(e.target.files?.[0] || null); }} />
                  {products && <span className={kys.formHint}>{productImages.length ? `${productImages.length} görsel: ${productImages.map(file => file.name).join(", ")}` : "Birden fazla görsel seçebilirsiniz; ilk görsel kapak olur."}</span>}
                  <label className={kys.fileButton} htmlFor="stock-image-file">Dosya seç</label>
                  {imagePreview ? (
                    <div className={kys.formImagePreviewWrap}>
                      <div
                        className={kys.formImagePreview}
                        style={{ backgroundImage: `url(${imagePreview})` }}
                        aria-label="Seçilen ürün görseli önizlemesi"
                      />
                      <span className={kys.formHint}>{imageFile?.name}</span>
                    </div>
                  ) : (
                    <span className={kys.formHint}>JPG, PNG veya WebP seçebilirsiniz.</span>
                  )}
                </div>
                <div className={`${styles.formGroup} ${styles.colSpan3}`}>
                  <label>Özellik</label>
                  <textarea rows={3} value={form.ozellik} onChange={e => setForm(f => ({ ...f, ozellik: e.target.value }))} />
                </div>
              </div>
              {products && <KysProductFields value={product} onChange={setProduct} disabled={saving} />}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} disabled={saving} onClick={() => setModalOpen(false)}>Vazgeç</button>
              <button className={styles.saveBtn} disabled={saving} onClick={save}>{saving ? "Kaydediliyor..." : "Kaydet"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
