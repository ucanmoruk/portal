"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/app/styles/table.module.css";

const upperTr = (value?: string | null) => value ? value.toLocaleUpperCase("tr-TR") : "";

// ─────────────────────────────────────────────────────────────────────────────
// TalepTable — Analiz & Destek talepleri için ORTAK liste bileşeni.
// Tasarım: Müşteriler > Teklif Listesi ile birebir (toolbar + tableCard +
// pagination). Müşteri portalında müşteri tarafından oluşturulan talepler
// burada listelenir; iç portal yalnızca TAKİP eder (oluşturma/silme yok).
// ─────────────────────────────────────────────────────────────────────────────

interface Talep {
  ID: number;
  TalepNo: string;       // dış kod (ÜGAM/26/XXXX veya UQ193)
  IcTakipNo: string;     // iç kod (26{TalepNo})
  Tarih: string;
  FirmaKodu: string;
  TalepOlusturan: string;
  Musteri: string;
  Durum: string;
  FirmaID: number | null;
}

interface ApiResponse {
  data: Talep[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const DURUM_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  // Ortak
  "Yeni Talep":          { label: "Yeni Talep",          color: "#9a6700", bg: "#fff3cd" },
  "Pasif":               { label: "Pasif",               color: "#6e6e73", bg: "#f5f5f7" },
  // Analiz
  "Numune Bekleniyor":   { label: "Numune Bekleniyor",   color: "#9a6700", bg: "#fff3cd" },
  "Analiz Aşamasında":   { label: "Analiz Aşamasında",   color: "#0071e3", bg: "#e8f0fe" },
  "Raporlandı":          { label: "Raporlandı",          color: "#1a7f4b", bg: "#e6f6ee" },
  // Destek
  "Müşteri Yanıtı":      { label: "Müşteri Yanıtı",      color: "#9a6700", bg: "#fff3cd" },
  "Cevaplandı":          { label: "Cevaplandı",          color: "#0071e3", bg: "#e8f0fe" },
  "Kapandı":             { label: "Kapandı",             color: "#1a7f4b", bg: "#e6f6ee" },
};

// Tur'a göre filtre çubuğunda gösterilecek durumlar
const FILTRE_ANALIZ  = ["Yeni Talep", "Numune Bekleniyor", "Analiz Aşamasında", "Raporlandı"] as const;
const FILTRE_DESTEK  = ["Yeni Talep", "Müşteri Yanıtı", "Cevaplandı", "Kapandı"] as const;
// İç portaldan elle değiştirilebilen durumlar (Yeni Talep müşteri portalında otomatik oluşur)
const DEGISEBILIR_ANALIZ = ["Numune Bekleniyor", "Analiz Aşamasında", "Raporlandı"] as const;
const DEGISEBILIR_DESTEK = ["Müşteri Yanıtı", "Cevaplandı", "Kapandı"] as const;

export default function TalepTable({ tur }: { tur: "Analiz" | "Destek" }) {
  const router = useRouter();
  // Tur'a göre filtre + değiştirilebilir durum seti
  const FILTRE_DURUMLAR     = tur === "Destek" ? FILTRE_DESTEK     : FILTRE_ANALIZ;
  const DEGISEBILIR_DURUMLAR = tur === "Destek" ? DEGISEBILIR_DESTEK : DEGISEBILIR_ANALIZ;
  const [data,       setData]       = useState<Talep[]>([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [limit,      setLimit]      = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [search,     setSearch]     = useState("");
  const [durumFilter, setDurumFilter] = useState("");
  const [durumMenuId, setDurumMenuId] = useState<number | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [err,        setErr]        = useState("");

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef    = useRef<AbortController | null>(null);
  const latestReqId = useRef(0);
  const durumFilterRef = useRef("");

  const fetchData = useCallback(async (p: number, s: string, l: number) => {
    const reqId = ++latestReqId.current;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true); setErr("");
    try {
      const df = durumFilterRef.current;
      const r = await fetch(
        `/api/talepler?tur=${encodeURIComponent(tur)}&page=${p}&limit=${l}&search=${encodeURIComponent(s)}${df ? `&durum=${encodeURIComponent(df)}` : ""}`,
        { signal: ctrl.signal },
      );
      if (reqId !== latestReqId.current) return;
      if (!r.ok) throw new Error((await r.json()).error || "Veri alınamadı");
      const j: ApiResponse = await r.json();
      setData(j.data); setTotal(j.total); setTotalPages(j.totalPages);
    } catch (e: any) {
      if (e.name === "AbortError" || reqId !== latestReqId.current) return;
      setErr(e.message);
    } finally {
      if (reqId === latestReqId.current) setLoading(false);
    }
  }, [tur]);

  // İlk yükleme + tur değiştiğinde — eski filtreyi sıfırla (durum setleri farklı)
  useEffect(() => {
    durumFilterRef.current = "";
    setDurumFilter("");
    fetchData(1, "", limit);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [tur]);

  // Sayfa / limit değişimi
  useEffect(() => { fetchData(page, search, limit); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [page, limit]);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      fetchData(1, val, limit);
    }, 250);
  };

  const applyDurumFilter = (next: string) => {
    durumFilterRef.current = next;
    setDurumFilter(next);
    setPage(1);
    fetchData(1, search, limit);
  };

  // Dış tıklama → durum menüsünü kapat
  useEffect(() => {
    if (durumMenuId === null) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-talep-durum-menu]")) setDurumMenuId(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [durumMenuId]);

  const changeDurum = async (id: number, durum: string) => {
    setDurumMenuId(null);
    try {
      const r = await fetch(`/api/talepler/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durum }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j?.error || "Durum güncellenemedi.");
        return;
      }
      // Optimistic: yerel state'i güncelle (filtre aktifse ve durum eşleşmiyorsa
      // satır kaybolacak ama liste sayımı bir sonraki fetch'te düzelir)
      setData(prev => prev.map(t => t.ID === id ? { ...t, Durum: durum } : t));
    } catch (e: any) {
      alert(e?.message || "Durum güncellenemedi.");
    }
  };

  const pageNumbers = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (page <= 4) pages.push(1, 2, 3, 4, 5, "...", totalPages);
      else if (page >= totalPages - 3) pages.push(1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      else pages.push(1, "...", page - 1, page, page + 1, "...", totalPages);
    }
    return pages;
  };

  return (
    <>
      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchBox}>
            <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
            </svg>
            <input className={styles.searchInput}
              placeholder={`${tur === "Analiz" ? "Analiz" : "Destek"} talebi: no, firma kodu, müşteri ara…`}
              value={search} onChange={e => handleSearch(e.target.value)} />
            {search && <button className={styles.searchClear} onClick={() => handleSearch("")}>✕</button>}
          </div>
          <span className={styles.totalCount}>{total} kayıt</span>
        </div>
        <div className={styles.toolbarRight}>
          <select className={styles.pageSizeSelect} value={limit}
            onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
            {[10, 20, 50].map(n => <option key={n} value={n}>{n} / sayfa</option>)}
          </select>
        </div>
      </div>

      {/* ── Durum filtresi ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "0 0 12px" }}>
        <span style={{ fontSize: 12, color: "var(--color-text-tertiary)", fontWeight: 600 }}>Durum:</span>
        {(["", ...FILTRE_DURUMLAR] as const).map(d => {
          const isActive = durumFilter === d;
          const label = d === "" ? "Tümü" : d;
          const cfg = d && DURUM_LABELS[d] ? DURUM_LABELS[d] : null;
          return (
            <button key={d || "all"}
              onClick={() => applyDurumFilter(d)}
              style={{
                padding: "5px 12px", borderRadius: 999,
                border: isActive ? "1px solid var(--color-accent)" : "1px solid var(--color-border)",
                background: isActive ? (cfg?.bg ?? "var(--color-accent-light, #e6f0ff)") : "transparent",
                color: isActive ? (cfg?.color ?? "var(--color-accent)") : "var(--color-text-secondary)",
                fontSize: 12, fontWeight: isActive ? 700 : 500, cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >{label}</button>
          );
        })}
      </div>

      {/* ── Tablo ── */}
      <div className={styles.tableCard}>
        <div className={styles.tableWrapper} style={{ minHeight: "calc(100vh - 340px)" }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 170 }}>Talep No</th>
                <th style={{ width: 110 }}>Tarih</th>
                <th>Talep Oluşturan</th>
                <th>Müşteri</th>
                <th style={{ width: 160, textAlign: "center" }}>Durum</th>
                <th style={{ width: 70, textAlign: "center" }}>Detay</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? <tr><td colSpan={6} className={styles.empty}>Yükleniyor…</td></tr>
                : err
                  ? <tr><td colSpan={6} className={styles.empty}>{err}</td></tr>
                  : data.length === 0
                    ? <tr><td colSpan={6} className={styles.empty}>
                        {search ? "Arama sonucu bulunamadı." : "Kayıt bulunamadı."}
                      </td></tr>
                    : data.map(t => {
                        const cfg = DURUM_LABELS[t.Durum] ?? { label: t.Durum || "-", color: "#6e6e73", bg: "#f5f5f7" };
                        return (
                          <tr key={t.ID}>
                            <td className={styles.tdMono} style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                              <div>{t.TalepNo || "—"}</div>
                              {t.IcTakipNo && (
                                <div style={{ fontWeight: 500, fontSize: "0.8em", color: "var(--color-text-tertiary)" }}>
                                  {t.IcTakipNo}
                                </div>
                              )}
                            </td>
                            <td className={styles.tdSecondary}>{t.Tarih}</td>
                            <td className={styles.tdName}>
                              {upperTr(t.TalepOlusturan) || <em style={{ color: "var(--color-text-tertiary)" }}>—</em>}
                            </td>
                            <td className={styles.tdName}>
                              {upperTr(t.Musteri) || <em style={{ color: "var(--color-text-tertiary)" }}>—</em>}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <div style={{ position: "relative", display: "inline-block" }} data-talep-durum-menu>
                                <button
                                  onClick={() => setDurumMenuId(prev => prev === t.ID ? null : t.ID)}
                                  title="Durumu değiştir"
                                  style={{
                                    background: cfg.bg, color: cfg.color,
                                    border: "none", borderRadius: 20, padding: "3px 10px",
                                    fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer",
                                  }}
                                >{cfg.label} ▾</button>
                                {durumMenuId === t.ID && (
                                  <div style={{
                                    position: "absolute", top: "calc(100% + 4px)", right: 0,
                                    background: "var(--color-surface)", border: "1px solid var(--color-border)",
                                    borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                                    zIndex: 50, minWidth: 180,
                                  }}>
                                    {DEGISEBILIR_DURUMLAR.map(k => {
                                      const dcfg = DURUM_LABELS[k];
                                      const isCurrent = k === t.Durum;
                                      return (
                                        <button key={k}
                                          onMouseDown={() => changeDurum(t.ID, k)}
                                          style={{
                                            display: "block", width: "100%", textAlign: "left",
                                            padding: "8px 14px", background: "none", border: "none",
                                            cursor: "pointer", fontSize: 13,
                                            color: isCurrent ? dcfg.color : "var(--color-text-primary)",
                                            fontWeight: isCurrent ? 700 : 400,
                                          }}
                                        >{dcfg.label}{isCurrent ? " ✓" : ""}</button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <button
                                onClick={() => router.push(
                                  tur === "Destek"
                                    ? `/musteriler/destek-talepleri/${t.ID}`
                                    : `/musteriler/talepler/${t.ID}`
                                )}
                                title="Detayı göster"
                                style={{
                                  background: "transparent", border: "1px solid var(--color-border)",
                                  borderRadius: 6, padding: "5px 9px", cursor: "pointer",
                                  fontSize: 14, lineHeight: 1, color: "var(--color-accent)",
                                }}
                              >👁</button>
                            </td>
                          </tr>
                        );
                      })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Sayfalama ── */}
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button className={styles.pageBtn} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
          {pageNumbers().map((n, i) =>
            n === "..." ? <span key={`d${i}`} style={{ padding: "0 6px", color: "var(--color-text-tertiary)" }}>…</span>
              : <button key={n} className={`${styles.pageBtn} ${page === n ? styles.pageBtnActive : ""}`}
                  onClick={() => setPage(n as number)}>{n}</button>
          )}
          <button className={styles.pageBtn} onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
          <span className={styles.pageInfo}>{page} / {totalPages}</span>
        </div>
      )}
    </>
  );
}
