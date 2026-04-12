"use client";

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import styles from "@/app/styles/table.module.css";

interface Hizmet {
  ID: number;
  Kod: string;
  Ad: string;
  AdEn: string;
  Method: string;
  MethodEn: string;
  Matriks: string;
  Akreditasyon: string;
  Sure: number | null;
  NumGereklilik: string;
  NumDipnot: string;
  NumDipnotEn: string;
  Fiyat: number | null;
  ParaBirimi: string;
  Durumu: string;
  RaporFormati: string;        // comma-separated: "Genel,Stabilite"
  YetkiliID: number | null;
  Limit?: string;              // NEW: Test limit range (e.g., "0-100")
  Birim?: string;              // NEW: Unit (e.g., "ppm", "mg/L")
  LOQ?: string;                // NEW: Limit of Quantification
  LimitEn?: string;            // NEW: English limit
  BirimEn?: string;            // NEW: English unit
  LOQEn?: string;              // NEW: English LOQ
}

interface Kullanici { ID: number; Ad: string; }

const RAPOR_FORMATLARI = ["Genel", "Stabilite", "Challenge", "Dermatoloji"] as const;

const EMPTY: Partial<Hizmet> = {
  Kod: "", Ad: "", AdEn: "", Method: "", MethodEn: "",
  Matriks: "", Akreditasyon: "Yok", Sure: undefined,
  NumGereklilik: "", NumDipnot: "", NumDipnotEn: "",
  Fiyat: undefined, ParaBirimi: "₺", Durumu: "Aktif",
  RaporFormati: "", YetkiliID: null,
  Limit: "", Birim: "", LOQ: "", LimitEn: "", BirimEn: "", LOQEn: "",
};

