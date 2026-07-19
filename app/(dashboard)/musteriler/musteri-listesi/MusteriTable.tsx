"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import styles from '@/app/styles/table.module.css';

const upperTr = (value?: string | null) => value ? value.toLocaleUpperCase("tr-TR") : "";
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

interface CariRow {
  Kaynak: string;
  KaynakID: number;
  BelgeNo: string;
  Tarih: string | null;
  Durum: string | null;
  Tutar: number | string;
  ParaBirimi: string;
  Yon: string;
  OdemeYeri: string | null;
  Aciklama: string | null;
}

interface CariSummary {
  paraBirimi: string;
  teklif: number;
  proforma: number;
  fatura: number;
  gelenOdeme: number;
  gidenOdeme: number;
  net: number;
}

// Form, listede dönmeyen Parola alanını da taşır (yalnızca kayıt/güncelleme için).
type FirmaForm = Omit<Musteri, "ID" | "Kimin"> & { Parola: string };

const emptyForm: FirmaForm = {
  Ad: "", Adres: "", VergiDairesi: "", VergiNo: "",
  Telefon: "", Email: "", Web: "", Tur2: "Müşteri", Yetkili: "", Parola: "",
};

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const CARI_TIPLER = ["Tümü", "Teklif", "Proforma", "Fatura", "Ödeme"];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function fmtMoney(value: number | string | null | undefined, currency = "TRY") {
  const n = Number(value || 0);
  const cur = currency === "TL" || currency === "TRY" ? "TRY" : currency;
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: cur || "TRY",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ${currency || "TRY"}`;
  }
}

function fmtTarih(value?: string | null) {
  if (!value) return "-";
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(value);
}

// ----------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------
export default function MusteriTable({ filterKimin }: { filterKimin?: string }) {
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
  const [form, setForm] = useState<FirmaForm>(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<Musteri | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [cariTarget, setCariTarget] = useState<Musteri | null>(null);
  const [cariRows, setCariRows] = useState<CariRow[]>([]);
  const [cariSummary, setCariSummary] = useState<CariSummary[]>([]);
  const [cariLoading, setCariLoading] = useState(false);
  const [cariError, setCariError] = useState("");
  const [cariTip, setCariTip] = useState("Tümü");
  const [cariTarihBas, setCariTarihBas] = useState("");
  const [cariTarihBit, setCariTarihBit] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [paymentForm, setPaymentForm] = useState({
    tip: "Gelen Ödeme",
    tutar: "",
    paraBirimi: "TRY",
    tarih: todayIso(),
    odemeYeri: "",
    aciklama: "",
  });

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async (s: string, p: number, l: number) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ search: s, page: String(p), limit: String(l) });
      if (filterKimin) params.set("kimin", filterKimin);
      const res = await fetch(`/api/firmalar?${params}`);
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
  }, [filterKimin]);

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
      Web: m.Web || "", Tur2: m.Tur2 || "Müşteri", Yetkili: m.Yetkili || "", Parola: "",
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
      const url = modalMode === "edit" ? `/api/firmalar/${editId}` : "/api/firmalar";
      const method = modalMode === "edit" ? "PUT" : "POST";
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, Kimin: filterKimin }),
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
      const res = await fetch(`/api/firmalar/${deleteTarget.ID}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "İşlem başarısız");
      setDeleteTarget(null);
      fetchData(search, page, limit);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const fetchCari = useCallback(async (firma: Musteri, tip = cariTip, tarihBas = cariTarihBas, tarihBit = cariTarihBit) => {
    setCariLoading(true);
    setCariError("");
    try {
      const params = new URLSearchParams({ tip, tarihBas, tarihBit });
      const res = await fetch(`/api/firmalar/${firma.ID}/cari?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Cari hareketleri alınamadı.");
      setCariRows(Array.isArray(json.data) ? json.data : []);
      setCariSummary(Array.isArray(json.summary) ? json.summary : []);
    } catch (e: any) {
      setCariError(e.message || "Cari hareketleri alınamadı.");
    } finally {
      setCariLoading(false);
    }
  }, [cariTip, cariTarihBas, cariTarihBit]);

  const openCari = (m: Musteri) => {
    setCariTarget(m);
    setCariRows([]);
    setCariSummary([]);
    setCariTip("Tümü");
    setCariTarihBas("");
    setCariTarihBit("");
    setCariError("");
    setPaymentOpen(false);
    fetchCari(m, "Tümü", "", "");
  };

  const refreshCari = () => {
    if (!cariTarget) return;
    fetchCari(cariTarget, cariTip, cariTarihBas, cariTarihBit);
  };

  const submitPayment = async () => {
    if (!cariTarget) return;
    setPaymentSaving(true);
    setPaymentError("");
    try {
      const res = await fetch(`/api/firmalar/${cariTarget.ID}/cari`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentForm),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Ödeme kaydedilemedi.");
      setPaymentOpen(false);
      setPaymentForm({
        tip: "Gelen Ödeme",
        tutar: "",
        paraBirimi: "TRY",
        tarih: todayIso(),
        odemeYeri: "",
        aciklama: "",
      });
      refreshCari();
    } catch (e: any) {
      setPaymentError(e.message || "Ödeme kaydedilemedi.");
    } finally {
      setPaymentSaving(false);
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
                <th style={{ width: 112 }}></th>
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
                  <td className={styles.tdName}>{upperTr(m.Ad) || "—"}</td>
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
                      <button className={styles.editBtn} onClick={() => openCari(m)} title="Cari detayları">
                        <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                          <path d="M3 4.75A2.75 2.75 0 0 1 5.75 2h8.5A2.75 2.75 0 0 1 17 4.75v10.5A2.75 2.75 0 0 1 14.25 18h-8.5A2.75 2.75 0 0 1 3 15.25V4.75Zm2.75-1.25c-.69 0-1.25.56-1.25 1.25v10.5c0 .69.56 1.25 1.25 1.25h8.5c.69 0 1.25-.56 1.25-1.25V4.75c0-.69-.56-1.25-1.25-1.25h-8.5ZM6.5 6.75A.75.75 0 0 1 7.25 6h5.5a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1-.75-.75Zm0 3A.75.75 0 0 1 7.25 9h5.5a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1-.75-.75Zm0 3a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z" />
                        </svg>
                      </button>
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
        <div className={styles.modalOverlay}>
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
                    <option value="Proje">Proje</option>
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
                <div className={`${styles.formGroup} ${styles.colSpan2}`}>
                  <label>Şifre (firma giriş)</label>
                  <input
                    type="text"
                    value={form.Parola || ""}
                    maxLength={15}
                    autoComplete="off"
                    onChange={e => handleFormChange("Parola", e.target.value)}
                    placeholder={modalMode === "edit" ? "Boş bırakılırsa değişmez" : "En fazla 15 karakter"}
                  />
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

      {cariTarget && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: 1120 }}>
            <div className={styles.modalHeader}>
              <div>
                <h2>Cari Detayları</h2>
                <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 4 }}>
                  {upperTr(cariTarget.Ad)}
                </div>
              </div>
              <button className={styles.modalClose} onClick={() => setCariTarget(null)}>
                <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.toolbar} style={{ marginBottom: 14 }}>
                <div className={styles.toolbarLeft}>
                  <select
                    className={styles.pageSizeSelect}
                    value={cariTip}
                    onChange={e => {
                      const next = e.target.value;
                      setCariTip(next);
                      fetchCari(cariTarget, next, cariTarihBas, cariTarihBit);
                    }}
                  >
                    {CARI_TIPLER.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input
                    type="date"
                    value={cariTarihBas}
                    onChange={e => {
                      setCariTarihBas(e.target.value);
                      fetchCari(cariTarget, cariTip, e.target.value, cariTarihBit);
                    }}
                    className={styles.pageSizeSelect}
                    title="Başlangıç tarihi"
                  />
                  <input
                    type="date"
                    value={cariTarihBit}
                    onChange={e => {
                      setCariTarihBit(e.target.value);
                      fetchCari(cariTarget, cariTip, cariTarihBas, e.target.value);
                    }}
                    className={styles.pageSizeSelect}
                    title="Bitiş tarihi"
                  />
                  {(cariTarihBas || cariTarihBit || cariTip !== "Tümü") && (
                    <button
                      className={styles.cancelBtn}
                      type="button"
                      onClick={() => {
                        setCariTip("Tümü");
                        setCariTarihBas("");
                        setCariTarihBit("");
                        fetchCari(cariTarget, "Tümü", "", "");
                      }}
                    >
                      Temizle
                    </button>
                  )}
                </div>
                <div className={styles.toolbarRight}>
                  <button
                    className={styles.addBtn}
                    type="button"
                    onClick={() => {
                      setPaymentError("");
                      setPaymentOpen(v => !v);
                    }}
                  >
                    Ödeme Ekle
                  </button>
                </div>
              </div>

              {paymentOpen && (
                <div style={{ border: "1px solid var(--color-border-light)", borderRadius: 10, padding: 14, marginBottom: 14, background: "var(--color-surface-2)" }}>
                  {paymentError && <div className={styles.formError}>{paymentError}</div>}
                  <div className={styles.formGrid3}>
                    <div className={styles.formGroup}>
                      <label>Ödeme Tipi</label>
                      <select value={paymentForm.tip} onChange={e => setPaymentForm(f => ({ ...f, tip: e.target.value }))}>
                        <option value="Gelen Ödeme">Firma Bize Ödedi</option>
                        <option value="Giden Ödeme">Biz Firmaya Ödedik</option>
                      </select>
                    </div>
                    <div className={styles.formGroup}>
                      <label>Tutar</label>
                      <input value={paymentForm.tutar} inputMode="decimal" onChange={e => setPaymentForm(f => ({ ...f, tutar: e.target.value }))} placeholder="0,00" />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Para Birimi</label>
                      <select value={paymentForm.paraBirimi} onChange={e => setPaymentForm(f => ({ ...f, paraBirimi: e.target.value }))}>
                        <option value="TRY">TRY</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="GBP">GBP</option>
                      </select>
                    </div>
                    <div className={styles.formGroup}>
                      <label>Tarih</label>
                      <input type="date" value={paymentForm.tarih} onChange={e => setPaymentForm(f => ({ ...f, tarih: e.target.value }))} />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Nereye Ödedi</label>
                      <input value={paymentForm.odemeYeri} onChange={e => setPaymentForm(f => ({ ...f, odemeYeri: e.target.value }))} placeholder="Banka, kasa, kredi kartı..." />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Açıklama</label>
                      <input value={paymentForm.aciklama} onChange={e => setPaymentForm(f => ({ ...f, aciklama: e.target.value }))} placeholder="İsteğe bağlı" />
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                    <button className={styles.cancelBtn} type="button" onClick={() => setPaymentOpen(false)} disabled={paymentSaving}>Vazgeç</button>
                    <button className={styles.saveBtn} type="button" onClick={submitPayment} disabled={paymentSaving}>
                      {paymentSaving ? "Kaydediliyor..." : "Kaydet"}
                    </button>
                  </div>
                </div>
              )}

              {cariError && <div className={styles.errorBar} style={{ marginBottom: 12 }}>{cariError}</div>}

              <div className={styles.tableWrapper} style={{ border: "1px solid var(--color-border-light)", borderRadius: 10 }}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Tip</th>
                      <th>Belge No</th>
                      <th>Tarih</th>
                      <th>Durum</th>
                      <th>Yön</th>
                      <th>Ödeme Yeri</th>
                      <th style={{ textAlign: "right" }}>Tutar</th>
                      <th>Açıklama</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cariLoading ? (
                      <tr><td colSpan={8} className={styles.empty}>Cari hareketleri yükleniyor...</td></tr>
                    ) : cariRows.length === 0 ? (
                      <tr><td colSpan={8} className={styles.empty}>Cari hareket bulunamadı.</td></tr>
                    ) : cariRows.map((row, idx) => (
                      <tr key={`${row.Kaynak}-${row.KaynakID}-${idx}`}>
                        <td><span className={styles.badge}>{row.Kaynak}</span></td>
                        <td className={styles.tdMono}>{row.BelgeNo || "-"}</td>
                        <td>{fmtTarih(row.Tarih)}</td>
                        <td>{row.Durum || "-"}</td>
                        <td>{row.Yon || "-"}</td>
                        <td>{row.OdemeYeri || "-"}</td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                          {fmtMoney(row.Tutar, row.ParaBirimi)}
                        </td>
                        <td className={styles.tdAdres} title={row.Aciklama || ""}>{row.Aciklama || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10, marginTop: 14 }}>
                {cariSummary.length === 0 ? (
                  <div style={{ color: "var(--color-text-tertiary)", fontSize: 13 }}>Toplam hesaplanacak hareket yok.</div>
                ) : cariSummary.map(s => (
                  <div key={s.paraBirimi} style={{ border: "1px solid var(--color-border-light)", borderRadius: 10, padding: 12, background: "var(--color-surface-2)" }}>
                    <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 6 }}>{s.paraBirimi}</div>
                    <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
                      <div>Teklif: <strong>{fmtMoney(s.teklif, s.paraBirimi)}</strong></div>
                      <div>Proforma: <strong>{fmtMoney(s.proforma, s.paraBirimi)}</strong></div>
                      <div>Fatura: <strong>{fmtMoney(s.fatura, s.paraBirimi)}</strong></div>
                      <div>Gelen ödeme: <strong>{fmtMoney(s.gelenOdeme, s.paraBirimi)}</strong></div>
                      <div>Giden ödeme: <strong>{fmtMoney(s.gidenOdeme, s.paraBirimi)}</strong></div>
                      <div style={{ borderTop: "1px solid var(--color-border-light)", paddingTop: 6, marginTop: 4 }}>
                        Net bakiye: <strong>{fmtMoney(s.net, s.paraBirimi)}</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setCariTarget(null)}>Kapat</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className={styles.modalOverlay}>
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
