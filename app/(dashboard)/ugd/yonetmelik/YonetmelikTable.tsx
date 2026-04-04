"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import styles from '@/app/styles/table.module.css';
interface Yonetmelik {
  ID: number;
  YonetmelikNo: string;
  Bilesen: string;
  UrunTipi: string;
  MaksimumKonsantrasyon: string;
  Diger: string;
  EtiketBeyani: string;
}

interface ApiResponse {
  data: Yonetmelik[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const emptyForm: Omit<Yonetmelik, "ID"> = {
  YonetmelikNo: "", Bilesen: "", UrunTipi: "", MaksimumKonsantrasyon: "", Diger: "", EtiketBeyani: "",
};

const EK_OPTIONS = ["Ek II", "Ek III", "Ek IV", "Ek V", "Ek VI"];
const PAGE_SIZE_OPTIONS = [10, 20, 50];

export default function YonetmelikTable() {
  const [data, setData] = useState<Yonetmelik[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [selectedEk, setSelectedEk] = useState(""); 
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [form, setForm] = useState<Omit<Yonetmelik, "ID">>(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async (s: string, e: string, p: number, l: number) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        search: s,
        ek: e,
        page: String(p),
        limit: String(l)
      });
      const res = await fetch(`/api/yonetmelik?${params}`);
      if (!res.ok) throw new Error("Veri alınamadı");
      const json: ApiResponse = await res.json();
      setData(json.data);
      setTotal(json.total || 0);
      setTotalPages(json.totalPages || 1);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(search, selectedEk, page, limit);
  }, [search, selectedEk, page, limit, fetchData]);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setPage(1);
      fetchData(val, selectedEk, 1, limit);
    }, 400);
  };

  const openAdd = () => {
    setForm(emptyForm);
    setEditId(null);
    setFormError("");
    setModalMode("add");
    setModalOpen(true);
  };

  const openEdit = (row: Yonetmelik) => {
    setForm({
      YonetmelikNo: row.YonetmelikNo || "",
      Bilesen: row.Bilesen || "",
      UrunTipi: row.UrunTipi || "",
      MaksimumKonsantrasyon: row.MaksimumKonsantrasyon || "",
      Diger: row.Diger || "",
      EtiketBeyani: row.EtiketBeyani || "",
    });
    setEditId(row.ID);
    setFormError("");
    setModalMode("edit");
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.YonetmelikNo || !form.Bilesen) {
      setFormError("No ve Bileşen zorunludur.");
      return;
    }
    setSaving(true);
    try {
      const method = modalMode === "add" ? "POST" : "PUT";
      const payload = modalMode === "add" ? form : { ...form, ID: editId };
      const res = await fetch("/api/yonetmelik", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("İşlem başarısız");
      setModalOpen(false);
      fetchData(search, selectedEk, page, limit);
    } catch (err: any) {
      setFormError(err.message);
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
              placeholder="Bileşen adı, no..."
              value={search}
              onChange={e => handleSearch(e.target.value)}
              className={styles.searchInput}
            />
          </div>
          <select 
            className={styles.pageSizeSelect} 
            value={selectedEk} 
            onChange={(e) => { setSelectedEk(e.target.value); setPage(1); }}
          >
            <option value="">Tüm Ekler</option>
            {EK_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>

        <div className={styles.toolbarRight}>
          <span className={styles.totalCount}>{total} kayıt</span>
          <select
            className={styles.pageSizeSelect}
            value={limit}
            onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
          >
            {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n} / sayfa</option>)}
          </select>
          <button className={styles.addBtn} onClick={openAdd}>Yeni Yönetmelik</button>
        </div>
      </div>

      <div className={styles.tableCard}>
        {error && <div className={styles.errorBar}>{error}</div>}
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 100 }}>No</th>
                <th>Bileşen (INCI)</th>
                <th>Ürün Tipi</th>
                <th>Maks. Kons.</th>
                <th>Diğer / Etiket</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 6 }).map((__, j) => (
                    <td key={j}><div className={styles.skeleton} /></td>
                  ))}</tr>
                ))
              ) : data.length === 0 ? (
                <tr><td colSpan={6}><div className={styles.empty}>Sonuç bulunamadı.</div></td></tr>
              ) : (
                data.map((row) => (
                  <tr key={row.ID}>
                    <td className={styles.tdMono}>{row.YonetmelikNo}</td>
                    <td className={styles.tdName}>{row.Bilesen}</td>
                    <td>{row.UrunTipi || "—"}</td>
                    <td>{row.MaksimumKonsantrasyon || "—"}</td>
                    <td>
                      <div className={styles.contactCell}>
                        <span style={{ fontSize: '0.8rem' }}>{row.Diger || "—"}</span>
                        {row.EtiketBeyani && <div style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)', marginTop: 4 }}>{row.EtiketBeyani}</div>}
                      </div>
                    </td>
                    <td>
                      <div className={styles.actionBtns}>
                        <button className={styles.editBtn} onClick={() => openEdit(row)} title="Düzenle">
                          <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                            <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className={styles.pagination}>
            <button className={styles.pageBtn} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" /></svg>
            </button>
            {pageNumbers().map((p, i) => p === "..." ? <span key={`dots-${i}`} className={styles.pageDots}>…</span> : (
              <button key={p} className={`${styles.pageBtn} ${p === page ? styles.pageBtnActive : ""}`} onClick={() => setPage(p as number)}>{p}</button>
            ))}
            <button className={styles.pageBtn} onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" /></svg>
            </button>
            <span className={styles.pageInfo}>Sayfa {page} / {totalPages}</span>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className={styles.modalOverlay} onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>{modalMode === "add" ? "Yeni Yönetmelik" : "Yönetmelik Güncelle"}</h2>
              <button className={styles.modalClose} onClick={() => setModalOpen(false)}>&times;</button>
            </div>
            <div className={styles.modalBody}>
              {formError && <div className={styles.formError}>{formError}</div>}
              <div className={styles.formGrid}>
                <div className={styles.formGroup}><label>No</label><input value={form.YonetmelikNo} onChange={e => setForm({...form, YonetmelikNo: e.target.value})} /></div>
                <div className={styles.formGroup}><label>Bileşen</label><input value={form.Bilesen} onChange={e => setForm({...form, Bilesen: e.target.value})} /></div>
                <div className={styles.formGroup}><label>Ürün Tipi</label><input value={form.UrunTipi} onChange={e => setForm({...form, UrunTipi: e.target.value})} /></div>
                <div className={styles.formGroup}><label>Maks. Kons.</label><input value={form.MaksimumKonsantrasyon} onChange={e => setForm({...form, MaksimumKonsantrasyon: e.target.value})} /></div>
                <div className={`${styles.formGroup} ${styles.colSpan2}`}><label>Diğer</label><textarea value={form.Diger} onChange={e => setForm({...form, Diger: e.target.value})} /></div>
                <div className={`${styles.formGroup} ${styles.colSpan2}`}><label>Etiket</label><textarea value={form.EtiketBeyani} onChange={e => setForm({...form, EtiketBeyani: e.target.value})} /></div>
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
