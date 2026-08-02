"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "@/app/styles/table.module.css";
import kys from "../kys.module.css";

type StockRow = {
  id: number;
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
const defaultMaterialTypes = ["Sarf", "Cihaz", "Kimyasal", "Referans Standart", "Ambalaj"];

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

export default function StokListesiClient() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [search, setSearch] = useState("");
  const [malzemeTuru, setMalzemeTuru] = useState("");
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
  const [form, setForm] = useState(emptyForm);
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
  }, [durum, kritik, limit, malzemeTuru, page, search, sort]);

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
    setForm(emptyForm);
    setImageFile(null);
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(row: StockRow) {
    setMode("edit");
    setEditId(row.id);
    setForm({
      barkod: row.barkod || "",
      malzemeTuru: row.malzemeTuru || "Sarf",
      kod: row.kod || "",
      ad: row.ad || "",
      name: row.name || "",
      casNo: row.casNo || "",
      ozellik: row.ozellik || "",
      ambalaj: row.ambalaj || "",
      saklamaKosullari: row.saklamaKosullari || "",
      kritikLimit: String(row.kritikLimit || 0),
      stokDurumu: row.stokDurumu || "Aktif",
      birim: row.birim || "Adet",
    });
    setImageFile(null);
    setFormError("");
    setModalOpen(true);
  }

  async function uploadImage(stockId: number) {
    if (!imageFile) return;
    const fd = new FormData();
    fd.append("file", imageFile);
    const res = await fetch(`/api/kys/stoklar/${stockId}/gorsel`, { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Görsel yüklenemedi.");
  }

  async function save() {
    if (!form.kod.trim() || !form.ad.trim()) {
      setFormError("Kod ve ad zorunludur.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const url = mode === "edit" ? `/api/kys/stoklar/${editId}` : "/api/kys/stoklar";
      const res = await fetch(url, {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Kayıt tamamlanamadı.");
      const stockId = Number(json.id || editId || 0);
      if (stockId) await uploadImage(stockId);
      setModalOpen(false);
      setImageFile(null);
      fetchRows();
    } catch (e: unknown) {
      setFormError(errorMessage(e, "Stok kaydedilemedi."));
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
          <span className={styles.totalCount}>{total} stok kartı</span>
        </div>
        <div className={styles.toolbarRight}>
          <button className={styles.addBtn} type="button" onClick={openAdd}>+ Stok kartı</button>
        </div>
      </div>

      <div className={kys.filterRow}>
        <select className={kys.select} value={malzemeTuru} onChange={e => { setMalzemeTuru(e.target.value); setPage(1); }}>
          <option value="">Tüm türler</option>
          <option>Sarf</option>
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
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Barkod</th>
                <th>Malzeme türü</th>
                <th>Kod</th>
                <th>Ad</th>
                <th>Name</th>
                <th>Cas No</th>
                <th>Özellik</th>
                <th>Ambalaj</th>
                <th>Saklama</th>
                <th>Kritik limit</th>
                <th>Stok durumu</th>
                <th>Birim</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}><td colSpan={13}><div className={styles.skeleton} /></td></tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={13}><div className={styles.empty}>Stok kaydı bulunamadı.</div></td></tr>
              ) : rows.map(row => (
                <tr key={row.id}>
                  <td className={styles.tdMono}>{row.barkod || "-"}</td>
                  <td><span className={kys.pill}>{row.malzemeTuru}</span></td>
                  <td className={styles.tdMono}>{row.kod}</td>
                  <td className={styles.tdName}>{row.ad}</td>
                  <td className={styles.tdSecondary}>{row.name || "-"}</td>
                  <td className={styles.tdMono}>{row.casNo || "-"}</td>
                  <td className={styles.tdAdres}>{row.ozellik || "-"}</td>
                  <td>{row.ambalaj || "-"}</td>
                  <td className={styles.tdAdres}>{row.saklamaKosullari || "-"}</td>
                  <td className={styles.tdMono}>{fmt(row.kritikLimit)}</td>
                  <td>
                    <span className={`${kys.pill} ${row.kritikMi ? kys.pillDanger : kys.pillOk}`}>
                      <span className={row.kritikMi ? kys.lowStock : ""}>{fmt(row.stokMiktari)}</span> {row.birim}
                    </span>
                  </td>
                  <td>{row.birim}</td>
                  <td>
                    <div className={styles.actionBtns}>
                      <Link className={styles.editBtn} title="Detay" href={`/laboratuvar/kys/stok-listesi/${row.id}`}>i</Link>
                      <Link className={styles.editBtn} title="Yazdır" href={`/laboratuvar/kys/stok-karti-yazdir/${row.id}`}>⎙</Link>
                      <button className={styles.editBtn} title="Düzenle" onClick={() => openEdit(row)}>✎</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.pagination}>
          <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
          {pages.map((p, i) => p === "..." ? <span className={styles.pageDots} key={i}>...</span> : (
            <button key={p} className={`${styles.pageBtn} ${p === page ? styles.pageBtnActive : ""}`} onClick={() => setPage(p)}>{p}</button>
          ))}
          <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage(page + 1)}>›</button>
          <span className={styles.pageInfo}>Sayfa {page} / {totalPages}</span>
        </div>
      </div>

      {modalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: 860 }}>
            <div className={styles.modalHeader}>
              <h2>{mode === "add" ? "Yeni stok kartı" : "Stok kartı düzenle"}</h2>
              <button className={styles.modalClose} onClick={() => setModalOpen(false)}>×</button>
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
                  <input type="file" accept="image/*" onChange={e => setImageFile(e.target.files?.[0] || null)} />
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
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setModalOpen(false)}>Vazgeç</button>
              <button className={styles.saveBtn} disabled={saving} onClick={save}>{saving ? "Kaydediliyor..." : "Kaydet"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