export default function HizmetTable() {
  const [rows, setRows]         = useState<Hizmet[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [limit, setLimit]       = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch]     = useState("");
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");

  // Modals
  const [detailRow, setDetailRow]   = useState<Hizmet | null>(null);
  const [editRow, setEditRow]       = useState<Partial<Hizmet> | null>(null);
  const [isNew, setIsNew]           = useState(false);
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState("");
  const [modalTab, setModalTab]     = useState(0);  // 0: Genel, 1: Teknik

  const [kullanicilar, setKullanicilar] = useState<Kullanici[]>([]);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async (p: number, s: string, l: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/hizmetler?page=${p}&limit=${l}&search=${encodeURIComponent(s)}`
      );
      if (!res.ok) throw new Error((await res.json()).error || "Hata");
      const json = await res.json();
      setRows(json.data);
      setTotal(json.total);
      setTotalPages(json.totalPages);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(page, search, limit); }, [page, limit]);

  useEffect(() => {
    fetch("/api/kullanicilar")
      .then(r => r.json())
      .then((d: { data?: Kullanici[] }) => { if (d.data) setKullanicilar(d.data); })
      .catch(() => {});
  }, []);

  const toggleRaporFormati = (fmt: string, checked: boolean) => {
    setEditRow(prev => {
      if (!prev) return prev;
      const current = (prev.RaporFormati || "").split(",").filter(Boolean);
      const next = checked ? [...new Set([...current, fmt])] : current.filter(f => f !== fmt);
      return { ...prev, RaporFormati: next.join(",") };
    });
  };

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      fetchData(1, val, limit);
    }, 350);
  };

  // ── Save (create / update) ──
  const handleSave = async () => {
    if (!editRow) return;
    setSaving(true);
    setFormError("");
    try {
      const url    = isNew ? "/api/hizmetler" : `/api/hizmetler/${editRow.ID}`;
      const method = isNew ? "POST" : "PUT";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editRow),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Kayıt hatası");
      setEditRow(null);
      fetchData(page, search, limit);
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const openNew  = () => { setIsNew(true);  setFormError(""); setEditRow({ ...EMPTY }); setModalTab(0); };
  const openEdit = (row: Hizmet) => { setIsNew(false); setFormError(""); setEditRow({ ...row }); setModalTab(0); };
  const closeEdit = () => { setEditRow(null); setModalTab(0); };

  // ── Pagination helpers ──
  const goTo = (p: number) => { if (p >= 1 && p <= totalPages) setPage(p); };

  const pageNums = () => {
    const nums: (number | "…")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) nums.push(i);
    } else {
      nums.push(1);
      if (page > 3) nums.push("…");
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) nums.push(i);
      if (page < totalPages - 2) nums.push("…");
      nums.push(totalPages);
    }
    return nums;
  };

  const fiyatLabel = (row: Hizmet) =>
    row.Fiyat != null ? `${row.Fiyat.toLocaleString("tr-TR")} ${row.ParaBirimi}` : "";

  return (
    <>
      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchBox}>
            <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
            </svg>
            <input
              className={styles.searchInput}
              placeholder="Kod, ad veya metot ara…"
              value={search}
              onChange={e => handleSearch(e.target.value)}
            />
            {search && (
              <button className={styles.searchClear} onClick={() => handleSearch("")}>
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            )}
          </div>
          <span className={styles.totalCount}>{total} hizmet</span>
        </div>
        <div className={styles.toolbarRight}>
          <select
            className={styles.pageSizeSelect}
            value={limit}
            onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
          >
            {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n} / sayfa</option>)}
          </select>
          <button className={styles.addBtn} onClick={openNew}>
            <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
            Yeni Hizmet
          </button>
        </div>
      </div>

      {/* ── Tablo ── */}
      <div className={styles.tableCard}>
        {error && <div className={styles.errorBar}>{error}</div>}
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 24 }}></th>
                <th>Kod</th>
                <th>Ad</th>
                <th>Metot</th>
                <th>Süre (gün)</th>
                <th>Numune Gereklilik</th>
                <th>Liste Fiyatı</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j}><span className={styles.skeleton} /></td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className={styles.empty}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="36" height="36">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                      </svg>
                      Kayıt bulunamadı
                    </div>
                  </td>
                </tr>
              ) : rows.map((row, idx) => (
                <tr key={row.ID}>
                  <td className={styles.tdNum}
                    style={{ textAlign: "center", fontWeight: 700, fontSize: "0.82rem", color: "#0071e3" }}>
                    {row.Akreditasyon === "Var" ? "*" : ""}
                  </td>
                  <td className={styles.tdMono}>{row.Kod}</td>
                  <td className={styles.tdName}>{row.Ad}</td>
                  <td className={styles.tdSecondary}>{row.Method}</td>
                  <td className={styles.tdMono}>{row.Sure ?? ""}</td>
                  <td className={styles.tdSecondary}>{row.NumGereklilik}</td>
                  <td className={styles.tdMono}>{fiyatLabel(row)}</td>
                  <td>
                    <div className={styles.actionBtns}>
                      {/* Detaylar */}
                      <button
                        className={styles.editBtn}
                        title="Detaylar"
                        onClick={() => setDetailRow(row)}
                        style={{ width: "auto", padding: "0 8px", fontSize: "0.75rem", gap: 4 }}
                      >
                        <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                          <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                          <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
                        </svg>
                        Detay
                      </button>
                      {/* Düzenle */}
                      <button
                        className={styles.editBtn}
                        title="Düzenle"
                        onClick={() => openEdit(row)}
                      >
                        <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                          <path d="M5.433 13.917l1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
                          <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Sayfalama ── */}
        {totalPages > 1 && (
          <div className={styles.pagination}>
            <button className={styles.pageBtn} onClick={() => goTo(page - 1)} disabled={page === 1}>‹</button>
            {pageNums().map((n, i) =>
              n === "…"
                ? <span key={`d${i}`} className={styles.pageDots}>…</span>
                : <button
                    key={n}
                    className={`${styles.pageBtn} ${page === n ? styles.pageBtnActive : ""}`}
                    onClick={() => goTo(n as number)}
                  >{n}</button>
            )}
            <button className={styles.pageBtn} onClick={() => goTo(page + 1)} disabled={page === totalPages}>›</button>
            <span className={styles.pageInfo}>{total} kayıt</span>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════
          DETAY POPUP
      ══════════════════════════════════════════════ */}
      {detailRow && (
        <div className={styles.modalOverlay} onClick={() => setDetailRow(null)}>
          <div className={styles.modal} style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{detailRow.Kod} — {detailRow.Ad}</h2>
              <button className={styles.modalClose} onClick={() => setDetailRow(null)}>
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"/>
                </svg>
              </button>
            </div>
            <div className={styles.modalBody}>
              <DetailSection label="Türkçe" items={[
                ["Akreditasyon", detailRow.Akreditasyon === "Var" ? "Var ✓" : "Yok"],
                ["Ad",           detailRow.Ad],
                ["Metot",        detailRow.Method],
                ["Matriks",      detailRow.Matriks],
                ["Süre (gün)",   detailRow.Sure != null ? String(detailRow.Sure) : "—"],
                ["Numune Gereklilik", detailRow.NumGereklilik || "—"],
                ["Dipnot",       detailRow.NumDipnot || "—"],
                ["Fiyat",        fiyatLabel(detailRow) || "—"],
                ["Rapor Formatı", detailRow.RaporFormati?.split(",").filter(Boolean).join(", ") || "—"],
                ["Yetkili",      kullanicilar.find(k => k.ID === detailRow.YetkiliID)?.Ad || (detailRow.YetkiliID ? `#${detailRow.YetkiliID}` : "—")],
              ]} />
              <div style={{ height: 16 }} />
              <DetailSection label="English" items={[
                ["Name",         detailRow.AdEn    || "—"],
                ["Method",       detailRow.MethodEn || "—"],
                ["Note",         detailRow.NumDipnotEn || "—"],
              ]} />
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          DÜZENLE / YENİ EKLEME FORMU
      ══════════════════════════════════════════════ */}
      {editRow && (
        <div className={styles.modalOverlay} onClick={closeEdit}>
          <div className={styles.modal} style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2>{isNew ? "Yeni Hizmet" : `Düzenle — ${editRow.Kod}`}</h2>
                {/* Tab buttons */}
                <div style={{ display: "flex", gap: "4px", marginTop: "8px", borderBottom: "1px solid var(--color-border)", paddingBottom: 0 }}>
                  <button
                    onClick={() => setModalTab(0)}
                    style={{
                      padding: "8px 12px",
                      outline: "none",
                      borderTop: "none",
                      borderRight: "none",
                      borderLeft: "none",
                      borderBottom: modalTab === 0 ? "2px solid var(--color-accent)" : "2px solid transparent",
                      color: modalTab === 0 ? "var(--color-accent)" : "var(--color-text-secondary)",
                      fontSize: "0.85rem",
                      fontWeight: modalTab === 0 ? 500 : 400,
                      cursor: "pointer",
                      background: "none",
                      transition: "all 0.2s",
                    }}
                  >
                    Genel Bilgiler
                  </button>
                  <button
                    onClick={() => setModalTab(1)}
                    style={{
                      padding: "8px 12px",
                      outline: "none",
                      borderTop: "none",
                      borderRight: "none",
                      borderLeft: "none",
                      borderBottom: modalTab === 1 ? "2px solid var(--color-accent)" : "2px solid transparent",
                      color: modalTab === 1 ? "var(--color-accent)" : "var(--color-text-secondary)",
                      fontSize: "0.85rem",
                      fontWeight: modalTab === 1 ? 500 : 400,
                      cursor: "pointer",
                      background: "none",
                      transition: "all 0.2s",
                    }}
                  >
                    Teknik Bilgiler
                  </button>
                </div>
              </div>
              <button className={styles.modalClose} onClick={closeEdit}>
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"/>
                </svg>
              </button>
            </div>
            <div className={styles.modalBody}>
              {formError && <div className={styles.formError}>{formError}</div>}

              {/* ── TAB 0: Genel Bilgiler ── */}
              {modalTab === 0 && (
                <>

              {/* Satır 1: Kod + Akreditasyon + Matriks */}
              <div className={styles.formGrid3} style={{ marginBottom: 14 }}>
                <div className={styles.formGroup}>
                  <label>Kod <span className={styles.required}>*</span></label>
                  <input value={editRow.Kod || ""} onChange={e => setEditRow(p => ({ ...p!, Kod: e.target.value }))} />
                </div>
                <div className={styles.formGroup}>
                  <label>Akreditasyon</label>
                  <select value={editRow.Akreditasyon || "Yok"} onChange={e => setEditRow(p => ({ ...p!, Akreditasyon: e.target.value }))}>
                    <option value="Var">Var</option>
                    <option value="Yok">Yok</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label>Matriks</label>
                  <input value={editRow.Matriks || ""} onChange={e => setEditRow(p => ({ ...p!, Matriks: e.target.value }))} />
                </div>
              </div>

              {/* Satır 2: Ad + AdEn */}
              <div className={styles.formGrid} style={{ marginBottom: 14 }}>
                <div className={styles.formGroup}>
                  <label>Ad (TR) <span className={styles.required}>*</span></label>
                  <input value={editRow.Ad || ""} onChange={e => setEditRow(p => ({ ...p!, Ad: e.target.value }))} />
                </div>
                <div className={styles.formGroup}>
                  <label>Ad (EN)</label>
                  <input value={editRow.AdEn || ""} onChange={e => setEditRow(p => ({ ...p!, AdEn: e.target.value }))} />
                </div>
              </div>

              {/* Satır 3: Method TR + Method EN */}
              <div className={styles.formGrid} style={{ marginBottom: 14 }}>
                <div className={styles.formGroup}>
                  <label>Metot (TR)</label>
                  <input value={editRow.Method || ""} onChange={e => setEditRow(p => ({ ...p!, Method: e.target.value }))} />
                </div>
                <div className={styles.formGroup}>
                  <label>Metot (EN)</label>
                  <input value={editRow.MethodEn || ""} onChange={e => setEditRow(p => ({ ...p!, MethodEn: e.target.value }))} />
                </div>
              </div>

              {/* Satır 4: Süre + NumGereklilik + Fiyat + Para */}
              <div className={styles.formGrid} style={{ marginBottom: 14 }}>
                <div className={styles.formGroup}>
                  <label>Süre (gün)</label>
                  <input type="number" min={0} value={editRow.Sure ?? ""} onChange={e => setEditRow(p => ({ ...p!, Sure: e.target.value ? Number(e.target.value) : undefined }))} />
                </div>
                <div className={styles.formGroup}>
                  <label>Numune Gereklilik</label>
                  <input value={editRow.NumGereklilik || ""} onChange={e => setEditRow(p => ({ ...p!, NumGereklilik: e.target.value }))} />
                </div>
              </div>
              <div className={styles.formGrid} style={{ marginBottom: 14 }}>
                <div className={styles.formGroup}>
                  <label>Fiyat</label>
                  <input type="number" min={0} step="0.01" value={editRow.Fiyat ?? ""} onChange={e => setEditRow(p => ({ ...p!, Fiyat: e.target.value ? Number(e.target.value) : undefined }))} />
                </div>
                <div className={styles.formGroup}>
                  <label>Para Birimi</label>
                  <select value={editRow.ParaBirimi || "₺"} onChange={e => setEditRow(p => ({ ...p!, ParaBirimi: e.target.value }))}>
                    <option value="₺">₺ — Türk Lirası</option>
                    <option value="$">$ — Dolar</option>
                    <option value="€">€ — Euro</option>
                  </select>
                </div>
              </div>

              {/* Satır 5: Dipnot TR */}
              <div className={styles.formGroup} style={{ marginBottom: 14 }}>
                <label>Dipnot (TR)</label>
                <textarea rows={2} value={editRow.NumDipnot || ""} onChange={e => setEditRow(p => ({ ...p!, NumDipnot: e.target.value }))} />
              </div>

              {/* Satır 6: Dipnot EN */}
              <div className={styles.formGroup} style={{ marginBottom: 14 }}>
                <label>Dipnot (EN)</label>
                <textarea rows={2} value={editRow.NumDipnotEn || ""} onChange={e => setEditRow(p => ({ ...p!, NumDipnotEn: e.target.value }))} />
              </div>

                </>
              )}

              {/* ── TAB 1: Teknik Bilgiler ── */}
              {modalTab === 1 && (
                <>

              {/* Limit (TR + EN) */}
              <div className={styles.formGrid} style={{ marginBottom: 14 }}>
                <div className={styles.formGroup}>
                  <label>Limit (TR)</label>
                  <input value={editRow.Limit || ""} onChange={e => setEditRow(p => ({ ...p!, Limit: e.target.value }))} placeholder="ör: 0-100" />
                </div>
                <div className={styles.formGroup}>
                  <label>Limit (EN)</label>
                  <input value={editRow.LimitEn || ""} onChange={e => setEditRow(p => ({ ...p!, LimitEn: e.target.value }))} placeholder="e.g. 0-100" />
                </div>
              </div>

              {/* Birim (TR + EN) */}
              <div className={styles.formGrid} style={{ marginBottom: 14 }}>
                <div className={styles.formGroup}>
                  <label>Birim (TR)</label>
                  <input value={editRow.Birim || ""} onChange={e => setEditRow(p => ({ ...p!, Birim: e.target.value }))} placeholder="ör: ppm" />
                </div>
                <div className={styles.formGroup}>
                  <label>Birim (EN)</label>
                  <input value={editRow.BirimEn || ""} onChange={e => setEditRow(p => ({ ...p!, BirimEn: e.target.value }))} placeholder="e.g. ppm" />
                </div>
              </div>

              {/* LOQ (TR + EN) */}
              <div className={styles.formGrid} style={{ marginBottom: 14 }}>
                <div className={styles.formGroup}>
                  <label>LOQ (TR)</label>
                  <input value={editRow.LOQ || ""} onChange={e => setEditRow(p => ({ ...p!, LOQ: e.target.value }))} placeholder="ör: 1" />
                </div>
                <div className={styles.formGroup}>
                  <label>LOQ (EN)</label>
                  <input value={editRow.LOQEn || ""} onChange={e => setEditRow(p => ({ ...p!, LOQEn: e.target.value }))} placeholder="e.g. 1" />
                </div>
              </div>

              {/* Satır 3: Rapor Formatı (çoktan seçmeli) */}
              <div className={styles.formGroup} style={{ marginBottom: 14 }}>
                <label>Rapor Formatı</label>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", paddingTop: 4 }}>
                  {RAPOR_FORMATLARI.map(fmt => {
                    const checked = (editRow.RaporFormati || "").split(",").includes(fmt);
                    return (
                      <label key={fmt} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", cursor: "pointer", userSelect: "none" }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => toggleRaporFormati(fmt, e.target.checked)}
                          style={{ width: 15, height: 15, accentColor: "var(--color-accent)" }}
                        />
                        {fmt}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Satır 4: Yetkili Kişi */}
              <div className={styles.formGroup} style={{ marginBottom: 14 }}>
                <label>Yetkili Kişi</label>
                <select
                  value={editRow.YetkiliID != null ? String(editRow.YetkiliID) : ""}
                  onChange={e => setEditRow(p => ({ ...p!, YetkiliID: e.target.value ? Number(e.target.value) : null }))}
                >
                  <option value="">— Seçilmedi —</option>
                  {kullanicilar.map(k => <option key={k.ID} value={k.ID}>{k.Ad}</option>)}
                </select>
              </div>

              {/* Satır 5: Durum — sadece düzenlemede göster */}
              {!isNew && (
                <div className={styles.formGroup}>
                  <label>Durum</label>
                  <select value={editRow.Durumu || "Aktif"} onChange={e => setEditRow(p => ({ ...p!, Durumu: e.target.value }))}>
                    <option value="Aktif">Aktif</option>
                    <option value="Pasif">Pasif</option>
                  </select>
                </div>
              )}

                </>
              )}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={closeEdit} disabled={saving}>İptal</button>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                {saving ? <span className={styles.loader} /> : isNew ? "Kaydet" : "Güncelle"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Küçük yardımcı bileşen: detay popup'ı için ──
function DetailSection({ label, items }: { label: string; items: [string, string][] }) {
  return (
    <div>
      <div style={{
        fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase",
        letterSpacing: "0.06em", color: "var(--color-text-tertiary)",
        marginBottom: 8,
      }}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", rowGap: 8 }}>
        {items.map(([k, v]) => (
          <Fragment key={k}>
            <span style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", fontWeight: 500 }}>{k}</span>
            <span style={{ fontSize: "0.845rem", color: "var(--color-text-primary)" }}>{v}</span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
