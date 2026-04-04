"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import styles from '@/app/styles/table.module.css';
interface Cosing {
  ID: number;
  CosIngID: string;
  Link: string;
  INCIName: string;
  Tur: string;
  Cas: string;
  EC: string;
  Functions: string;
  Regulation: string;
  SCCS: string;
  SCCSLink: string;
}

interface Hammadde {
  Mix: string;
  GenelAd: string;
  Noael2: string | number;
  Fizikokimya: string;
  Toksikoloji: string;
  Kaynak: string;
  EkBilgi: string;
}

interface ApiResponse {
  data: Cosing[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const PAGE_SIZE_OPTIONS = [20, 50, 100];

export default function CosingTable() {
  const [data, setData] = useState<Cosing[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  // Modal Detayları
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeID, setActiveID] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState(1);
  const [detailData, setDetailData] = useState<{
    hammadde: Hammadde,
    cosing: Partial<Cosing>
  }>({
    hammadde: { Mix: "", GenelAd: "", Noael2: "", Fizikokimya: "", Toksikoloji: "", Kaynak: "", EkBilgi: "" },
    cosing: {}
  });
  const [saving, setSaving] = useState(false);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async (s: string, p: number, l: number) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ search: s, page: String(p), limit: String(l) });
      const res = await fetch(`/api/cosing?${params}`);
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

