"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import styles from "@/app/styles/table.module.css";

// ── Tipler ──────────────────────────────────────────────────────────────────

type DurumFilter = "Tümü" | "Devam" | "Tamamlandı";

interface HizmetRow {
  X1ID: number;
  Kod: string | null;
  HizmetAd: string | null;
  Akreditasyon: string | null;
  Metot: string | null;
  Birim: string | null;
  LimitDeger: string | null;
  Termin: string | null;
  Sonuc: string | null;
  Degerlendirme: string | null;
  SonucEn: string;
  LimitEn: string;
  BirimEn: string;
  Durum: string | null;
  YetkiliAd: string | null;
}

interface NumuneGroup {
  NkrID: number;
  Tarih: string | null;
  Evrak_No: string;
  RaporNo: string;
  Numune_Adi: string;
  hizmetler: HizmetRow[];
}

interface LocalEdit {
  sonuc: string;
  sonucEn: string;
  birim: string;
  birimEn: string;
  limit: string;
  limitEn: string;
  degerlendirme: string;
  durum: "Devam" | "Tamamlandı";
  dirty: boolean;
  saving: boolean;
  saveError: string;
}

interface RevizyonState {
  x1Id: number;
  nkrId: number;
  text: string;
  saving: boolean;
  error: string;
}

// ── Sabitler ─────────────────────────────────────────────────────────────────

// Kod | Hizmet+Metot | Sonuç | Birim | Limit | Değerl. | Termin | Durum
const HIZMET_GRID = "50px minmax(140px,1fr) 108px 78px 96px 132px 84px 112px";
const HIZMET_MIN_W = 920;
const HIZMET_HEADERS = ["Kod", "Hizmet Adı", "Sonuç", "Birim", "Limit", "Değerlendirme", "Termin", "Durum"];
const DURUM_OPTIONS: DurumFilter[] = ["Tümü", "Devam", "Tamamlandı"];

// ── Yardımcılar ──────────────────────────────────────────────────────────────

function formatTarih(t: string | null) {
  if (!t) return "—";
  const [y, m, d] = t.slice(0, 10).split("-");
  if (!y || !m || !d) return t;
  return `${d}.${m}.${y}`;
}

function getMinTermin(hizmetler: HizmetRow[]): string {
  const dates = hizmetler.map(h => h.Termin).filter(Boolean).sort() as string[];
  return dates.length > 0 ? formatTarih(dates[0]) : "—";
}

// ── Alt bileşenler ────────────────────────────────────────────────────────────

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
  const color = pct === 100 ? "#34c759" : pct > 0 ? "#ff9500" : "#8e8e93";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
      <div style={{ width: 48, height: 4, borderRadius: 2, background: "rgba(0,0,0,0.08)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: color, transition: "width 0.4s" }} />
      </div>
      <span style={{ fontSize: "0.72rem", color, fontWeight: 600, fontVariantNumeric: "tabular-nums", minWidth: 32 }}>
        {done}/{total}
      </span>
    </div>
  );
}

// Birleşik TR + EN input (EN her zaman görünür)
function InputPair({
  valTr, valEn, disabled,
  onChangeTr, onChangeEn,
  phTr = "değer", phEn = "value",
}: {
  valTr: string; valEn: string;
  disabled: boolean;
  onChangeTr: (v: string) => void;
  onChangeEn: (v: string) => void;
  phTr?: string; phEn?: string;
}) {
  const base: React.CSSProperties = {
    width: "100%", padding: "5px 8px",
    border: "1px solid var(--color-border)",
    borderRadius: 6, fontFamily: "inherit",
    background: disabled ? "var(--color-surface)" : "var(--color-bg)",
    color: disabled ? "var(--color-text-secondary)" : "var(--color-text-primary)",
    outline: "none", cursor: disabled ? "default" : "text",
    transition: "border-color 0.15s",
  };
  return (
    <div style={{ paddingRight: 4 }}>
      <input
        type="text" value={valTr} disabled={disabled}
        onChange={e => onChangeTr(e.target.value)}
        placeholder={disabled ? "" : phTr}
        style={{ ...base, fontSize: "0.81rem" }}
        onFocus={e => { if (!disabled) e.currentTarget.style.borderColor = "var(--color-accent)"; }}
        onBlur={e  => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
      />
      <div style={{ position: "relative", marginTop: 3 }}>
        <span style={{
          position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)",
          fontSize: "0.6rem", fontWeight: 700, color: "#0071e3",
          letterSpacing: "0.03em", pointerEvents: "none", userSelect: "none",
        }}>EN</span>
        <input
          type="text" value={valEn} disabled={disabled}
          onChange={e => onChangeEn(e.target.value)}
          placeholder={disabled ? "" : phEn}
          style={{
            ...base, fontSize: "0.74rem", paddingLeft: 26,
            color: disabled ? "var(--color-text-tertiary)" : "#005bb5",
            borderColor: "#0071e340",
            background: disabled ? "var(--color-surface)" : "#f0f6ff",
          }}
          onFocus={e => { if (!disabled) e.currentTarget.style.borderColor = "#0071e3"; }}
          onBlur={e  => { e.currentTarget.style.borderColor = "#0071e340"; }}
        />
      </div>
    </div>
  );
}

