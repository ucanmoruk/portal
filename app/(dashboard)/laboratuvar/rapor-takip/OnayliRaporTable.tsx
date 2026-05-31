"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import styles from "@/app/styles/table.module.css";

// ── Tipler ──────────────────────────────────────────────────────────────────

interface RaporRow {
  NkrID: number;
  Tarih: string | null;
  KabulTarihi: string | null;
  Evrak_No: string;
  RaporNo: string;
  Barkod?: string | null;
  Numune_Adi: string;
  FirmaAd: string | null;
  ProjeAd: string | null;
  RaporFormati: string;
  RaporDurumu: "Onaylandı" | "Yayınlandı" | string;
  MaxTermin: string | null;
}

// Sunucu Onaylandı/Yayınlandı döner. UI: Onaylandı | Gönderildi.
function durumLabel(d: string): "Onaylandı" | "Gönderildi" | string {
  if (d === "Yayınlandı") return "Gönderildi";
  return d;
}

function DurumBadge({ durum }: { durum: string }) {
  const label = durumLabel(durum);
  const map: Record<string, { bg: string; fg: string }> = {
    "Onaylandı":  { bg: "#34c75918", fg: "#248a3d" },
    "Gönderildi":{ bg: "#bf5af218", fg: "#8944ab" },
  };
  const c = map[label] ?? { bg: "#8e8e9318", fg: "#636366" };
  return (
    <span style={{
      display: "inline-block", padding: "2px 9px", borderRadius: 10,
      fontSize: "0.72rem", fontWeight: 600, background: c.bg, color: c.fg, whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

// Rapor formatı badge — Dermatoloji → Claim
function displayFormat(format: string): string {
  return format === "Dermatoloji" ? "Claim" : format;
}

function FormatBadge({ format }: { format: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    "Genel":         { bg: "#0071e318", fg: "#0055a8" },
    "Challenge":     { bg: "#bf5af218", fg: "#8944ab" },
    "Mikrobiyoloji": { bg: "#34c75918", fg: "#248a3d" },
    "Kimya":         { bg: "#ff950018", fg: "#c06800" },
    "Stabilite":     { bg: "#ff950018", fg: "#c06800" },
    "Claim":         { bg: "#34c75918", fg: "#248a3d" },
    "Dermatoloji":   { bg: "#34c75918", fg: "#248a3d" },
    "Diğer":         { bg: "#8e8e9318", fg: "#636366" },
    "ÜGDR":          { bg: "#1f478818", fg: "#1f4788" },
    "UGDR":          { bg: "#1f478818", fg: "#1f4788" },
  };
  const label = displayFormat(format);
  const c = colors[format] ?? colors[label] ?? { bg: "#8e8e9318", fg: "#636366" };
  return (
    <span style={{
      display: "inline-block", padding: "2px 9px", borderRadius: 10,
      fontSize: "0.72rem", fontWeight: 600, background: c.bg, color: c.fg,
    }}>{label}</span>
  );
}

// Fatura durumu — şu an statik placeholder. İleride Evrak_No → fatura tablosu eşlemesi ile gelecek.
function FaturaBadge({ durum }: { durum: "Fatura kesilmedi" | "Ödeme bekliyor" | "Ödendi" }) {
  const map: Record<string, { bg: string; fg: string }> = {
    "Fatura kesilmedi": { bg: "#8e8e9318", fg: "#636366" },
    "Ödeme bekliyor":   { bg: "#ff950018", fg: "#c06800" },
    "Ödendi":           { bg: "#34c75918", fg: "#248a3d" },
  };
  const c = map[durum];
  return (
    <span style={{
      display: "inline-block", padding: "2px 9px", borderRadius: 10,
      fontSize: "0.72rem", fontWeight: 600, background: c.bg, color: c.fg, whiteSpace: "nowrap",
    }}>{durum}</span>
  );
}

const formatTarih = (t: string | null) => {
  if (!t) return "—";
  const [y, m, d] = t.split("-");
  return `${d}.${m}.${y}`;
};

// ── Ana bileşen ───────────────────────────────────────────────────────────────

export default function OnayliRaporTable() {
  const [rows, setRows]       = useState<RaporRow[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [limit, setLimit]     = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch]   = useState("");
  const [year, setYear]       = useState("2026");
  // Boş = Tümü (Onaylandı + Yayınlandı/Gönderildi), "Onaylandı", "Yayınlandı"
  const [durum, setDurum]     = useState<"" | "Onaylandı" | "Yayınlandı">("");
  const [raporTuru, setRaporTuru] = useState("");
  const [faturaDurumu, setFaturaDurumu] = useState<"" | "Fatura kesilmedi" | "Ödeme bekliyor" | "Ödendi">("");
  const [loading, setLoading] = useState(true);
  const [transitioning, setTrans] = useState(false);
  const [error, setError]     = useState("");
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const searchTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef     = useRef<AbortController | null>(null);
  const latestReqId  = useRef(0);
  const didMount     = useRef(false);

  const fetchData = useCallback(async (
    p: number, s: string, l: number, y: string, d: string, t: string,
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
        page: p.toString(), limit: l.toString(),
        search: s, year: y, raporDurumu: d, raporTuru: t,
        phase: "approved",   // sadece Onaylandı + Yayınlandı
        acceptedOnly: "1",   // KabulTarihi join
      });
      const res = await fetch(`/api/rapor-takip?${params}`, { signal: ctrl.signal, cache: "no-store" });
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
    fetchData(1, "", limit, year, durum, raporTuru, { clearFirst: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    fetchData(page, search, limit, year, durum, raporTuru, { clearFirst: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, year, durum, raporTuru]);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      fetchData(1, val, limit, year, durum, raporTuru, { clearFirst: true });
    }, 250);
  };

  const downloadImzaliPdf = async (row: RaporRow) => {
    const key = `${row.NkrID}__${row.RaporFormati}`;
    setDownloadingKey(key);
    setError("");
    try {
      const url = `/api/rapor-takip/${row.NkrID}/imzali-pdf?format=${encodeURIComponent(row.RaporFormati)}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "İmzalı PDF indirilemedi");
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `Rapor-${row.RaporNo || row.NkrID}-imzali.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 30_000);
    } catch (e: any) {
      setError(e.message || "İmzalı PDF indirilemedi");
    } finally {
      setDownloadingKey(null);
    }
  };

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

  // Fatura durumu client-side filtre (server'da kolon yok)
  const visibleRows = faturaDurumu
    ? rows.filter(() => faturaDurumu === "Fatura kesilmedi") // placeholder: hepsi "Fatura kesilmedi" şu an
    : rows;

  const gridCols = "108px 108px 108px 120px 1fr 108px 110px 130px 78px 130px";

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
          <span className={styles.totalCount}>{total} rapor</span>
        </div>
        <div className={styles.toolbarRight} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {/* Yıl */}
          <select value={year} onChange={e => { setYear(e.target.value); setPage(1); }}
            style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.75rem", cursor: "pointer" }}>
            <option value="">Tüm Yıllar</option>
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          {/* Rapor Türü */}
          <select value={raporTuru} onChange={e => { setRaporTuru(e.target.value); setPage(1); }}
            style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.75rem", cursor: "pointer" }}>
            <option value="">Tüm Türler</option>
            <option value="Genel">Genel</option>
            <option value="Challenge">Challenge</option>
            <option value="Stabilite">Stabilite</option>
            <option value="Dermatoloji">Claim</option>
            <option value="ÜGDR">ÜGDR</option>
          </select>

          {/* Durum */}
          <select value={durum} onChange={e => { setDurum(e.target.value as any); setPage(1); }}
            style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.75rem", cursor: "pointer" }}>
            <option value="">Tüm Durumlar</option>
            <option value="Onaylandı">Onaylandı</option>
            <option value="Yayınlandı">Gönderildi</option>
          </select>

          {/* Fatura */}
          <select value={faturaDurumu} onChange={e => setFaturaDurumu(e.target.value as any)}
            style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.75rem", cursor: "pointer" }}>
            <option value="">Tüm Fatura Durumları</option>
            <option value="Fatura kesilmedi">Fatura kesilmedi</option>
            <option value="Ödeme bekliyor">Ödeme bekliyor</option>
            <option value="Ödendi">Ödendi</option>
          </select>

          {/* Sayfa boyutu */}
          <select className={styles.pageSizeSelect} value={limit}
            onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
            {[10, 20, 50].map(n => <option key={n} value={n}>{n} / sayfa</option>)}
          </select>
        </div>
      </div>

      {/* Tablo */}
      <div
        className={styles.tableCard}
        style={{ position: "relative", opacity: transitioning ? 0.55 : 1, transition: "opacity 0.15s", overflowX: "auto", marginTop: 12 }}
      >
        {error && <div className={styles.errorBar}>{error}</div>}

        {/* Başlık */}
        <div style={{
          display: "grid",
          gridTemplateColumns: gridCols,
          gap: 12,
          alignItems: "center",
          padding: "10px 16px",
          borderBottom: "1px solid var(--color-border-light)",
          background: "var(--color-surface)",
          minWidth: 1200,
        }}>
          {[
            "Kabul Tarihi", "Termin Tarihi", "Evrak No", "Rapor No",
            "Firma / Proje · Numune", "Rapor Türü", "Durum", "Fatura", "", "",
          ].map((h, i) => (
            <div key={i} style={{
              fontSize: "0.69rem", fontWeight: 600, textTransform: "uppercase",
              letterSpacing: "0.06em", color: "var(--color-text-tertiary)",
              textAlign: i >= 5 && i <= 7 ? "center" : "left",
            }}>{h}</div>
          ))}
        </div>

        {/* Skeleton */}
        {loading && (
          <div style={{ padding: "6px 0", minWidth: 1200 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 20px", borderBottom: "1px solid var(--color-border-light)",
              }}>
                <span className={styles.skeleton} style={{ width: 80 }} />
                <span className={styles.skeleton} style={{ width: 80 }} />
                <span className={styles.skeleton} style={{ width: 80 }} />
                <span className={styles.skeleton} style={{ width: 100 }} />
                <span className={styles.skeleton} style={{ flex: 1 }} />
                <span className={styles.skeleton} style={{ width: 80 }} />
                <span className={styles.skeleton} style={{ width: 90 }} />
                <span className={styles.skeleton} style={{ width: 110 }} />
              </div>
            ))}
          </div>
        )}

        {/* Boş */}
        {!loading && visibleRows.length === 0 && (
          <div className={styles.empty}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="36" height="36">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            Onaylı rapor bulunamadı
          </div>
        )}

        {/* Satırlar */}
        {!loading && visibleRows.map((row, gi) => {
          const key = `${row.NkrID}__${row.RaporFormati}`;
          const isDownloading = downloadingKey === key;
          return (
            <div
              key={key}
              style={{
                display: "grid",
                gridTemplateColumns: gridCols,
                gap: 12,
                alignItems: "center",
                padding: "12px 16px",
                borderBottom: gi < visibleRows.length - 1 ? "1px solid var(--color-border-light)" : "none",
                minWidth: 1200,
              }}
            >
              {/* Kabul Tarihi */}
              <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                {formatTarih(row.KabulTarihi)}
              </div>
              {/* Termin Tarihi */}
              <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                {formatTarih(row.MaxTermin)}
              </div>
              {/* Evrak No */}
              <div style={{ fontWeight: 600, fontSize: "0.82rem", color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums" }}>
                {row.Evrak_No}
              </div>
              {/* Rapor No */}
              <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--color-accent)", fontVariantNumeric: "tabular-nums" }}>
                {row.RaporNo}
              </div>
              {/* Firma / Proje · Numune */}
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontWeight: 500, fontSize: "0.845rem", color: "var(--color-text-primary)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {row.FirmaAd ?? "—"}
                  {row.ProjeAd && <span style={{ color: "var(--color-text-tertiary)" }}> · {row.ProjeAd}</span>}
                </div>
                <div style={{
                  fontSize: "0.77rem", color: "var(--color-text-secondary)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {row.Numune_Adi}
                  {row.Barkod ? ` · Barkod: ${row.Barkod}` : ""}
                </div>
              </div>
              {/* Rapor Türü */}
              <div style={{ display: "flex", justifyContent: "center" }}>
                <FormatBadge format={row.RaporFormati} />
              </div>
              {/* Durum */}
              <div style={{ display: "flex", justifyContent: "center" }}>
                <DurumBadge durum={row.RaporDurumu} />
              </div>
              {/* Fatura */}
              <div style={{ display: "flex", justifyContent: "center" }}>
                <FaturaBadge durum="Fatura kesilmedi" />
              </div>
              {/* PDF İndir */}
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button
                  type="button"
                  title="İmzalı PDF indir"
                  disabled={isDownloading}
                  onClick={() => downloadImzaliPdf(row)}
                  style={{
                    border: "1px solid var(--color-accent)",
                    borderRadius: 7,
                    background: isDownloading ? "var(--color-surface-2)" : "var(--color-accent)",
                    color: isDownloading ? "var(--color-text-tertiary)" : "#fff",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    padding: "6px 10px",
                    cursor: isDownloading ? "wait" : "pointer",
                    display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
                  }}
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12">
                    <path fillRule="evenodd" d="M10 3a.75.75 0 0 1 .75.75v6.59l1.95-2.1a.75.75 0 1 1 1.1 1.02l-3.25 3.5a.75.75 0 0 1-1.1 0L6.2 9.26a.75.75 0 0 1 1.1-1.02l1.95 2.1V3.75A.75.75 0 0 1 10 3Z" clipRule="evenodd"/>
                    <path d="M3.5 13.75a.75.75 0 0 1 1.5 0v1.75a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-1.75a.75.75 0 0 1 1.5 0v1.75A2 2 0 0 1 14.5 17.5h-9A2 2 0 0 1 3.5 15.5v-1.75Z"/>
                  </svg>
                  {isDownloading ? "İndiriliyor…" : "PDF İndir"}
                </button>
              </div>
              {/* Portala Gönder — pasif (yakında) */}
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button
                  type="button"
                  title="Yakında — müşteri portalına gönderme"
                  disabled
                  style={{
                    border: "1px solid var(--color-border)",
                    borderRadius: 7,
                    background: "var(--color-surface-2)",
                    color: "var(--color-text-tertiary)",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    padding: "6px 10px",
                    cursor: "not-allowed",
                    display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
                  }}
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12">
                    <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.254 4.94H9.75a.75.75 0 0 1 0 1.5H3.533l-1.254 4.94a.75.75 0 0 0 .826.95 28.896 28.896 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.288Z"/>
                  </svg>
                  Portala Gönder
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sayfalama */}
      {!loading && totalPages > 1 && (
        <div className={styles.pagination}>
          <button className={styles.pageBtn} disabled={page === 1} onClick={() => goTo(page - 1)}>‹</button>
          {pageNums().map((n, i) =>
            n === "…" ? (
              <span key={i} className={styles.pageDots}>…</span>
            ) : (
              <button
                key={i}
                className={`${styles.pageBtn} ${page === n ? styles.pageBtnActive : ""}`}
                onClick={() => goTo(n as number)}
              >{n}</button>
            )
          )}
          <button className={styles.pageBtn} disabled={page === totalPages} onClick={() => goTo(page + 1)}>›</button>
        </div>
      )}
    </>
  );
}
