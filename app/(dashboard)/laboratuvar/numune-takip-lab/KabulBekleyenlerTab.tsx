"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "@/app/styles/table.module.css";

interface PendingRow {
  NkrID: number;
  Tarih: string | null;
  Evrak_No: string;
  RaporNo: string;
  Numune_Adi: string;
  FirmaAd: string | null;
  ProjeAd: string | null;
  RaporFormati: string;
}

interface HizmetDetay {
  X1ID: number;
  AnalizID: number;
  Kod: string;
  Ad: string;
  Akreditasyon: string;
  Metot: string;
  Matriks: string;
  LimitDeger: string;
  Termin: string | null;
  BolumID: number | null;
  BolumAdi: string;
}

const rowKey = (r: PendingRow) => `${r.NkrID}__${r.RaporFormati}`;

function FormatBadge({ format }: { format: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    "Genel":       { bg: "#0071e318", fg: "#0055a8" },
    "Challenge":   { bg: "#bf5af218", fg: "#8944ab" },
    "Stabilite":   { bg: "#ff950018", fg: "#c06800" },
    "Claim":       { bg: "#34c75918", fg: "#248a3d" },
    "Dermatoloji": { bg: "#34c75918", fg: "#248a3d" },
    "ÜGDR":        { bg: "#1f478818", fg: "#1f4788" },
    "UGDR":        { bg: "#1f478818", fg: "#1f4788" },
    "Diğer":       { bg: "#8e8e9318", fg: "#636366" },
  };
  // Eski "Dermatoloji" değerini "Claim" olarak göster
  const label = format === "Dermatoloji" ? "Claim" : format;
  const c = colors[format] ?? colors[label] ?? { bg: "#8e8e9318", fg: "#636366" };
  return (
    <span style={{
      display: "inline-block", padding: "2px 9px", borderRadius: 10,
      fontSize: "0.72rem", fontWeight: 600, background: c.bg, color: c.fg,
    }}>{label}</span>
  );
}

const formatTarih = (t: string | null) => {
  if (!t) return "—";
  const [y, m, d] = t.split("-");
  return `${d}.${m}.${y}`;
};

interface Props {
  /** Bir kayıt kabul edildiğinde dış sayfa, ilgili tab'ı refresh etmek için bilgilendirilir */
  onAccepted?: (raporFormati: string) => void;
}

