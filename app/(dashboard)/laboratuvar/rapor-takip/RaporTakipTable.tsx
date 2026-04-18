"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import styles from "@/app/styles/table.module.css";

// ── Tipler ──────────────────────────────────────────────────────────────────

interface RaporRow {
  NkrID: number;
  Tarih: string | null;
  Evrak_No: string;
  RaporNo: string;
  Numune_Adi: string;
  FirmaAd: string | null;
  ProjeAd: string | null;
  RaporFormati: string;
  RaporDurumu: "Bekliyor" | "Devam Ediyor" | "Tamamlandı";
  MaxTermin: string | null;
}

interface HizmetDetay {
  X1ID: number;
  AnalizID: number;
  Kod: string | null;
  Ad: string | null;
  Akreditasyon: string | null;
  Metot: string | null;
  Birim: string | null;
  BirimEn: string;
  LimitDeger: string | null;
  LimitEn: string;
  Sonuc: string | null;
  SonucEn: string;
  Degerlendirme: string | null;
  Termin: string | null;
}

interface LocalEdit {
  sonuc: string;
  sonucEn: string;
  degerlendirme: string;
}

// Accordion için benzersiz anahtar
const rowKey = (r: RaporRow) => `${r.NkrID}__${r.RaporFormati}`;

// ── Küçük bileşenler ─────────────────────────────────────────────────────────

function DurumBadge({ durum }: { durum: RaporRow["RaporDurumu"] }) {
  const map = {
    "Bekliyor":     { bg: "#8e8e9318", fg: "#636366" },
    "Devam Ediyor": { bg: "#ff950018", fg: "#c06800" },
    "Tamamlandı":   { bg: "#34c75918", fg: "#248a3d" },
  } as const;
  const c = map[durum] ?? map["Bekliyor"];
  return (
    <span style={{
      display: "inline-block", padding: "2px 9px", borderRadius: 10,
      fontSize: "0.72rem", fontWeight: 600, background: c.bg, color: c.fg,
    }}>{durum}</span>
  );
}

function FormatBadge({ format }: { format: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    "Genel":     { bg: "#0071e318", fg: "#0055a8" },
    "Challenge": { bg: "#bf5af218", fg: "#8944ab" },
    "Mikrobiyoloji": { bg: "#34c75918", fg: "#248a3d" },
    "Kimya":     { bg: "#ff950018", fg: "#c06800" },
  };
  const c = colors[format] ?? { bg: "#8e8e9318", fg: "#636366" };
  return (
    <span style={{
      display: "inline-block", padding: "2px 9px", borderRadius: 10,
      fontSize: "0.72rem", fontWeight: 600, background: c.bg, color: c.fg,
    }}>{format}</span>
  );
}

