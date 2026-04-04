"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import styles from '@/app/styles/table.module.css';
// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------
interface Musteri {
  ID: number;
  Ad: string;
  Adres: string | null;
  VergiDairesi: string | null;
  VergiNo: string | null;
  Telefon: string | null;
  Email: string | null;
  Web: string | null;
  Tur2: string | null;
  Yetkili: string | null;
  Kimin: string | null;
}

interface ApiResponse {
  data: Musteri[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const emptyForm: Omit<Musteri, "ID" | "Kimin"> = {
  Ad: "", Adres: "", VergiDairesi: "", VergiNo: "",
  Telefon: "", Email: "", Web: "", Tur2: "Müşteri", Yetkili: "",
};

const PAGE_SIZE_OPTIONS = [10, 20, 50];

// ----------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------
export default function MusteriTable({ filterKimin = "Ozeco" }: { filterKimin?: string }) {
  const [data, setData] = useState<Musteri[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [form, setForm] = useState<Omit<Musteri, "ID" | "Kimin">>(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<Musteri | null>(null);
  const [deleting, setDeleting] = useState(false);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async (s: string, p: number, l: number) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ 
        search: s, 
        page: String(p), 
        limit: String(l),
        kimin: filterKimin || ""
      });
      const res = await fetch(`/api/musteriler?${params}`);
      if (!res.ok) throw new Error((await res.json()).error || "Veri alınamadı");
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

  useEffect(() => { fetchData(search, page, limit); }, [page, limit, fetchData, search]);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setPage(1);
      fetchData(val, 1, limit);
    }, 350);
  };

  const openAdd = () => {
    setForm(emptyForm);
    setEditId(null);
    setFormError("");
    setModalMode("add");
    setModalOpen(true);
  };

  const openEdit = (m: Musteri) => {
    setForm({
      Ad: m.Ad || "", Adres: m.Adres || "", VergiDairesi: m.VergiDairesi || "",
      VergiNo: m.VergiNo || "", Telefon: m.Telefon || "", Email: m.Email || "",
      Web: m.Web || "", Tur2: m.Tur2 || "Müşteri", Yetkili: m.Yetkili || "",
    });
    setEditId(m.ID);
    setFormError("");
    setModalMode("edit");
    setModalOpen(true);
  };

  const handleFormChange = (field: keyof typeof form, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!form.Ad.trim()) { setFormError("Firma adı zorunludur."); return; }
    setSaving(true);
    setFormError("");
    try {
      const url = modalMode === "edit" ? `/api/musteriler/${editId}` : "/api/musteriler";
      const method = modalMode === "edit" ? "PUT" : "POST";
      const res = await fetch(url, {
        method, 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ ...form, Kimin: filterKimin }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "İşlem başarısız");
      setModalOpen(false);
      fetchData(search, page, limit);
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/musteriler/${deleteTarget.ID}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "İşlem başarısız");
      setDeleteTarget(null);
      fetchData(search, page, limit);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setDeleting(false);
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
            <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
            </svg>
            <input
              type="text"
              placeholder="Firma adı, vergi no, yetkili..."
              value={search}
              onChange={e => handleSearch(e.target.value)}
              className={styles.searchInput}
            />
            {search && (
              <button className={styles.searchClear} onClick={() => handleSearch("")}>
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            )}
          </div>
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
          <button className={styles.addBtn} onClick={openAdd}>
            <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
            Yeni Firma
          </button>
        </div>
      </div>

      <div className={styles.tableCard}>
        {error && <div className={styles.errorBar}>{error}</div>}

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Firma Adı</th>
                <th>Tür</th>
                <th>Adres</th>
                <th>V.D. / V.N.</th>
                <th>Yetkili</th>
                <th>İletişim</th>
                <th style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 8 }).map((__, j) => (
                    <td key={j}><div className={styles.skeleton} /></td>
                  ))}</tr>
                ))
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className={styles.empty}>
                      <p>Kayıt bulunamadı.</p>
                    </div>
                  </td>
                </tr>
              ) : data.map((m, i) => (
                <tr key={m.ID}>
                  <td className={styles.tdNum}>{(page - 1) * limit + i + 1}</td>
                  <td className={styles.tdName}>{m.Ad || "—"}</td>
                  <td>{m.Tur2 || "Müşteri"}</td>
                  <td className={styles.tdAdres}>{m.Adres || "—"}</td>
                  <td className={styles.tdMono}>
                    {m.VergiDairesi ? <div>{m.VergiDairesi}</div> : null}
                    {m.VergiNo ? <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>{m.VergiNo}</div> : "—"}
                  </td>
                  <td>{m.Yetkili || "—"}</td>
                  <td>
                    <div className={styles.contactCell}>
                      {m.Telefon && <span className={styles.contactItem} title="Telefon">📞 {m.Telefon}</span>}
                      {m.Email && (
                        <a href={`mailto:${m.Email}`} className={`${styles.contactItem} ${styles.emailLink}`} title="E-posta">
                          ✉️ {m.Email}
                        </a>
                      )}
                      {m.Web && (
                        <a href={m.Web.startsWith("http") ? m.Web : `https://${m.Web}`}
                          target="_blank" rel="noopener noreferrer"
                          className={`${styles.contactItem} ${styles.webLink}`} title="Web Sitesi">
                          🌐 {m.Web}
                        </a>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className={styles.actionBtns}>
                      <button className={styles.editBtn} onClick={() => openEdit(m)} title="Düzenle">
                        <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                          <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
                        </svg>
                      </button>
                      <button className={styles.deleteBtn} onClick={() => setDeleteTarget(m)} title="Pasifleştir">
                        <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                          <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
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
            <button className={styles.pageBtn} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
              </svg>
            </button>
            {pageNumbers().map((p, i) => p === "..." ? <span key={`dots-${i}`} className={styles.pageDots}>…</span> : (
              <button key={p} className={`${styles.pageBtn} ${p === page ? styles.pageBtnActive : ""}`} onClick={() => setPage(p as number)}>{p}</button>
            ))}
            <button className={styles.pageBtn} onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
            </button>
            <span className={styles.pageInfo}>Sayfa {page} / {totalPages}</span>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className={styles.modalOverlay} onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>{modalMode === "add" ? "Yeni Firma Ekle" : "Firmayı Düzenle"}</h2>
              <button className={styles.modalClose} onClick={() => setModalOpen(false)}>
                <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>
            <div className={styles.modalBody}>
              {formError && <div className={styles.formError}>{formError}</div>}
              <div className={styles.formGrid}>
                <div className={`${styles.formGroup} ${styles.colSpan2}`}>
                  <label>Firma Adı <span className={styles.required}>*</span></label>
                  <input value={form.Ad} onChange={e => handleFormChange("Ad", e.target.value)} placeholder="Firma adını girin" />
                </div>
                <div className={styles.formGroup}>
                  <label>Tür</label>
                  <select value={form.Tur2 || "Müşteri"} onChange={e => handleFormChange("Tur2", e.target.value)}>
                    <option value="Müşteri">Müşteri</option>
                    <option value="Tedarikçi">Tedarikçi</option>
                    <option value="Her ikisi">Her ikisi</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label>Yetkili</label>
                  <input value={form.Yetkili || ""} onChange={e => handleFormChange("Yetkili", e.target.value)} placeholder="İsim Soyisim" />
                </div>
                <div className={`${styles.formGroup} ${styles.colSpan2}`}>
                  <label>Adres</label>
                  <textarea value={form.Adres || ""} onChange={e => handleFormChange("Adres", e.target.value)} rows={2} />
                </div>
                <div className={styles.formGroup}><label>V.Dairesi</label><input value={form.VergiDairesi || ""} onChange={e => handleFormChange("VergiDairesi", e.target.value)} /></div>
                <div className={styles.formGroup}><label>V.No</label><input value={form.VergiNo || ""} onChange={e => handleFormChange("VergiNo", e.target.value)} /></div>
                <div className={styles.formGroup}><label>Telefon</label><input value={form.Telefon || ""} onChange={e => handleFormChange("Telefon", e.target.value)} /></div>
                <div className={styles.formGroup}><label>E-posta</label><input value={form.Email || ""} onChange={e => handleFormChange("Email", e.target.value)} /></div>
                <div className={`${styles.formGroup} ${styles.colSpan2}`}><label>Web</label><input value={form.Web || ""} onChange={e => handleFormChange("Web", e.target.value)} /></div>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setModalOpen(false)}>İptal</button>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>{saving ? "..." : "KAYDET"}</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className={styles.modalOverlay} onClick={() => setDeleteTarget(null)}>
          <div className={`${styles.modal} ${styles.modalSm}`}>
            <div className={styles.modalHeader}><h2>Pasifleştir</h2></div>
            <div className={styles.modalBody}><p>{deleteTarget.Ad} pasifleştirilsin mi?</p></div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setDeleteTarget(null)}>Hayır</button>
              <button className={styles.deleteBtnPrimary} onClick={handleDelete} disabled={deleting}>Evet</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
