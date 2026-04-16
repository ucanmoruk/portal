"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import styles from '@/app/styles/table.module.css';
interface Urun {
  ID: number;
  Tarih: string;
  RaporNo: string;
  Versiyon: string;
  Firma: string;
  FirmaID: number;
  Barkod: string;
  Urun: string;
  Miktar: string;
  Tip1: string;
  Tip2: number;
  UrunTipiFull: string;
  ADegeri: string;
  DurumLabel: string;
}

interface ApiResponse {
  data: Urun[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const emptyForm = {
  Tarih: new Date().toISOString().split('T')[0],
  RaporNo: "",
  Versiyon: "1",
  FirmaID: "",
  Barkod: "",
  Urun: "",
  Miktar: "",
  Tip1: "",
  Tip2: "",
  A: "",
  RaporDurum: "Tamamlandı"
};

const PAGE_SIZE_OPTIONS = [10, 20, 50];

export default function UrunTable() {
  const router = useRouter();
  const [data, setData] = useState<Urun[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [form, setForm] = useState<any>(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Lookups
  const [lookups, setLookups] = useState<any>({ firmalar: [], tipler: [] });

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async (s: string, p: number, l: number) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ search: s, page: String(p), limit: String(l) });
      const res = await fetch(`/api/urunler?${params}`);
      if (!res.ok) throw new Error("Veri alınamadı");
      const json: ApiResponse = await res.json();
      setData(json.data);
      setTotal(json.total);
      setTotalPages(json.totalPages);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLookups = async () => {
    try {
      const res = await fetch("/api/urunler/lookup");
      if (res.ok) setLookups(await res.json());
    } catch (e) {}
  };

  useEffect(() => {
    fetchData(search, page, limit);
    fetchLookups();
  }, [page, limit, fetchData, search]);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setPage(1);
      fetchData(val, 1, limit);
    }, 400);
  };

  const openAdd = () => {
    router.push("/ugd/urun-listesi/yeni");
  };

  const openEdit = (row: Urun) => {
    router.push(`/ugd/urun-listesi/${row.ID}/duzenle`);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Bu ürünü silmek istediğinize emin misiniz?")) return;
    try {
      const res = await fetch(`/api/urunler/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Silme işlemi başarısız");
      fetchData(search, page, limit);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleSave = async () => {
    if (!form.Urun || !form.FirmaID) {
      setFormError("Ürün adı ve firma zorunludur.");
      return;
    }
    setSaving(true);
    try {
      const url = modalMode === "add" ? "/api/urunler" : `/api/urunler/${editId}`;
      const method = modalMode === "add" ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("İşlem başarısız");
      setModalOpen(false);
      fetchData(search, page, limit);
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const pageNumbers = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("...");
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
      if (page < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchBox}>
            <input
              type="text"
              placeholder="Ürün, Barkod veya Firma..."
              value={search}
              onChange={e => handleSearch(e.target.value)}
              className={styles.searchInput}
            />
          </div>
        </div>
        <div className={styles.toolbarRight}>
          <span className={styles.totalCount}>{total} ürün</span>
          <select className={styles.pageSizeSelect} value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
            {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n} / sayfa</option>)}
          </select>
          <button className={styles.addBtn} onClick={openAdd}>Yeni Ürün Ekle</button>
        </div>
      </div>

      <div className={styles.tableCard}>
        {error && <div className={styles.errorBar}>{error}</div>}
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 90 }}>Rapor No</th>
                <th>Firma</th>
                <th>Ürün Bilgisi</th>
                <th>Barkod / Miktar</th>
                <th>Ürün Tipi / Durum</th>
                <th style={{ width: 80 }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 15 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 6 }).map((__, j) => (
                    <td key={j}><div className={styles.skeleton} /></td>
                  ))}</tr>
                ))
              ) : data.length === 0 ? (
                <tr><td colSpan={6}><div className={styles.empty}>Sonuç bulunamadı.</div></td></tr>
              ) : data.map((row: Urun) => (
                <tr key={row.ID}>
                  <td className={styles.tdMono}>
                    {row.RaporNo}<br/>
                    <small style={{ color: 'var(--color-text-tertiary)' }}>v{row.Versiyon}</small>
                  </td>
                  <td className={styles.tdName} style={{ maxWidth: 180 }}>{row.Firma}</td>
                  <td>
                    <strong>{row.Urun}</strong>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>{row.Tarih ? new Date(row.Tarih).toLocaleDateString('tr-TR') : ""}</div>
                  </td>
                  <td>
                    {row.Barkod}<br/>
                    <small>{row.Miktar}</small>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.8rem' }}>{row.UrunTipiFull}</div>
                    <span style={{ 
                      fontSize: '0.7rem', 
                      padding: '2px 6px', 
                      borderRadius: '4px', 
                      background: row.DurumLabel === 'Tamamlandı' ? '#e6f4ea' : '#fff4e5',
                      color: row.DurumLabel === 'Tamamlandı' ? '#1e7e34' : '#c2410c'
                    }}>
                      {row.DurumLabel}
                    </span>
                  </td>
                  <td>
                    <div className={styles.actionBtns}>
                      <button className={styles.editBtn} onClick={() => openEdit(row)} title="Düzenle">
                        <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                          <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
                        </svg>
                      </button>
                      <button className={styles.deleteBtn} onClick={() => handleDelete(row.ID)} title="Sil">
                        <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                          <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75V4H3a.75.75 0 0 0 0 1.5h.75v10.5a2 2 0 0 0 2 2h8.5a2 2 0 0 0 2-2V5.5H17a.75.75 0 0 0 0-1.5h-3v-.25A2.75 2.75 0 0 0 11.25 1h-2.5ZM7.5 3.75a1.25 1.25 0 0 1 1.25-1.25h2.5a1.25 1.25 0 0 1 1.25 1.25V4h-5v-.25Z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className={styles.pagination}>
            <button className={styles.pageBtn} onClick={() => setPage((p: number) => Math.max(1, p - 1))} disabled={page === 1}>
               <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" /></svg>
            </button>
            {pageNumbers().map((p, i) => p === "..." ? <span key={`dots-${i}`} className={styles.pageDots}>…</span> : (
              <button key={p} className={`${styles.pageBtn} ${p === page ? styles.pageBtnActive : ""}`} onClick={() => setPage(p as number)}>{p}</button>
            ))}
            <button className={styles.pageBtn} onClick={() => setPage((p: number) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
               <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" /></svg>
            </button>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className={styles.modalOverlay} onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className={styles.modal} style={{ maxWidth: 800 }}>
            <div className={styles.modalHeader}>
              <h2>{modalMode === "add" ? "Yeni Ürün Ekle" : "Ürün Güncelle"}</h2>
              <button className={styles.modalClose} onClick={() => setModalOpen(false)}>&times;</button>
            </div>
            <div className={styles.modalBody}>
              {formError && <div className={styles.formError}>{formError}</div>}
              <div className={styles.formGrid}>
                <div className={styles.formGroup}><label>Ürün Adı</label>
                  <input value={form.Urun} onChange={e => setForm({...form, Urun: e.target.value})} />
                </div>
                <div className={styles.formGroup}><label>Firma</label>
                  <select value={form.FirmaID} onChange={e => setForm({...form, FirmaID: e.target.value})}>
                    <option value="">Firma Seçin</option>
                    {lookups.firmalar.map((f: any) => <option key={f.ID} value={f.ID}>{f.Ad}</option>)}
                  </select>
                </div>
                <div className={styles.formGroup}><label>Barkod</label>
                  <input value={form.Barkod} onChange={e => setForm({...form, Barkod: e.target.value})} />
                </div>
                <div className={styles.formGroup}><label>Miktar</label>
                  <input value={form.Miktar} onChange={e => setForm({...form, Miktar: e.target.value})} />
                </div>
                <div className={styles.formGroup}><label>Tarih</label>
                  <input type="date" value={form.Tarih} onChange={e => setForm({...form, Tarih: e.target.value})} />
                </div>
                <div className={styles.formGroup}><label>Ürün Tipi</label>
                  <select value={form.Tip2} onChange={e => setForm({...form, Tip2: e.target.value})}>
                    <option value="">Tip Seçin</option>
                    {lookups.tipler.map((t: any) => <option key={t.ID} value={t.ID}>{t.UrunTipi}</option>)}
                  </select>
                </div>
                <div className={styles.formGroup}><label>Tip Başlığı (Tip1)</label>
                  <input value={form.Tip1} onChange={e => setForm({...form, Tip1: e.target.value})} />
                </div>
                <div className={styles.formGroup}><label>Rapor No</label>
                  <input value={form.RaporNo} onChange={e => setForm({...form, RaporNo: e.target.value})} />
                </div>
                <div className={styles.formGroup}><label>Versiyon</label>
                  <input value={form.Versiyon} onChange={e => setForm({...form, Versiyon: e.target.value})} />
                </div>
                <div className={styles.formGroup}><label>A Değeri</label>
                  <input value={form.A} onChange={e => setForm({...form, A: e.target.value})} />
                </div>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setModalOpen(false)}>İptal</button>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>{saving ? "..." : "KAYDET"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