export default function KabulBekleyenlerTab({ onAccepted }: Props = {}) {
  const [rows, setRows]           = useState<PendingRow[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [limit, setLimit]         = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch]       = useState("");
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [transitioning, setTrans] = useState(false);

  const [openKeys, setOpenKeys]   = useState<Set<string>>(new Set());
  const [hizmetMap, setHizmetMap] = useState<Record<string, HizmetDetay[]>>({});
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [acceptingKey, setAcceptingKey] = useState<string | null>(null);
  // Çoklu seçim
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef    = useRef<AbortController | null>(null);
  const latestReqId = useRef(0);
  const didMount    = useRef(false);

  const fetchData = useCallback(async (
    p: number, s: string, l: number,
    opts: { clearFirst?: boolean } = {},
  ) => {
    const reqId = ++latestReqId.current;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    if (opts.clearFirst) { setRows([]); setLoading(true); setTrans(false); }
    else { setTrans(true); setLoading(false); }
    setError("");

    try {
      const params = new URLSearchParams({
        page: p.toString(), limit: l.toString(), search: s,
      });
      const res = await fetch(`/api/numune-takip-lab/pending?${params}`, { signal: ctrl.signal });
      if (reqId !== latestReqId.current) return;
      if (!res.ok) throw new Error((await res.json()).error || "Hata");
      const json = await res.json();
      setRows(json.data);
      setTotal(json.total);
      setTotalPages(json.totalPages);
    } catch (e: any) {
      if (e.name === "AbortError" || reqId !== latestReqId.current) return;
      setError(e.message);
    } finally {
      if (reqId === latestReqId.current) { setLoading(false); setTrans(false); }
    }
  }, []);

  useEffect(() => {
    fetchData(1, "", limit, { clearFirst: true });
  }, []);

  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    fetchData(page, search, limit, { clearFirst: false });
  }, [page, limit]);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      fetchData(1, val, limit, { clearFirst: true });
    }, 250);
  };

  const toggleRow = async (row: PendingRow) => {
    const key = rowKey(row);
    const wasOpen = openKeys.has(key);
    setOpenKeys(prev => {
      const next = new Set(prev);
      wasOpen ? next.delete(key) : next.add(key);
      return next;
    });

    if (!wasOpen && !hizmetMap[key]) {
      setLoadingKey(key);
      try {
        const res = await fetch(
          `/api/numune-takip-lab/${row.NkrID}/hizmetler?raporFormati=${encodeURIComponent(row.RaporFormati)}`
        );
        if (!res.ok) throw new Error((await res.json()).error || "Hizmetler yüklenemedi");
        const json = await res.json();
        setHizmetMap(prev => ({ ...prev, [key]: json.data || [] }));
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoadingKey(null);
      }
    }
  };

  const handleAccept = async (row: PendingRow) => {
    const key = rowKey(row);
    setAcceptingKey(key);
    setError("");
    try {
      const res = await fetch(`/api/numune-takip-lab/${row.NkrID}/kabul-et`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raporFormati: row.RaporFormati }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Kabul edilemedi");
      // Satırı listeden çıkar
      setRows(prev => prev.filter(r => rowKey(r) !== key));
      setOpenKeys(prev => { const n = new Set(prev); n.delete(key); return n; });
      setSelectedKeys(prev => { const n = new Set(prev); n.delete(key); return n; });
      setTotal(t => Math.max(0, t - 1));
      onAccepted?.(row.RaporFormati);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAcceptingKey(null);
    }
  };

  // Çoklu seçim helper'ları
  const toggleSelect = (key: string) => {
    setSelectedKeys(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };
  const allVisibleKeys = rows.map(rowKey);
  const allSelected = rows.length > 0 && allVisibleKeys.every(k => selectedKeys.has(k));
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(allVisibleKeys));
    }
  };

  // Toplu Kabul Et — seçili tüm satırları sıralı işler
  const handleBulkAccept = async () => {
    if (bulkBusy) return;
    const targets = rows.filter(r => selectedKeys.has(rowKey(r)));
    if (targets.length === 0) return;
    if (!confirm(`${targets.length} kayıt kabul edilecek. Devam edilsin mi?`)) return;
    setBulkBusy(true);
    setError("");
    setBulkProgress({ done: 0, total: targets.length });

    const errors: string[] = [];
    const acceptedFormats = new Set<string>();

    for (let i = 0; i < targets.length; i++) {
      const row = targets[i];
      const key = rowKey(row);
      try {
        const res = await fetch(`/api/numune-takip-lab/${row.NkrID}/kabul-et`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ raporFormati: row.RaporFormati }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({} as { error?: string }));
          throw new Error((j.error || `HTTP ${res.status}`) + ` (${row.RaporNo}/${row.RaporFormati})`);
        }
        acceptedFormats.add(row.RaporFormati);
        // İşlenen satırı listeden anında çıkar
        setRows(prev => prev.filter(r => rowKey(r) !== key));
        setOpenKeys(prev => { const n = new Set(prev); n.delete(key); return n; });
        setSelectedKeys(prev => { const n = new Set(prev); n.delete(key); return n; });
        setTotal(t => Math.max(0, t - 1));
      } catch (e: unknown) {
        errors.push(e instanceof Error ? e.message : String(e));
      } finally {
        setBulkProgress({ done: i + 1, total: targets.length });
      }
    }

    // Tab sayılarını tazelemek için her unique format için onAccepted
    for (const fmt of acceptedFormats) onAccepted?.(fmt);

    if (errors.length > 0) {
      setError(`${errors.length} kayıt kabul edilemedi: ${errors.slice(0, 3).join(" · ")}${errors.length > 3 ? " …" : ""}`);
    }
    setBulkBusy(false);
    setBulkProgress(null);
  };

  // ── Sayfalama ────────────────────────────
  const goTo = (p: number) => { if (p >= 1 && p <= totalPages) setPage(p); };
  const pageNums = (): (number | "…")[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const nums: (number | "…")[] = [1];
    if (page > 3) nums.push("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) nums.push(i);
    if (page < totalPages - 2) nums.push("…");
    nums.push(totalPages);
    return nums;
  };

  return (
    <>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchBox} style={{ width: 360 }}>
            <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
            </svg>
            <input
              className={styles.searchInput}
              placeholder="Evrak no, rapor no, firma, numune adı…"
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
          <span className={styles.totalCount}>{total} kabul bekleyen</span>
        </div>
        <div className={styles.toolbarRight} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {selectedKeys.size > 0 && (
            <button
              type="button"
              onClick={() => void handleBulkAccept()}
              disabled={bulkBusy}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "none",
                background: "var(--color-accent)",
                color: "#fff",
                fontSize: "0.82rem",
                fontWeight: 700,
                cursor: bulkBusy ? "wait" : "pointer",
                opacity: bulkBusy ? 0.7 : 1,
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {bulkBusy && bulkProgress
                ? `Kabul ediliyor… ${bulkProgress.done}/${bulkProgress.total}`
                : `✓ Seçilileri Kabul Et (${selectedKeys.size})`}
            </button>
          )}
          <select className={styles.pageSizeSelect} value={limit}
            onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
            {[10, 20, 50].map(n => <option key={n} value={n}>{n} / sayfa</option>)}
          </select>
        </div>
      </div>

      <div className={styles.tableCard}
        style={{ position: "relative", opacity: transitioning ? 0.55 : 1, transition: "opacity 0.15s", marginTop: 12 }}>
        {error && <div className={styles.errorBar}>{error}</div>}

        {/* Başlık satırı */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "36px 24px 92px 120px 120px 1fr 132px 110px",
          alignItems: "center",
          padding: "8px 16px",
          borderBottom: "1px solid var(--color-border-light)",
          background: "var(--color-surface)",
        }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              disabled={rows.length === 0}
              style={{ cursor: rows.length === 0 ? "not-allowed" : "pointer", width: 14, height: 14 }}
              aria-label="Görünen tüm satırları seç"
            />
          </div>
          <div />
          {["Tarih", "Evrak No", "Rapor No", "Numune Adı", "Rapor Türü", ""].map((h, i) => (
            <div key={i} style={{
              fontSize: "0.69rem", fontWeight: 600, textTransform: "uppercase",
              letterSpacing: "0.06em", color: "var(--color-text-tertiary)",
              textAlign: i === 5 ? "center" : "left",
            }}>{h}</div>
          ))}
        </div>

        {loading && (
          <div style={{ padding: "6px 0" }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 20px", borderBottom: "1px solid var(--color-border-light)",
              }}>
                {Array.from({ length: 6 }).map((__, j) => (
                  <span key={j} className={styles.skeleton} style={{ width: j === 3 ? 220 : 88 }} />
                ))}
              </div>
            ))}
          </div>
        )}

        {!loading && rows.length === 0 && (
          <div className={styles.empty}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="36" height="36">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            Kabul bekleyen numune yok
          </div>
        )}

        {!loading && rows.map((row, gi) => {
          const key = rowKey(row);
          const isOpen = openKeys.has(key);
          const hizmetler = hizmetMap[key] ?? [];
          const isLoadingHiz = loadingKey === key;
          const isAccepting  = acceptingKey === key;
          const isSelected   = selectedKeys.has(key);

          return (
            <div key={key}
              style={{ borderBottom: gi < rows.length - 1 ? "1px solid var(--color-border-light)" : "none" }}>
              {/* Ana satır */}
              <div onClick={() => toggleRow(row)} style={{
                display: "grid",
                gridTemplateColumns: "36px 24px 92px 120px 120px 1fr 132px 110px",
                alignItems: "center",
                padding: "12px 16px",
                cursor: "pointer",
                background: isSelected
                  ? "var(--color-accent-light)"
                  : isOpen ? "var(--color-surface-2)" : "transparent",
                transition: "background 0.12s",
                userSelect: "none",
              }}>
                {/* Checkbox */}
                <div style={{ display: "flex", justifyContent: "center" }} onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(key)}
                    style={{ cursor: "pointer", width: 14, height: 14, accentColor: "var(--color-accent)" }}
                    aria-label={`${row.RaporNo} seç`}
                  />
                </div>
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" style={{
                  color: "var(--color-text-tertiary)",
                  transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                  transition: "transform 0.18s ease",
                }}>
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
                </svg>
                <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                  {formatTarih(row.Tarih)}
                </div>
                <div style={{ fontWeight: 600, fontSize: "0.82rem", fontVariantNumeric: "tabular-nums" }}>
                  {row.Evrak_No}
                </div>
                <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--color-accent)", fontVariantNumeric: "tabular-nums" }}>
                  {row.RaporNo}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontWeight: 500, fontSize: "0.845rem", color: "var(--color-text-primary)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {row.Numune_Adi}
                  </div>
                  <div style={{
                    fontSize: "0.74rem", color: "var(--color-text-tertiary)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {row.FirmaAd ?? "—"}{row.ProjeAd ? ` · ${row.ProjeAd}` : ""}
                  </div>
                </div>
                <div><FormatBadge format={row.RaporFormati} /></div>
                <div style={{ display: "flex", justifyContent: "center" }} onClick={e => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => void handleAccept(row)}
                    disabled={isAccepting}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 8,
                      border: "none",
                      background: "var(--color-accent)",
                      color: "#fff",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      cursor: isAccepting ? "wait" : "pointer",
                      opacity: isAccepting ? 0.6 : 1,
                      whiteSpace: "nowrap",
                    }}>
                    {isAccepting ? "Kabul ediliyor…" : "Kabul Et"}
                  </button>
                </div>
              </div>

              {/* Açılır hizmet detayları */}
              {isOpen && (
                <div style={{ background: "var(--color-surface-2)", borderTop: "1px solid var(--color-border-light)", padding: "0 0 12px" }}>
                  {isLoadingHiz && (
                    <div style={{ padding: "12px 32px" }}>
                      <span className={styles.skeleton} style={{ height: 14, width: "100%", display: "block", marginBottom: 6 }} />
                      <span className={styles.skeleton} style={{ height: 14, width: "80%", display: "block" }} />
                    </div>
                  )}
                  {!isLoadingHiz && hizmetler.length === 0 && (
                    <div style={{ padding: "14px 32px", fontSize: "0.82rem", color: "var(--color-text-tertiary)" }}>
                      Bu rapor formatına ait hizmet bulunamadı.
                    </div>
                  )}
                  {!isLoadingHiz && hizmetler.length > 0 && (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", tableLayout: "fixed" }}>
                      <colgroup>
                        <col style={{ width: 48 }} />
                        <col style={{ width: 90 }} />
                        <col />
                        <col style={{ width: 160 }} />
                        <col style={{ width: 120 }} />
                        <col style={{ width: 96 }} />
                        <col style={{ width: 110 }} />
                      </colgroup>
                      <thead>
                        <tr style={{ background: "var(--color-surface)", borderBottom: "1px solid var(--color-border)" }}>
                          <th />
                          {["Kod", "Hizmet Adı", "Metot", "Bölüm", "Limit", "Termin"].map(h => (
                            <th key={h} style={{
                              padding: "6px 10px", textAlign: "left",
                              fontSize: "0.67rem", fontWeight: 700,
                              textTransform: "uppercase", letterSpacing: "0.07em",
                              color: "var(--color-text-secondary)", whiteSpace: "nowrap",
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {hizmetler.map((h, hi) => (
                          <tr key={h.X1ID} style={{
                            borderBottom: hi < hizmetler.length - 1 ? "1px solid var(--color-border-light)" : "none",
                          }}>
                            <td />
                            <td style={{ padding: "8px 10px", color: "var(--color-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                              {h.Kod || "—"}
                            </td>
                            <td style={{ padding: "8px 10px", color: "var(--color-text-primary)", fontWeight: 500 }}>
                              <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {h.Akreditasyon === "Var" ? `* ${h.Ad}` : (h.Ad || "—")}
                              </div>
                            </td>
                            <td style={{ padding: "8px 10px", color: "var(--color-text-secondary)" }}>
                              <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {h.Metot || "—"}
                              </div>
                            </td>
                            <td style={{ padding: "8px 10px", color: "var(--color-text-secondary)" }}>
                              {h.BolumAdi || (h.BolumID ? `#${h.BolumID}` : "—")}
                            </td>
                            <td style={{ padding: "8px 10px", color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                              {h.LimitDeger || "—"}
                            </td>
                            <td style={{ padding: "8px 10px", color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums", textAlign: "center" }}>
                              {h.Termin ? h.Termin.split("-").reverse().join(".") : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {!loading && totalPages > 1 && (
          <div className={styles.pagination}>
            <button className={styles.pageBtn} onClick={() => goTo(page - 1)} disabled={page === 1 || transitioning}>‹</button>
            {pageNums().map((n, i) =>
              n === "…"
                ? <span key={`d${i}`} className={styles.pageDots}>…</span>
                : <button key={n}
                    className={`${styles.pageBtn} ${page === n ? styles.pageBtnActive : ""}`}
                    disabled={transitioning}
                    onClick={() => goTo(n as number)}
                  >{n}</button>
            )}
            <button className={styles.pageBtn} onClick={() => goTo(page + 1)} disabled={page === totalPages || transitioning}>›</button>
            <span className={styles.pageInfo}>{total} kayıt</span>
          </div>
        )}
      </div>
    </>
  );
}