// ── Ana bileşen ──────────────────────────────────────────────────────────────

export default function SonucGirisTable() {
  const [groups, setGroups]           = useState<NumuneGroup[]>([]);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(1);
  const [limit, setLimit]             = useState(10);
  const [totalPages, setTotalPages]   = useState(1);
  const [search, setSearch]           = useState("");
  const [year, setYear]               = useState("2026");
  const [durumFilter, setDurumFilter] = useState<DurumFilter>("Devam");
  const [loading, setLoading]         = useState(true);
  const [transitioning, setTrans]     = useState(false);
  const [error, setError]             = useState("");

  const [editMap, setEditMap]                 = useState<Record<number, LocalEdit>>({});
  const [collapsedNkrIds, setCollapsedNkrIds] = useState<Set<number>>(new Set());
  const [revizyon, setRevizyon]               = useState<RevizyonState | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef    = useRef<AbortController | null>(null);
  const latestReqId = useRef(0);
  const didMount    = useRef(false);

  // ── Veri çekme ─────────────────────────────────────────────────────────────

  const fetchData = useCallback(async (
    p: number, s: string, l: number, y: string, df: DurumFilter,
    opts: { clearFirst?: boolean } = {},
  ) => {
    const reqId = ++latestReqId.current;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    if (opts.clearFirst) {
      setGroups([]); setLoading(true); setTrans(false);
      setCollapsedNkrIds(new Set());
    } else {
      setTrans(true); setLoading(false);
    }
    setError("");

    try {
      const params = new URLSearchParams({ page: p.toString(), limit: l.toString(), search: s, year: y });
      if (df !== "Tümü") params.set("durum", df);

      const res = await fetch(`/api/sonuc-giris?${params}`, { signal: ctrl.signal });
      if (reqId !== latestReqId.current) return;
      if (!res.ok) throw new Error((await res.json()).error || "Hata");
      const json = await res.json();

      setGroups(json.data);
      setTotal(json.total);
      setTotalPages(json.totalPages);
      setCollapsedNkrIds(new Set()); // yeni veri = tümü açık

      setEditMap(prev => {
        const next = { ...prev };
        for (const group of json.data as NumuneGroup[]) {
          for (const row of group.hizmetler) {
            if (next[row.X1ID] === undefined) {
              next[row.X1ID] = {
                sonuc:         row.Sonuc         ?? "",
                sonucEn:       row.SonucEn       ?? "",
                birim:         row.Birim         ?? "",
                birimEn:       row.BirimEn       ?? "",
                limit:         row.LimitDeger    ?? "",
                limitEn:       row.LimitEn       ?? "",
                degerlendirme: row.Degerlendirme ?? "",
                durum:         row.Durum === "Tamamlandı" ? "Tamamlandı" : "Devam",
                dirty: false, saving: false, saveError: "",
              };
            }
          }
        }
        return next;
      });
    } catch (e: any) {
      if (e.name === "AbortError" || reqId !== latestReqId.current) return;
      setError(e.message);
    } finally {
      if (reqId === latestReqId.current) { setLoading(false); setTrans(false); }
    }
  }, []);

  useEffect(() => { fetchData(1, "", limit, "2026", "Devam", { clearFirst: true }); }, []);

  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    fetchData(page, search, limit, year, durumFilter, { clearFirst: false });
  }, [page, limit, year, durumFilter]);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      fetchData(1, val, limit, year, durumFilter, { clearFirst: true });
    }, 280);
  };

  // ── Accordion ─────────────────────────────────────────────────────────────

  const toggleGroup = (nkrId: number) =>
    setCollapsedNkrIds(prev => {
      const s = new Set(prev);
      s.has(nkrId) ? s.delete(nkrId) : s.add(nkrId);
      return s;
    });

  const toggleAll = () => {
    if (collapsedNkrIds.size === groups.length && groups.length > 0) {
      setCollapsedNkrIds(new Set());
    } else {
      setCollapsedNkrIds(new Set(groups.map(g => g.NkrID)));
    }
  };

  // ── Sayfalama ─────────────────────────────────────────────────────────────

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

  // ── Inline düzenleme ──────────────────────────────────────────────────────

  type EditField = "sonuc" | "sonucEn" | "birim" | "birimEn" | "limit" | "limitEn" | "degerlendirme";

  const setField = (x1Id: number, field: EditField, val: string) =>
    setEditMap(prev => {
      const cur = prev[x1Id];
      if (!cur || cur.durum === "Tamamlandı") return prev;
      return { ...prev, [x1Id]: { ...cur, [field]: val, dirty: true, saveError: "" } };
    });

  const handleSave = async (x1Id: number) => {
    const edit = editMap[x1Id];
    if (!edit || !edit.dirty) return;
    setEditMap(prev => ({ ...prev, [x1Id]: { ...prev[x1Id], saving: true, saveError: "" } }));
    try {
      const res = await fetch(`/api/sonuc-giris/${x1Id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sonuc:         edit.sonuc,
          sonucEn:       edit.sonucEn,
          birim:         edit.birim,
          birimEn:       edit.birimEn,
          limit:         edit.limit,
          limitEn:       edit.limitEn,
          degerlendirme: edit.degerlendirme,
          durum:         "Tamamlandı",
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Kayıt hatası");
      setEditMap(prev => ({
        ...prev,
        [x1Id]: { ...prev[x1Id], dirty: false, saving: false, saveError: "", durum: "Tamamlandı" },
      }));
    } catch (e: any) {
      setEditMap(prev => ({ ...prev, [x1Id]: { ...prev[x1Id], saving: false, saveError: e.message } }));
    }
  };

  const handleSaveAll = async () => {
    const dirtyIds = Object.entries(editMap)
      .filter(([, v]) => v.dirty && !v.saving && v.durum !== "Tamamlandı")
      .map(([k]) => Number(k));
    await Promise.all(dirtyIds.map(id => handleSave(id)));
  };

  const dirtyCount = Object.values(editMap).filter(v => v.dirty && v.durum !== "Tamamlandı").length;

  // ── Revizyon ──────────────────────────────────────────────────────────────

  const openRevizyon  = (row: HizmetRow, nkrId: number) =>
    setRevizyon({ x1Id: row.X1ID, nkrId, text: "", saving: false, error: "" });

  const closeRevizyon = () => setRevizyon(null);

  const handleRevizyonSubmit = async () => {
    if (!revizyon || !revizyon.text.trim()) return;
    setRevizyon(r => r ? { ...r, saving: true, error: "" } : null);
    try {
      const res = await fetch(`/api/sonuc-giris/${revizyon.x1Id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durum: "Devam", revizyon: revizyon.text.trim(), nkrId: revizyon.nkrId }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Hata");
      setEditMap(prev => ({
        ...prev,
        [revizyon.x1Id]: { ...prev[revizyon.x1Id], durum: "Devam", dirty: false },
      }));
      setRevizyon(null);
    } catch (e: any) {
      setRevizyon(r => r ? { ...r, saving: false, error: e.message } : null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const allCollapsed = groups.length > 0 && collapsedNkrIds.size === groups.length;

  return (
    <>
      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchBox} style={{ width: 340 }}>
            <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
            </svg>
            <input
              className={styles.searchInput}
              placeholder="Evrak no, numune adı, hizmet…"
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
          <span className={styles.totalCount}>{total} numune</span>
          {groups.length > 1 && (
            <button
              onClick={toggleAll}
              style={{
                padding: "4px 10px", borderRadius: 6,
                border: "1px solid var(--color-border)", background: "transparent",
                color: "var(--color-text-secondary)", fontSize: "0.74rem",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {allCollapsed ? "Tümünü Aç" : "Tümünü Kapat"}
            </button>
          )}
          {dirtyCount > 0 && (
            <button
              onClick={handleSaveAll}
              style={{
                padding: "5px 14px", borderRadius: 7,
                border: "none", background: "var(--color-accent)", color: "#fff",
                fontSize: "0.78rem", fontWeight: 600, cursor: "pointer",
                fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5,
                boxShadow: "0 1px 4px rgba(0,113,227,0.25)",
              }}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
                <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
              </svg>
              Hepsini Kaydet ({dirtyCount})
            </button>
          )}
        </div>
        <div className={styles.toolbarRight}>
          <select
            value={year}
            onChange={e => { setYear(e.target.value); setPage(1); }}
            style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.75rem", cursor: "pointer" }}
          >
            <option value="">Tüm Yıllar</option>
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            value={durumFilter}
            onChange={e => { setDurumFilter(e.target.value as DurumFilter); setPage(1); }}
            style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.75rem", cursor: "pointer" }}
          >
            {DURUM_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
          <select
            className={styles.pageSizeSelect}
            value={limit}
            onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
          >
            {[5, 10, 20].map(n => <option key={n} value={n}>{n} numune</option>)}
          </select>
        </div>
      </div>

      {/* ── Liste ── */}
      <div style={{
        display: "flex", flexDirection: "column", gap: 8,
        opacity: transitioning ? 0.55 : 1, transition: "opacity 0.15s",
      }}>
        {error && <div className={styles.errorBar}>{error}</div>}

        {/* Skeleton */}
        {loading && Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{
            borderRadius: 10, border: "1px solid var(--color-border-light)",
            background: "var(--color-surface)",
          }}>
            <div style={{ padding: "13px 16px", display: "flex", alignItems: "center", gap: 12 }}>
              <span className={styles.skeleton} style={{ width: 14, height: 14, borderRadius: "50%", flexShrink: 0 }} />
              <span className={styles.skeleton} style={{ width: 96 }} />
              <span className={styles.skeleton} style={{ flex: 1 }} />
              <span className={styles.skeleton} style={{ width: 60 }} />
              <span className={styles.skeleton} style={{ width: 44 }} />
            </div>
          </div>
        ))}

        {/* Boş */}
        {!loading && groups.length === 0 && (
          <div className={styles.tableCard}>
            <div className={styles.empty}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="36" height="36">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
              </svg>
              Kayıt bulunamadı
            </div>
          </div>
        )}

        {/* ── Numune grupları ── */}
        {!loading && groups.map(group => {
          const isCollapsed = collapsedNkrIds.has(group.NkrID);
          const tamamlanan  = group.hizmetler.filter(
            h => (editMap[h.X1ID]?.durum ?? (h.Durum === "Tamamlandı" ? "Tamamlandı" : "Devam")) === "Tamamlandı"
          ).length;
          const toplam  = group.hizmetler.length;
          const allDone = tamamlanan === toplam;
          const someDone = tamamlanan > 0 && !allDone;

          const borderColor = allDone ? "#34c75940" : someDone ? "#ff950030" : "var(--color-border-light)";
          const headerBg    = allDone ? "rgba(52,199,89,0.04)" : someDone ? "rgba(255,149,0,0.04)" : "var(--color-surface)";

          return (
            <div key={group.NkrID} style={{
              borderRadius: 10,
              border: `1px solid ${borderColor}`,
              background: "var(--color-bg)",
              overflow: "hidden",
            }}>
              {/* ── Numune başlığı ── */}
              <div
                onClick={() => toggleGroup(group.NkrID)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 16px", background: headerBg,
                  cursor: "pointer", userSelect: "none",
                  borderBottom: isCollapsed ? "none" : `1px solid ${borderColor}`,
                }}
              >
                {/* Chevron */}
                <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13"
                  style={{
                    color: "var(--color-text-tertiary)", flexShrink: 0,
                    transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                    transition: "transform 0.18s",
                  }}
                >
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>

                {/* Evrak No */}
                <div style={{ width: 110, flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.84rem", color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums" }}>
                    {group.Evrak_No || "—"}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--color-text-tertiary)", marginTop: 1, fontVariantNumeric: "tabular-nums" }}>
                    {group.RaporNo || formatTarih(group.Tarih)}
                  </div>
                </div>

                {/* Numune adı */}
                <div style={{
                  flex: 1, fontSize: "0.86rem", fontWeight: 500,
                  color: "var(--color-text-primary)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {group.Numune_Adi}
                </div>

                {/* Progress */}
                <div onClick={e => e.stopPropagation()}>
                  <ProgressBar done={tamamlanan} total={toplam} />
                </div>

                {/* En yakın termin */}
                <div style={{
                  width: 68, textAlign: "right", flexShrink: 0,
                  fontSize: "0.74rem", color: "var(--color-text-secondary)",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {getMinTermin(group.hizmetler)}
                </div>

                {/* EN badge — her zaman görünür */}
                <span style={{
                  padding: "2px 8px", borderRadius: 6, flexShrink: 0,
                  border: "1px solid #0071e340", background: "#f0f6ff",
                  color: "#0071e3", fontSize: "0.68rem", fontWeight: 700,
                  letterSpacing: "0.04em",
                }}>EN</span>
              </div>

              {/* ── Hizmet satırları ── */}
              {!isCollapsed && (
                <div style={{
                  background: "var(--color-surface-2)",
                  borderTop: `1px solid ${borderColor}`,
                  padding: "0 0 12px",
                  overflowX: "auto",
                }}>
                  <table style={{
                    width: "100%", borderCollapse: "collapse",
                    fontSize: "0.82rem", tableLayout: "fixed", minWidth: 860,
                  }}>
                    <colgroup>
                      <col style={{ width: 48 }} />
                      <col style={{ width: 72 }} />
                      <col />
                      <col style={{ width: 148 }} />
                      <col style={{ width: 88 }} />
                      <col style={{ width: 96 }} />
                      <col style={{ width: 130 }} />
                      <col style={{ width: 80 }} />
                      <col style={{ width: 110 }} />
                    </colgroup>
                    <thead>
                      <tr style={{ background: "var(--color-surface)", borderBottom: "1px solid var(--color-border)" }}>
                        <th />
                        {["Kod", "Hizmet Adı", "Sonuç", "Birim", "Limit", "Değerlendirme", "Termin", "Durum"].map(h => (
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
                      {group.hizmetler.map((row, ri) => {
                        const edit = editMap[row.X1ID] ?? {
                          sonuc: row.Sonuc ?? "", sonucEn: row.SonucEn ?? "",
                          birim: row.Birim ?? "", birimEn: row.BirimEn ?? "",
                          limit: row.LimitDeger ?? "", limitEn: row.LimitEn ?? "",
                          degerlendirme: row.Degerlendirme ?? "",
                          durum: (row.Durum === "Tamamlandı" ? "Tamamlandı" : "Devam") as "Devam" | "Tamamlandı",
                          dirty: false, saving: false, saveError: "",
                        };
                        const isAkr      = row.Akreditasyon?.toLowerCase().includes("var");
                        const isTamam    = edit.durum === "Tamamlandı";
                        const isDisabled = isTamam || edit.saving;
                        const isLast     = ri === group.hizmetler.length - 1;

                        const degEn = edit.degerlendirme === "Uygun"       ? "Pass"
                                    : edit.degerlendirme === "Uygun Değil" ? "Fail"
                                    : edit.degerlendirme === "D.Y."        ? "N/A"
                                    : null;

                        return (
                          <tr
                            key={row.X1ID}
                            style={{
                              borderBottom: isLast ? "none" : "1px solid var(--color-border-light)",
                              background: isTamam
                                ? "rgba(52,199,89,0.025)"
                                : edit.dirty ? "rgba(0,113,227,0.02)" : undefined,
                            }}
                          >
                            <td />

                            {/* Kod */}
                            <td style={{ padding: "8px 10px", color: "var(--color-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                              {row.Kod || "—"}
                            </td>

                            {/* Hizmet Adı + Metot + Yetkili */}
                            <td style={{ padding: "8px 10px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                {isAkr && (
                                  <span title="Akredite analiz" style={{
                                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                                    width: 14, height: 14, borderRadius: "50%",
                                    background: "#ff9f0a22", color: "#b06400",
                                    fontSize: "0.6rem", fontWeight: 800, flexShrink: 0,
                                  }}>★</span>
                                )}
                                <span style={{
                                  fontSize: "0.82rem", fontWeight: 500, color: "var(--color-text-primary)",
                                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                }}>{row.HizmetAd || "—"}</span>
                              </div>
                              {row.Metot && (
                                <div style={{ fontSize: "0.71rem", color: "var(--color-text-secondary)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {row.Metot}
                                </div>
                              )}
                              {row.YetkiliAd && (
                                <div style={{ fontSize: "0.67rem", color: "var(--color-text-tertiary)", marginTop: 1 }}>
                                  {row.YetkiliAd}
                                </div>
                              )}
                            </td>

                            {/* Sonuç TR / EN */}
                            <td style={{ padding: "6px 8px" }}>
                              <InputPair
                                valTr={edit.sonuc} valEn={edit.sonucEn}
                                disabled={isDisabled}
                                onChangeTr={v => setField(row.X1ID, "sonuc", v)}
                                onChangeEn={v => setField(row.X1ID, "sonucEn", v)}
                                phTr="sonuç" phEn="result"
                              />
                            </td>

                            {/* Birim TR / EN */}
                            <td style={{ padding: "6px 8px" }}>
                              <InputPair
                                valTr={edit.birim} valEn={edit.birimEn}
                                disabled={isDisabled}
                                onChangeTr={v => setField(row.X1ID, "birim", v)}
                                onChangeEn={v => setField(row.X1ID, "birimEn", v)}
                                phTr="birim" phEn="unit"
                              />
                            </td>

                            {/* Limit TR / EN */}
                            <td style={{ padding: "6px 8px" }}>
                              <InputPair
                                valTr={edit.limit} valEn={edit.limitEn}
                                disabled={isDisabled}
                                onChangeTr={v => setField(row.X1ID, "limit", v)}
                                onChangeEn={v => setField(row.X1ID, "limitEn", v)}
                                phTr="limit" phEn="limit"
                              />
                            </td>

                            {/* Değerlendirme */}
                            <td style={{ padding: "6px 8px" }}>
                              <select
                                value={edit.degerlendirme}
                                disabled={isDisabled}
                                onChange={e => setField(row.X1ID, "degerlendirme", e.target.value)}
                                style={{
                                  width: "100%", padding: "4px 6px",
                                  border: "1px solid var(--color-border)",
                                  borderRadius: 6, fontSize: "0.78rem",
                                  background: isDisabled
                                    ? "var(--color-surface)"
                                    : edit.degerlendirme === "Uygun"       ? "#34c75914"
                                    : edit.degerlendirme === "Uygun Değil" ? "#ff2d5514"
                                    : "var(--color-bg)",
                                  color: edit.degerlendirme === "Uygun"       ? "#248a3d"
                                       : edit.degerlendirme === "Uygun Değil" ? "#c1001a"
                                       : "var(--color-text-secondary)",
                                  fontWeight: edit.degerlendirme ? 600 : 400,
                                  outline: "none",
                                  cursor: isDisabled ? "default" : "pointer",
                                  fontFamily: "inherit",
                                }}
                              >
                                <option value="">—</option>
                                <option value="Uygun">Uygun</option>
                                <option value="Uygun Değil">Uygun Değil</option>
                                <option value="D.Y.">D.Y.</option>
                              </select>
                              {degEn && (
                                <div style={{ marginTop: 3, fontSize: "0.67rem", color: "#0071e3", paddingLeft: 2 }}>
                                  {degEn}
                                </div>
                              )}
                            </td>

                            {/* Termin */}
                            <td style={{ padding: "8px 10px", fontSize: "0.75rem", color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums", textAlign: "center" }}>
                              {formatTarih(row.Termin)}
                            </td>

                            {/* Durum / Kaydet */}
                            <td style={{ padding: "6px 8px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                {edit.saving && <span className={styles.loader} />}

                                {!edit.saving && edit.dirty && (
                                  <button
                                    onClick={() => handleSave(row.X1ID)}
                                    title={edit.saveError || "Kaydet ve Tamamlandı olarak işaretle"}
                                    style={{
                                      padding: "5px 11px", borderRadius: 7,
                                      border: edit.saveError ? "1.5px solid #c1001a" : "none",
                                      background: edit.saveError ? "#fff0f0" : "var(--color-accent)",
                                      color: edit.saveError ? "#c1001a" : "#fff",
                                      fontSize: "0.76rem", fontWeight: 700,
                                      cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                                      boxShadow: edit.saveError ? "none" : "0 1px 3px rgba(0,113,227,0.3)",
                                      display: "flex", alignItems: "center", gap: 4,
                                    }}
                                  >
                                    {edit.saveError ? <>⚠ Tekrar</> : (
                                      <>
                                        <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12">
                                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                                        </svg>
                                        Kaydet
                                      </>
                                    )}
                                  </button>
                                )}

                                {!edit.saving && !edit.dirty && isTamam && (
                                  <button
                                    onClick={() => openRevizyon(row, group.NkrID)}
                                    title="Revizyon başlatmak için tıklayın"
                                    style={{
                                      padding: "4px 10px", borderRadius: 20,
                                      border: "1.5px solid #34c75970",
                                      background: "#34c75914", color: "#248a3d",
                                      fontSize: "0.72rem", fontWeight: 700,
                                      cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                                      display: "flex", alignItems: "center", gap: 3,
                                    }}
                                  >
                                    <svg viewBox="0 0 20 20" fill="currentColor" width="11" height="11">
                                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                                    </svg>
                                    Tamam
                                  </button>
                                )}

                                {!edit.saving && !edit.dirty && !isTamam && (
                                  <span style={{
                                    padding: "4px 10px", borderRadius: 20,
                                    border: "1px solid var(--color-border)",
                                    color: "var(--color-text-tertiary)",
                                    fontSize: "0.72rem", whiteSpace: "nowrap",
                                    background: "var(--color-surface)",
                                  }}>
                                    Devam
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}

        {/* ── Sayfalama ── */}
        {!loading && totalPages > 1 && (
          <div className={styles.pagination}>
            <button className={styles.pageBtn} onClick={() => goTo(page - 1)} disabled={page === 1 || transitioning}>‹</button>
            {pageNums().map((n, i) =>
              n === "…"
                ? <span key={`d${i}`} className={styles.pageDots}>…</span>
                : <button
                    key={n}
                    className={`${styles.pageBtn} ${page === n ? styles.pageBtnActive : ""}`}
                    disabled={transitioning}
                    onClick={() => goTo(n as number)}
                  >{n}</button>
            )}
            <button className={styles.pageBtn} onClick={() => goTo(page + 1)} disabled={page === totalPages || transitioning}>›</button>
            <span className={styles.pageInfo}>{total} numune</span>
          </div>
        )}
      </div>

      {/* ── Revizyon Modal ── */}
      {revizyon && (
        <div className={styles.modalOverlay} onClick={closeRevizyon}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span>Revizyon Başlat</span>
              <button className={styles.modalClose} onClick={closeRevizyon}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <p style={{ fontSize: "0.83rem", color: "var(--color-text-secondary)", margin: "0 0 12px" }}>
                Bu kaydı tekrar düzenlenebilir hale getirmek için revizyon sebebini girin.
                Açıklama <strong>Hizmet Geçmişi</strong> sekmesine kaydedilecek.
              </p>
              <textarea
                value={revizyon.text}
                onChange={e => setRevizyon(r => r ? { ...r, text: e.target.value } : null)}
                placeholder="Revizyon sebebini yazın…"
                rows={4}
                style={{
                  width: "100%", padding: "8px 10px",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8, fontSize: "0.84rem",
                  fontFamily: "inherit", resize: "vertical",
                  background: "var(--color-bg)", color: "var(--color-text-primary)",
                  outline: "none", boxSizing: "border-box",
                }}
                onFocus={e => (e.currentTarget.style.borderColor = "var(--color-accent)")}
                onBlur={e  => (e.currentTarget.style.borderColor = "var(--color-border)")}
                autoFocus
              />
              {revizyon.error && (
                <div style={{ marginTop: 8, fontSize: "0.78rem", color: "#c1001a" }}>{revizyon.error}</div>
              )}
            </div>
            <div className={styles.modalFooter}>
              <button
                onClick={closeRevizyon}
                style={{
                  padding: "7px 16px", borderRadius: 8,
                  border: "1px solid var(--color-border)", background: "transparent",
                  color: "var(--color-text-secondary)", fontSize: "0.83rem",
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >İptal</button>
              <button
                onClick={handleRevizyonSubmit}
                disabled={revizyon.saving || !revizyon.text.trim()}
                style={{
                  padding: "7px 18px", borderRadius: 8,
                  border: "none", background: "var(--color-accent)", color: "#fff",
                  fontSize: "0.83rem", fontWeight: 600,
                  cursor: revizyon.saving || !revizyon.text.trim() ? "not-allowed" : "pointer",
                  opacity: revizyon.saving || !revizyon.text.trim() ? 0.6 : 1,
                  fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6,
                }}
              >
                {revizyon.saving && <span className={styles.loader} />}
                {revizyon.saving ? "Kaydediliyor…" : "Revizyon Başlat"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