function IconBtn({
  title, onClick, color, children,
}: {
  title: string;
  onClick: (e: React.MouseEvent) => void;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      className={styles.editBtn}
      title={title}
      onClick={onClick}
      style={color ? { color } : undefined}
    >
      {children}
    </button>
  );
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────

export default function RaporTakipTable() {
  const [rows, setRows]           = useState<RaporRow[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [limit, setLimit]         = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch]       = useState("");
  const [year, setYear]           = useState("2026");
  const [raporDurumu, setRaporDurumu] = useState("Bekliyor");
  const [raporTuru, setRaporTuru] = useState("");
  const raporTurleri = ["Genel", "Challenge", "Stabilite", "Dermatoloji"];
  const [loading, setLoading]     = useState(true);
  const [transitioning, setTrans] = useState(false);
  const [error, setError]         = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Accordion
  const [openKeys, setOpenKeys]   = useState<Set<string>>(new Set());
  // Hizmet verileri: key → HizmetDetay[]
  const [hizmetMap, setHizmetMap] = useState<Record<string, HizmetDetay[]>>({});
  // Hizmet yükleme durumu
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  // Yerel düzenlemeler: key → { x1Id → LocalEdit }
  const [editMap, setEditMap]     = useState<Record<string, Record<number, LocalEdit>>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<Record<string, string>>({});

  // Gönder modal
  const [gonderRow,    setGonderRow]    = useState<RaporRow | null>(null);
  const [gonderTo,     setGonderTo]     = useState("");
  const [gonderCc,     setGonderCc]     = useState("");
  const [gonderKonu,   setGonderKonu]   = useState("");
  const [gonderMesaj,  setGonderMesaj]  = useState("");
  const [gonderLoading, setGonderLoading] = useState(false);
  const [gonderError,  setGonderError]  = useState("");
  const [gonderDone,   setGonderDone]   = useState(false);

  const searchTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef     = useRef<AbortController | null>(null);
  const latestReqId  = useRef(0);
  const didMount     = useRef(false);

  // ── Veri çekme ────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (
    p: number, s: string, l: number, y: string, d: string, t: string,
    opts: { clearFirst?: boolean } = {},
  ) => {
    const reqId = ++latestReqId.current;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    if (opts.clearFirst) {
      setRows([]); setLoading(true); setTrans(false);
    } else {
      setTrans(true); setLoading(false);
    }
    setError("");

    try {
      const params = new URLSearchParams({
        page: p.toString(), limit: l.toString(),
        search: s, year: y, raporDurumu: d, raporTuru: t,
      });
      const res = await fetch(
        `/api/rapor-takip?${params}`,
        { signal: ctrl.signal },
      );
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
      if (reqId === latestReqId.current) {
        setLoading(false); setTrans(false);
      }
    }
  }, []);

  // İlk yükleme
  useEffect(() => {
    fetchData(1, "", limit, year, raporDurumu, raporTuru, { clearFirst: true });
  }, []);

  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    fetchData(page, search, limit, year, raporDurumu, raporTuru, { clearFirst: false });
  }, [page, limit, year, raporDurumu, raporTuru]);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      fetchData(1, val, limit, year, raporDurumu, raporTuru, { clearFirst: true });
    }, 250);
  };

  // ── Accordion ──────────────────────────────────────────────────────────────
  const toggleRow = async (row: RaporRow) => {
    const key = rowKey(row);
    const wasOpen = openKeys.has(key);

    setOpenKeys(prev => {
      const next = new Set(prev);
      wasOpen ? next.delete(key) : next.add(key);
      return next;
    });

    // Açılıyorsa ve hizmetler henüz yüklenmediyse yükle
    if (!wasOpen && !hizmetMap[key]) {
      setLoadingKey(key);
      try {
        const res = await fetch(
          `/api/rapor-takip/${row.NkrID}/hizmetler?raporFormati=${encodeURIComponent(row.RaporFormati)}`,
        );
        if (!res.ok) throw new Error((await res.json()).error || "Hizmetler yüklenemedi");
        const data: HizmetDetay[] = await res.json();
        setHizmetMap(prev => ({ ...prev, [key]: data }));

        // Başlangıç editMap'ini doldur
        const initial: Record<number, LocalEdit> = {};
        data.forEach(h => {
          initial[h.X1ID] = {
            sonuc:         h.Sonuc         ?? "",
            sonucEn:       h.SonucEn       ?? "",
            degerlendirme: h.Degerlendirme ?? "",
          };
        });
        setEditMap(prev => ({ ...prev, [key]: initial }));
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoadingKey(null);
      }
    }
  };

  const setFieldValue = (key: string, x1Id: number, field: keyof LocalEdit, value: string) => {
    setEditMap(prev => ({
      ...prev,
      [key]: { ...prev[key], [x1Id]: { ...prev[key]?.[x1Id], [field]: value } },
    }));
  };

  // ── Kaydet ────────────────────────────────────────────────────────────────
  const saveHizmetler = async (row: RaporRow) => {
    const key = rowKey(row);
    const edits = editMap[key] || {};

    const updates = Object.entries(edits).map(([x1Id, vals]) => ({
      x1Id: Number(x1Id),
      sonuc: vals.sonuc,
      sonucEn: vals.sonucEn,
      degerlendirme: vals.degerlendirme,
    }));

    setSavingKey(key);
    setSaveError(prev => ({ ...prev, [key]: "" }));

    try {
      const res = await fetch(`/api/rapor-takip/${row.NkrID}/hizmetler`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates, raporFormati: row.RaporFormati }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Kaydedilemedi");

      // Hizmet listesini refresh et (yeni Sonuc değerleriyle)
      setHizmetMap(prev => {
        const current = prev[key] || [];
        const updated = current.map(h => ({
          ...h,
          Sonuc:         edits[h.X1ID]?.sonuc         ?? h.Sonuc,
          SonucEn:       edits[h.X1ID]?.sonucEn       ?? h.SonucEn,
          Degerlendirme: edits[h.X1ID]?.degerlendirme ?? h.Degerlendirme,
        }));
        return { ...prev, [key]: updated };
      });

      // Ana listeyi de refresh et (RaporDurumu güncellensin)
      fetchData(page, search, limit, year, raporDurumu, raporTuru, { clearFirst: false });
    } catch (e: any) {
      setSaveError(prev => ({ ...prev, [key]: e.message }));
    } finally {
      setSavingKey(null);
    }
  };

  // ── Gönder modal ──────────────────────────────────────────────────────────
  const openGonder = (row: RaporRow) => {
    setGonderRow(row);
    setGonderTo("");
    setGonderCc("");
    setGonderKonu("");
    setGonderMesaj("");
    setGonderError("");
    setGonderDone(false);
  };

  const doGonder = async () => {
    if (!gonderRow) return;
    setGonderLoading(true);
    setGonderError("");
    try {
      const res = await fetch(`/api/rapor-gonder/${gonderRow.NkrID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: gonderRow.RaporFormati,
          to:     gonderTo.split(",").map(s => s.trim()).filter(Boolean),
          cc:     gonderCc ? gonderCc.split(",").map(s => s.trim()).filter(Boolean) : [],
          konu:   gonderKonu,
          mesaj:  gonderMesaj,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Gönderilemedi");
      setGonderDone(true);
    } catch (e: any) {
      setGonderError(e.message);
    } finally {
      setGonderLoading(false);
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

  const formatTarih = (t: string | null) => {
    if (!t) return "—";
    const [y, m, d] = t.split("-");
    return `${d}.${m}.${y}`;
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map(r => rowKey(r))));
    }
  };

  const toggleSelectRow = (key: string) => {
    const next = new Set(selectedIds);
    next.has(key) ? next.delete(key) : next.add(key);
    setSelectedIds(next);
  };

  const batchPrint = () => {
    const nkrIds = rows
      .filter(r => selectedIds.has(rowKey(r)))
      .map(r => r.NkrID);
    if (nkrIds.length === 0) return;
    const ids = nkrIds.join(",");
    window.open(`/api/rapor-takip/yazdir?ids=${ids}`, "_blank");
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Toolbar - Search + Filtreler + Seçili Yazdır */}
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
        <div className={styles.toolbarRight} style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* Yıl Filtresi */}
          <select value={year} onChange={e => { setYear(e.target.value); setPage(1); }}
            style={{
              padding: "6px 8px", borderRadius: 6, border: "1px solid var(--color-border)",
              background: "var(--color-bg)", fontSize: "0.75rem", cursor: "pointer",
            }}>
            <option value="">Tüm Yıllar</option>
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          {/* Rapor Durumu Filtresi */}
          <select value={raporDurumu} onChange={e => { setRaporDurumu(e.target.value); setPage(1); }}
            style={{
              padding: "6px 8px", borderRadius: 6, border: "1px solid var(--color-border)",
              background: "var(--color-bg)", fontSize: "0.75rem", cursor: "pointer",
            }}>
            <option value="">Tüm Durumlar</option>
            <option value="Bekliyor">Bekliyor</option>
            <option value="Devam Ediyor">Devam Ediyor</option>
            <option value="Tamamlandı">Tamamlandı</option>
          </select>

          {/* Rapor Türü Filtresi */}
          <select value={raporTuru} onChange={e => { setRaporTuru(e.target.value); setPage(1); }}
            style={{
              padding: "6px 8px", borderRadius: 6, border: "1px solid var(--color-border)",
              background: "var(--color-bg)", fontSize: "0.75rem", cursor: "pointer",
            }}>
            <option value="">Tümü</option>
            {raporTurleri.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* Seçili Yazdır */}
          {selectedIds.size > 0 && (
            <button
              onClick={batchPrint}
              title={`${selectedIds.size} rapor yazdır`}
              style={{
                padding: "6px 10px", borderRadius: 6, border: "none",
                background: "var(--color-accent)", color: "#fff",
                fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
              }}>
              <svg viewBox="0 0 20 20" fill="currentColor" width="11" height="11">
                <path fillRule="evenodd" d="M5 4v3H4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h1v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-1V4a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1Zm2 0h6v3H7V4Zm-1 9v-2h8v2H6Zm8 2H6v-1h8v1Z" clipRule="evenodd" />
              </svg>
              Yazdır ({selectedIds.size})
            </button>
          )}

          {/* Sayfa Boyutu */}
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

        {/* Başlık satırı */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "32px 24px 80px 108px 108px 1fr 108px 100px 82px 36px 36px 36px",
          alignItems: "center",
          padding: "8px 16px",
          borderBottom: "1px solid var(--color-border-light)",
          background: "var(--color-surface)",
          minWidth: 960,
        }}>
          <input type="checkbox" checked={selectedIds.size === rows.length && rows.length > 0}
            onChange={toggleSelectAll} style={{ cursor: "pointer", width: 16, height: 16 }} />
          <div />
          {["Tarih", "Evrak No", "Rapor No", "Firma / Proje · Numune", "Rapor Türü", "Durum", "Termin", "", "", ""].map((h, i) => (
            <div key={i} style={{
              fontSize: "0.69rem", fontWeight: 600, textTransform: "uppercase",
              letterSpacing: "0.06em", color: "var(--color-text-tertiary)",
              textAlign: i >= 6 ? "center" : "left",
            }}>{h}</div>
          ))}
        </div>

        {/* Skeleton */}
        {loading && (
          <div style={{ padding: "6px 0", minWidth: 900 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 20px", borderBottom: "1px solid var(--color-border-light)",
              }}>
                <span className={styles.skeleton} style={{ width: 14, height: 14, borderRadius: 3 }} />
                <span className={styles.skeleton} style={{ width: 72 }} />
                <span className={styles.skeleton} style={{ width: 90 }} />
                <span className={styles.skeleton} style={{ width: 90 }} />
                <span className={styles.skeleton} style={{ flex: 1 }} />
                <span className={styles.skeleton} style={{ width: 80 }} />
                <span className={styles.skeleton} style={{ width: 90 }} />
                <span className={styles.skeleton} style={{ width: 56 }} />
              </div>
            ))}
          </div>
        )}

        {/* Boş */}
        {!loading && rows.length === 0 && (
          <div className={styles.empty}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="36" height="36">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            Kayıt bulunamadı
          </div>
        )}

        {/* Satırlar */}
        {!loading && rows.map((row, gi) => {
          const key    = rowKey(row);
          const isOpen = openKeys.has(key);
          const hizmetler = hizmetMap[key] ?? [];
          const edits     = editMap[key] ?? {};
          const isSaving  = savingKey === key;
          const isLoading = loadingKey === key;

          return (
            <div
              key={key}
              style={{ borderBottom: gi < rows.length - 1 ? "1px solid var(--color-border-light)" : "none" }}
            >
              {/* ── Ana satır ── */}
              <div
                onClick={() => toggleRow(row)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "32px 24px 80px 108px 108px 1fr 108px 100px 82px 36px 36px 36px",
                  alignItems: "center",
                  padding: "12px 16px",
                  cursor: "pointer",
                  background: isOpen ? "var(--color-surface-2)" : selectedIds.has(key) ? "var(--color-accent-light)" : "transparent",
                  transition: "background 0.12s",
                  userSelect: "none",
                  minWidth: 960,
                }}
              >
                {/* Checkbox */}
                <input type="checkbox" checked={selectedIds.has(key)}
                  onChange={() => toggleSelectRow(key)} onClick={e => e.stopPropagation()}
                  style={{ cursor: "pointer", width: 16, height: 16, accentColor: "var(--color-accent)" }} />

                {/* Chevron */}
                <svg
                  viewBox="0 0 20 20" fill="currentColor" width="14" height="14"
                  style={{
                    color: "var(--color-text-tertiary)", flexShrink: 0,
                    transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform 0.18s ease",
                  }}
                >
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
                </svg>

                {/* Tarih */}
                <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                  {formatTarih(row.Tarih)}
                </div>

                {/* Evrak No */}
                <div style={{ fontWeight: 600, fontSize: "0.82rem", color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums" }}>
                  {row.Evrak_No}
                </div>

                {/* Rapor No */}
                <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--color-accent)", fontVariantNumeric: "tabular-nums" }}>
                  {row.RaporNo}
                </div>

                {/* Firma / Numune */}
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
                  </div>
                </div>

                {/* Rapor Türü */}
                <div><FormatBadge format={row.RaporFormati} /></div>

                {/* Durum */}
                <div><DurumBadge durum={row.RaporDurumu} /></div>

                {/* Termin */}
                <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums", textAlign: "center" }}>
                  {row.MaxTermin ? `${row.MaxTermin.split("-").reverse().join(".")}` : "—"}
                </div>

                {/* DOCX İndir */}
                <div style={{ display: "flex", justifyContent: "center" }} onClick={e => e.stopPropagation()}>
                  <IconBtn
                    title="Word olarak indir (.docx)"
                    color="var(--color-accent)"
                    onClick={() => window.open(
                      `/api/rapor-takip/yazdir/${row.NkrID}?format=${encodeURIComponent(row.RaporFormati)}&output=docx`,
                      "_blank",
                    )}
                  >
                    {/* Word icon */}
                    <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                      <path fillRule="evenodd" d="M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Zm2 6a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 0 1.5h-.5A.75.75 0 0 1 6 10Zm0 2.5a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 6 12.5Zm0 2.5a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 6 15Z" clipRule="evenodd" />
                    </svg>
                  </IconBtn>
                </div>

                {/* PDF Önizleme */}
                <div style={{ display: "flex", justifyContent: "center" }} onClick={e => e.stopPropagation()}>
                  <IconBtn
                    title="PDF önizleme / yazdır"
                    color="#bf5af2"
                    onClick={() => window.open(
                      `/api/rapor-takip/yazdir/${row.NkrID}?format=${encodeURIComponent(row.RaporFormati)}&output=html`,
                      "_blank",
                    )}
                  >
                    {/* PDF icon */}
                    <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                      <path fillRule="evenodd" d="M5 4v3H4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h1v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-1V4a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1Zm2 0h6v3H7V4Zm-1 9v-2h8v2H6Zm8 2H6v-1h8v1Z" clipRule="evenodd" />
                    </svg>
                  </IconBtn>
                </div>

                {/* Gönder */}
                <div style={{ display: "flex", justifyContent: "center" }} onClick={e => e.stopPropagation()}>
                  <IconBtn
                    title="Müşteriye mail gönder"
                    color="#248a3d"
                    onClick={() => openGonder(row)}
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                      <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.254 4.94H9.75a.75.75 0 0 1 0 1.5H3.533l-1.254 4.94a.75.75 0 0 0 .826.95 28.896 28.896 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.288Z" />
                    </svg>
                  </IconBtn>
                </div>
              </div>

              {/* ── Açılır detay: hizmetler ── */}
              {isOpen && (
                <div style={{
                  background: "var(--color-surface-2)",
                  borderTop: "1px solid var(--color-border-light)",
                  padding: "0 0 12px",
                }}>
                  {isLoading && (
                    <div style={{ padding: "16px 48px", display: "flex", gap: 12 }}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span key={i} className={styles.skeleton} style={{ flex: 1, height: 16 }} />
                      ))}
                    </div>
                  )}

                  {!isLoading && hizmetler.length === 0 && (
                    <div style={{ padding: "14px 48px", fontSize: "0.82rem", color: "var(--color-text-tertiary)" }}>
                      Bu rapor formatına ait hizmet bulunamadı.
                    </div>
                  )}

                  {!isLoading && hizmetler.length > 0 && (
                    <>
                      <table style={{
                        width: "100%", borderCollapse: "collapse",
                        fontSize: "0.82rem", tableLayout: "fixed",
                      }}>
                        <colgroup>
                          <col style={{ width: 48 }} />
                          <col style={{ width: 80 }} />
                          <col />
                          <col style={{ width: 130 }} />
                          <col style={{ width: 88 }} />
                          <col style={{ width: 130 }} />
                          <col style={{ width: 110 }} />
                          <col style={{ width: 108 }} />
                          <col style={{ width: 88 }} />
                        </colgroup>
                        <thead>
                          <tr style={{ background: "var(--color-surface)", borderBottom: "1px solid var(--color-border)" }}>
                            <th />
                            {["Kod", "Hizmet Adı", "Metot", "Birim", "Sonuç", "Limit", "Değerlendirme", "Termin"].map(h => (
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
                          {hizmetler.map((h, hi) => {
                            const edit = edits[h.X1ID] ?? { sonuc: h.Sonuc ?? "", sonucEn: h.SonucEn ?? "", degerlendirme: h.Degerlendirme ?? "" };
                            const inputBase: React.CSSProperties = {
                              width: "100%", padding: "4px 7px",
                              border: "1px solid var(--color-border)",
                              borderRadius: 6, fontSize: "0.8rem",
                              background: "var(--color-bg)",
                              color: "var(--color-text-primary)",
                              outline: "none",
                            };
                            return (
                              <tr
                                key={h.X1ID}
                                style={{
                                  borderBottom: hi < hizmetler.length - 1
                                    ? "1px solid var(--color-border-light)" : "none",
                                }}
                              >
                                <td />
                                <td style={{ padding: "8px 10px", color: "var(--color-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                                  {h.Kod ?? "—"}
                                </td>
                                <td style={{ padding: "8px 10px", color: "var(--color-text-primary)", fontWeight: 500 }}>
                                  <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {h.Akreditasyon ? `* ${h.Ad}` : (h.Ad ?? "—")}
                                  </div>
                                </td>
                                <td style={{ padding: "8px 10px", color: "var(--color-text-secondary)" }}>
                                  <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {h.Metot ?? "—"}
                                  </div>
                                </td>
                                {/* Birim + EN */}
                                <td style={{ padding: "8px 10px" }}>
                                  <div style={{ color: "var(--color-text-secondary)" }}>{h.Birim ?? "—"}</div>
                                  {h.BirimEn && (
                                    <div style={{ fontSize: "0.72rem", color: "#0071e3", marginTop: 2 }}>{h.BirimEn}</div>
                                  )}
                                </td>
                                {/* Sonuç — düzenlenebilir, TR + EN */}
                                <td style={{ padding: "6px 8px" }}>
                                  <input
                                    type="text"
                                    value={edit.sonuc}
                                    onChange={e => setFieldValue(key, h.X1ID, "sonuc", e.target.value)}
                                    placeholder="değer"
                                    style={inputBase}
                                    onFocus={e => (e.currentTarget.style.borderColor = "var(--color-accent)")}
                                    onBlur={e  => (e.currentTarget.style.borderColor = "var(--color-border)")}
                                  />
                                  <div style={{ position: "relative", marginTop: 3 }}>
                                    <span style={{
                                      position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)",
                                      fontSize: "0.58rem", fontWeight: 700, color: "#0071e3",
                                      pointerEvents: "none", userSelect: "none",
                                    }}>EN</span>
                                    <input
                                      type="text"
                                      value={edit.sonucEn}
                                      onChange={e => setFieldValue(key, h.X1ID, "sonucEn", e.target.value)}
                                      placeholder="result"
                                      style={{
                                        ...inputBase, fontSize: "0.74rem", paddingLeft: 24,
                                        color: "#005bb5", borderColor: "#0071e340",
                                        background: "#f0f6ff",
                                      }}
                                      onFocus={e => (e.currentTarget.style.borderColor = "#0071e3")}
                                      onBlur={e  => (e.currentTarget.style.borderColor = "#0071e340")}
                                    />
                                  </div>
                                </td>
                                {/* Limit + EN */}
                                <td style={{ padding: "8px 10px" }}>
                                  <div style={{ color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                                    {h.LimitDeger ?? "—"}
                                  </div>
                                  {h.LimitEn && (
                                    <div style={{ fontSize: "0.72rem", color: "#0071e3", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{h.LimitEn}</div>
                                  )}
                                </td>
                                {/* Değerlendirme — düzenlenebilir */}
                                <td style={{ padding: "6px 8px" }}>
                                  <select
                                    value={edit.degerlendirme}
                                    onChange={e => setFieldValue(key, h.X1ID, "degerlendirme", e.target.value)}
                                    style={{
                                      width: "100%", padding: "4px 7px",
                                      border: "1px solid var(--color-border)",
                                      borderRadius: 6, fontSize: "0.8rem",
                                      background: "var(--color-bg)",
                                      color: edit.degerlendirme === "Uygun"
                                        ? "#248a3d"
                                        : edit.degerlendirme === "Uygun Değil"
                                          ? "#c00" : "var(--color-text-primary)",
                                      outline: "none", cursor: "pointer",
                                    }}
                                  >
                                    <option value="">—</option>
                                    <option value="Uygun">Uygun</option>
                                    <option value="Uygun Değil">Uygun Değil</option>
                                    <option value="Değerlendirilemez">Değerlendirilemez</option>
                                  </select>
                                </td>
                                {/* Termin */}
                                <td style={{ padding: "8px 10px", color: "var(--color-text-secondary)", fontSize: "0.8rem", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                                  {h.Termin ? `${h.Termin.split("-").reverse().join(".")}` : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                      {/* Kaydet satırı */}
                      <div style={{
                        display: "flex", alignItems: "center", justifyContent: "flex-end",
                        gap: 10, padding: "10px 16px 2px",
                      }}>
                        {saveError[key] && (
                          <span style={{ fontSize: "0.78rem", color: "#c00" }}>{saveError[key]}</span>
                        )}
                        <button
                          onClick={() => saveHizmetler(row)}
                          disabled={isSaving}
                          style={{
                            padding: "6px 16px", borderRadius: 8, border: "none",
                            background: "var(--color-accent)", color: "#fff",
                            fontSize: "0.82rem", fontWeight: 600, cursor: isSaving ? "wait" : "pointer",
                            opacity: isSaving ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6,
                          }}
                        >
                          {isSaving && <span className={styles.loader} />}
                          {isSaving ? "Kaydediliyor…" : "Kaydet"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Sayfalama */}
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
            <span className={styles.pageInfo}>{total} rapor</span>
          </div>
        )}
      </div>

      {/* ── Gönder Modalı ─────────────────────────────────────────────────── */}
      {gonderRow && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.45)", display: "flex",
            alignItems: "center", justifyContent: "center", padding: 20,
          }}
          onClick={() => setGonderRow(null)}
        >
          <div
            style={{
              background: "var(--color-bg)", borderRadius: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,.25)",
              width: "min(900px, 100%)", maxHeight: "92vh",
              display: "flex", flexDirection: "column", overflow: "hidden",
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal başlık */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 24px", borderBottom: "1px solid var(--color-border-light)",
              flexShrink: 0,
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: "1rem" }}>Raporu Gönder</div>
                <div style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", marginTop: 2 }}>
                  {gonderRow.RaporNo} · {gonderRow.RaporFormati} · {gonderRow.FirmaAd ?? "—"}
                </div>
              </div>
              <button
                onClick={() => setGonderRow(null)}
                style={{ background: "none", border: "none", cursor: "pointer",
                         color: "var(--color-text-tertiary)", fontSize: "1.3rem", lineHeight: 1 }}
              >✕</button>
            </div>

            {/* İçerik: önizleme + form */}
            <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

              {/* PDF önizleme */}
              <div style={{ flex: 1, borderRight: "1px solid var(--color-border-light)", overflow: "hidden" }}>
                <iframe
                  src={`/api/rapor-takip/yazdir/${gonderRow.NkrID}?format=${encodeURIComponent(gonderRow.RaporFormati)}&output=html`}
                  style={{ width: "100%", height: "100%", border: "none" }}
                  title="Rapor Önizleme"
                />
              </div>

              {/* Email formu */}
              <div style={{
                width: 300, flexShrink: 0, display: "flex", flexDirection: "column",
                padding: "20px 20px 0",
              }}>
                {gonderDone ? (
                  <div style={{
                    flex: 1, display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center",
                  }}>
                    <div style={{ fontSize: "2.5rem" }}>✅</div>
                    <div style={{ fontWeight: 700, fontSize: "1rem" }}>Gönderildi!</div>
                    <div style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
                      Rapor {gonderTo} adresine iletildi.
                    </div>
                    <button
                      onClick={() => setGonderRow(null)}
                      style={{
                        marginTop: 8, padding: "8px 20px", borderRadius: 8,
                        border: "1px solid var(--color-border)", background: "none",
                        cursor: "pointer", fontSize: "0.85rem",
                      }}
                    >Kapat</button>
                  </div>
                ) : (
                  <>
                    <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
                      {/* Alıcı */}
                      <div>
                        <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--color-text-secondary)",
                                        textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          Alıcı (To) *
                        </label>
                        <input
                          type="text"
                          value={gonderTo}
                          onChange={e => setGonderTo(e.target.value)}
                          placeholder="ornek@firma.com"
                          style={{
                            marginTop: 4, width: "100%", padding: "7px 10px",
                            border: "1px solid var(--color-border)", borderRadius: 7,
                            fontSize: "0.82rem", background: "var(--color-bg)",
                            color: "var(--color-text-primary)", outline: "none",
                          }}
                        />
                        <div style={{ fontSize: "0.7rem", color: "var(--color-text-tertiary)", marginTop: 3 }}>
                          Virgülle ayırarak birden fazla ekleyebilirsiniz.
                        </div>
                      </div>

                      {/* CC */}
                      <div>
                        <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--color-text-secondary)",
                                        textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          CC (opsiyonel)
                        </label>
                        <input
                          type="text"
                          value={gonderCc}
                          onChange={e => setGonderCc(e.target.value)}
                          placeholder="cc@firma.com"
                          style={{
                            marginTop: 4, width: "100%", padding: "7px 10px",
                            border: "1px solid var(--color-border)", borderRadius: 7,
                            fontSize: "0.82rem", background: "var(--color-bg)",
                            color: "var(--color-text-primary)", outline: "none",
                          }}
                        />
                      </div>

                      {/* Konu */}
                      <div>
                        <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--color-text-secondary)",
                                        textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          Konu
                        </label>
                        <input
                          type="text"
                          value={gonderKonu}
                          onChange={e => setGonderKonu(e.target.value)}
                          placeholder={`Analiz Raporu — ${gonderRow.RaporNo}`}
                          style={{
                            marginTop: 4, width: "100%", padding: "7px 10px",
                            border: "1px solid var(--color-border)", borderRadius: 7,
                            fontSize: "0.82rem", background: "var(--color-bg)",
                            color: "var(--color-text-primary)", outline: "none",
                          }}
                        />
                      </div>

                      {/* Mesaj */}
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--color-text-secondary)",
                                        textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          Ek Mesaj
                        </label>
                        <textarea
                          value={gonderMesaj}
                          onChange={e => setGonderMesaj(e.target.value)}
                          placeholder="Sayın yetkili, raporunuz ektedir…"
                          rows={4}
                          style={{
                            marginTop: 4, width: "100%", padding: "7px 10px",
                            border: "1px solid var(--color-border)", borderRadius: 7,
                            fontSize: "0.82rem", background: "var(--color-bg)",
                            color: "var(--color-text-primary)", outline: "none",
                            resize: "vertical",
                          }}
                        />
                      </div>

                      <div style={{ fontSize: "0.72rem", color: "var(--color-text-tertiary)" }}>
                        Rapor Word (.docx) olarak ek gönderilir.
                      </div>

                      {gonderError && (
                        <div style={{ fontSize: "0.78rem", color: "#c00", background: "#fff0f0",
                                      padding: "8px 10px", borderRadius: 7 }}>
                          {gonderError}
                        </div>
                      )}
                    </div>

                    {/* Gönder butonu */}
                    <div style={{ padding: "14px 0", flexShrink: 0 }}>
                      <button
                        onClick={doGonder}
                        disabled={gonderLoading || !gonderTo.trim()}
                        style={{
                          width: "100%", padding: "10px 0", borderRadius: 9,
                          border: "none", background: "var(--color-accent)", color: "#fff",
                          fontSize: "0.9rem", fontWeight: 700, cursor: gonderLoading || !gonderTo.trim() ? "not-allowed" : "pointer",
                          opacity: gonderLoading || !gonderTo.trim() ? 0.6 : 1,
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        }}
                      >
                        {gonderLoading && <span className={styles.loader} />}
                        {gonderLoading ? "Gönderiliyor…" : "Gönder"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