  useEffect(() => {
    fetchData(search, page, limit);
  }, [page, limit, fetchData, search]);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setPage(1);
      fetchData(val, 1, limit);
    }, 400);
  };

  const openDetails = async (id: number) => {
    setActiveID(id);
    setDetailModalOpen(true);
    setDetailLoading(true);
    setActiveTab(1);
    try {
      const res = await fetch(`/api/cosing?id=${id}`);
      if (!res.ok) throw new Error("Detaylar alınamadı");
      const json = await res.json();
      setDetailData({
        hammadde: json.hammadde || { Mix: "", GenelAd: "", Noael2: "", Fizikokimya: "", Toksikoloji: "", Kaynak: "", EkBilgi: "" },
        cosing: json.cosing || {}
      });
    } catch (e: any) {
      alert(e.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleUpdate = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/cosing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeID, hammadde: detailData.hammadde }),
      });
      if (!res.ok) throw new Error("Güncelleme başarısız");
      alert("Başarıyla güncellendi!");
    } catch (e: any) {
      alert(e.message);
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
              placeholder="INCI, Cas, EC veya Fonksiyon..."
              value={search}
              onChange={e => handleSearch(e.target.value)}
              className={styles.searchInput}
            />
          </div>
        </div>
        <div className={styles.toolbarRight}>
          <span className={styles.totalCount}>{total} içerik</span>
          <select className={styles.pageSizeSelect} value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
            {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n} / sayfa</option>)}
          </select>
        </div>
      </div>

      <div className={styles.tableCard}>
        {error && <div className={styles.errorBar}>{error}</div>}
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 90 }}>CosIngID</th>
                <th>INCIName</th>
                <th>Cas / EC</th>
                <th>Annex (Reg)</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 15 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 5 }).map((__, j) => (
                    <td key={j}><div className={styles.skeleton} /></td>
                  ))}</tr>
                ))
              ) : data.length === 0 ? (
                <tr><td colSpan={5}><div className={styles.empty}>Sonuç bulunamadı.</div></td></tr>
              ) : data.map((row) => (
                <tr key={row.ID}>
                  <td className={styles.tdMono}>
                    <a href={row.Link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)', textDecoration: 'none' }}>
                      {row.CosIngID}
                    </a>
                  </td>
                  <td className={styles.tdName}>{row.INCIName}</td>
                  <td className={styles.tdMono}>
                    {row.Cas && <div>{row.Cas}</div>}
                    {row.EC && <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>{row.EC}</div>}
                  </td>
                  <td>{row.Regulation || "—"}</td>
                  <td>
                    <button className={styles.editBtn} onClick={() => openDetails(row.ID)} style={{ width: 'auto', padding: '0 10px', fontSize: '0.75rem' }}>
                      Detaylar
                    </button>
                  </td>
                </tr>
              ))}
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
          </div>
        )}
      </div>

      {detailModalOpen && (
        <div className={styles.modalOverlay} onClick={e => e.target === e.currentTarget && setDetailModalOpen(false)}>
          <div className={styles.modal} style={{ maxWidth: 850 }}>
            <div className={styles.modalHeader}>
              <h2>İçerik Detayları</h2>
              <button className={styles.modalClose} onClick={() => setDetailModalOpen(false)}>&times;</button>
            </div>
            
            <div className={styles.tabs} style={{ display: 'flex', borderBottom: '1px solid var(--color-border-light)' }}>
              {["Genel Bilgiler", "Toksikoloji", "Ek Bilgiler"].map((label, t) => (
                <button key={t} onClick={() => setActiveTab(t+1)} 
                  style={{
                    padding: '12px 24px', border: 'none', background: 'none', cursor: 'pointer',
                    borderBottom: activeTab === (t+1) ? '2px solid var(--color-accent)' : 'none',
                    fontWeight: activeTab === (t+1) ? 600 : 400, color: activeTab === (t+1) ? 'var(--color-accent)' : 'var(--color-text-secondary)'
                  }}>
                  {label}
                </button>
              ))}
            </div>

            <div className={styles.modalBody} style={{ minHeight: 450 }}>
              {detailLoading ? <div className={styles.skeleton} style={{ height: 350 }} /> : (
                <>
                  {activeTab === 1 && (
                    <div className={styles.formGrid}>
                      <div className={styles.formGroup}><label>INCI Name</label><input readOnly value={detailData.cosing.INCIName || ""} /></div>
                      <div className={styles.formGroup}><label>Tür</label><input readOnly value={detailData.cosing.Tur || ""} /></div>
                      <div className={styles.formGroup}><label>CAS No</label><input readOnly value={detailData.cosing.Cas || ""} /></div>
                      <div className={styles.formGroup}><label>EC No</label><input readOnly value={detailData.cosing.EC || ""} /></div>
                      <div className={`${styles.formGroup} ${styles.colSpan2}`}><label>Functions</label><textarea readOnly value={detailData.cosing.Functions || ""} rows={3} /></div>
                      <div className={styles.formGroup}><label>SCCS</label><input readOnly value={detailData.cosing.SCCS || ""} /></div>
                      <div className={styles.formGroup}><label>SCCS Link</label>
                        {detailData.cosing.SCCSLink ? (
                           <a href={detailData.cosing.SCCSLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: 'var(--color-accent)', padding: '8px 0' }}>Dökümanı Görüntüle</a>
                        ) : <input readOnly value="Yok" />}
                      </div>
                    </div>
                  )}
                  {activeTab === 2 && (
                    <div className={styles.formGrid}>
                      <div className={styles.formGroup}><label>Genel Ad</label>
                        <input value={detailData.hammadde.GenelAd} onChange={e => setDetailData({...detailData, hammadde: {...detailData.hammadde, GenelAd: e.target.value}})} />
                      </div>
                      <div className={styles.formGroup}><label>Noael</label>
                         <input placeholder="Noael" value={detailData.hammadde.Noael2} onChange={e => setDetailData({...detailData, hammadde: {...detailData.hammadde, Noael2: e.target.value}})} />
                      </div>
                      <div className={styles.formGroup}><label>Yönetmelik (Annex)</label>
                        <input readOnly value={detailData.cosing.Regulation || ""} />
                      </div>
                      <div className={styles.formGroup}><label>Tedarik Tipi (Mix)</label>
                        <input value={detailData.hammadde.Mix} onChange={e => setDetailData({...detailData, hammadde: {...detailData.hammadde, Mix: e.target.value}})} />
                      </div>
                      <div className={`${styles.formGroup} ${styles.colSpan2}`}><label>Fizikokimyasal Özellikler</label>
                        <textarea rows={6} value={detailData.hammadde.Fizikokimya} onChange={e => setDetailData({...detailData, hammadde: {...detailData.hammadde, Fizikokimya: e.target.value}})} />
                      </div>
                      <div className={`${styles.formGroup} ${styles.colSpan2}`}><label>Toksikolojik Özellikler</label>
                        <textarea rows={8} value={detailData.hammadde.Toksikoloji} onChange={e => setDetailData({...detailData, hammadde: {...detailData.hammadde, Toksikoloji: e.target.value}})} />
                      </div>
                    </div>
                  )}
                  {activeTab === 3 && (
                    <div className={styles.formGrid}>
                      <div className={styles.formGroup}><label>Kaynak</label>
                        <input value={detailData.hammadde.Kaynak} onChange={e => setDetailData({...detailData, hammadde: {...detailData.hammadde, Kaynak: e.target.value}})} />
                      </div>
                      <div className={`${styles.formGroup} ${styles.colSpan2}`}><label>Ek Bilgiler</label>
                        <textarea rows={12} value={detailData.hammadde.EkBilgi} onChange={e => setDetailData({...detailData, hammadde: {...detailData.hammadde, EkBilgi: e.target.value}})} />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setDetailModalOpen(false)}>Kapat</button>
              <button className={styles.saveBtn} onClick={handleUpdate} disabled={saving || detailLoading}>
                {saving ? "..." : "Güncelle"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
