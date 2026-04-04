"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import styles from "@/app/styles/table.module.css";

// ── Tipler ──────────────────────────────────────────────────────
interface NumuneItem {
  ID: number;
  Evrak_No: string;
  RaporNo: string;
  Numune_Adi: string;
  Grup: string | null;
  Tur: string | null;
}

interface EvrakGroup {
  evrakNo: string;
  tarih: string | null;
  firmaAd: string | null;
  projeAd: string | null;
  numuneSayisi: number;
  odemeDurumu: string | null;
  numuneler: NumuneItem[];
}

// Fatura kesilmiş = yalnızca bu iki durum; diğerleri (null dahil) → Faturalandır aktif
const isFaturali = (d: string | null) => d === "Ödendi" || d === "Bekliyor";

// ── Yardımcı bileşenler ──────────────────────────────────────────
function OdemeBadge({ durum }: { durum: string | null }) {
  if (!durum) return (
    <span style={{
      display: "inline-block", padding: "2px 9px", borderRadius: 10,
      fontSize: "0.72rem", fontWeight: 600, background: "#8e8e9318", color: "#636366",
    }}>Fatura Kesilmedi</span>
  );
  const map: Record<string, { bg: string; fg: string }> = {
    "Ödendi":   { bg: "#34c75918", fg: "#248a3d" },
    "Bekliyor": { bg: "#ff950018", fg: "#c06800" },
  };
  const c = map[durum] ?? { bg: "#8e8e9318", fg: "#636366" };
  return (
    <span style={{
      display: "inline-block", padding: "2px 9px", borderRadius: 10,
      fontSize: "0.72rem", fontWeight: 600, background: c.bg, color: c.fg,
    }}>{durum}</span>
  );
}

function NumuneBadge({ count }: { count: number }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "2px 8px", borderRadius: 10, fontSize: "0.72rem", fontWeight: 600,
      background: "var(--color-accent-light)", color: "var(--color-accent)",
    }}>
      {count}
    </span>
  );
}

// ── Ana bileşen ─────────────────────────────────────────────────
export default function NumuneKabulTable() {
  const router = useRouter();
  const [groups, setGroups]         = useState<EvrakGroup[]>([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [limit, setLimit]           = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch]         = useState("");
  const [loading, setLoading]       = useState(true);
  const [transitioning, setTransitioning] = useState(false); // sayfa geçişi (skeleton değil, overlay)
  const [error, setError]           = useState("");

  // Accordion
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  const [deleteId, setDeleteId]   = useState<number | null>(null);
  const [deleting, setDeleting]   = useState(false);

  const [selectedIds, setSelectedIds]       = useState<Set<number>>(new Set());
  const [printMenuEvrak, setPrintMenuEvrak] = useState<string | null>(null);

  const toggleSelect = (id: number) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const groupSelectedIds = (numuneler: NumuneItem[]) =>
    numuneler.filter(n => selectedIds.has(n.ID)).map(n => n.ID);

  const handlePrint = (ids: number[], lang: "tr" | "en") => {
    window.open(`/laboratuvar/rapor-yazdir?ids=${ids.join(",")}&lang=${lang}`, "_blank", "noopener,noreferrer");
    setPrintMenuEvrak(null);
  };

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef    = useRef<AbortController | null>(null);
  const latestReqId = useRef(0); // monotone artan — yalnızca son istek geçerli
  const didMount    = useRef(false); // sayfa/limit effect'i mount'ta çalışmasın

  // ── Veri çekme ──────────────────────────────────────────────
  const fetchData = useCallback(async (
    p: number, s: string, l: number,
    opts: { clearFirst?: boolean } = {}
  ) => {
    // Her çağrıya benzersiz ID ver; yalnızca en son ID'li yanıt işlenir
    const reqId = ++latestReqId.current;

    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    if (opts.clearFirst) {
      // Arama: eski grupları temizle + skeleton göster
      setGroups([]);
      setLoading(true);
      setTransitioning(false);
    } else {
      // Sayfa/limit geçişi: eski grupları koru, hafif overlay
      setTransitioning(true);
      setLoading(false);
    }
    setError("");

    try {
      const res = await fetch(
        `/api/numune-kabul?page=${p}&limit=${l}&search=${encodeURIComponent(s)}`,
        { signal: ctrl.signal }
      );

      // Eski istek tamamlandıysa yoksay
      if (reqId !== latestReqId.current) return;

      if (!res.ok) throw new Error((await res.json()).error || "Hata");
      const json = await res.json();

      setGroups(json.data);
      setTotal(json.total);
      setTotalPages(json.totalPages);
    } catch (e: any) {
      if (e.name === "AbortError" || reqId !== latestReqId.current) return;
      setError(e.message);
    } finally {
      if (reqId === latestReqId.current) {
        setLoading(false);
        setTransitioning(false);
      }
    }
  }, []);

  // İlk yükleme — bir kez çalışır
  useEffect(() => {
    fetchData(1, "", limit, { clearFirst: true });
  }, []);

  // Sayfa / limit değişimi — mount sonrası her değişimde çalışır
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
    }, 200);
  };

  // ── Accordion ───────────────────────────────────────────────
  const toggleGroup = (evrakNo: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      next.has(evrakNo) ? next.delete(evrakNo) : next.add(evrakNo);
      return next;
    });
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/numune-kabul/${deleteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Silinemedi");
      setDeleteId(null);
      fetchData(page, search, limit, { clearFirst: false });
    } catch (e: any) { setError(e.message); }
    finally { setDeleting(false); }
  };

  const openNew = () => { router.push("/laboratuvar/numune-form"); };
  const openEdit = (n: NumuneItem) => {
    window.open(`/laboratuvar/numune-form/${n.ID}`, "_blank", "noopener,noreferrer");
  };

  // ── Sayfalama ────────────────────────────────────────────────
  const goTo = (p: number) => { if (p >= 1 && p <= totalPages) setPage(p); };
  const pageNums = () => {
    const nums: (number | "…")[] = [];
    if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) nums.push(i); }
    else {
      nums.push(1);
      if (page > 3) nums.push("…");
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) nums.push(i);
      if (page < totalPages - 2) nums.push("…");
      nums.push(totalPages);
    }
    return nums;
  };

  const formatTarih = (t: string | null) => {
    if (!t) return "—";
    const [y, m, d] = t.split("-");
    return `${d}.${m}.${y}`;
  };

  // ── Render ───────────────────────────────────────────────────
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
          <span className={styles.totalCount}>{total} evrak</span>
        </div>
        <div className={styles.toolbarRight}>
          <select className={styles.pageSizeSelect} value={limit}
            onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
            {[10, 20, 50].map(n => <option key={n} value={n}>{n} / sayfa</option>)}
          </select>
          <button className={styles.addBtn}
            onClick={() => router.push("/laboratuvar/yeni-numune")} >
            Çoklu Giriş
          </button>
          <button className={styles.addBtn} onClick={openNew}>
            <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
            Yeni Numune
          </button>

        </div>
      </div>

      {/* ── Accordion listesi ── */}
      <div
        className={styles.tableCard}
        style={{ position: "relative", opacity: transitioning ? 0.55 : 1, transition: "opacity 0.15s" }}
      >
        {error && <div className={styles.errorBar}>{error}</div>}

        {/* ── Kolon başlıkları ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 0,
          padding: "8px 16px",
          borderBottom: "1px solid var(--color-border-light)",
          background: "var(--color-surface)",
        }}>
          <div style={{ width: 24 }} /> {/* chevron */}
          <div style={{ width: 88,  fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-tertiary)" }}>Tarih</div>
          <div style={{ width: 130, fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-tertiary)" }}>Evrak No</div>
          <div style={{ flex: 1,    fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-tertiary)" }}>Firma / Proje</div>
          <div style={{ width: 64,  fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-tertiary)", textAlign: "center" }}>Numune</div>
          <div style={{ width: 136,  fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-tertiary)", textAlign: "center" }}>Ödeme</div>
          <div style={{ width: 36,  fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-tertiary)", textAlign: "center" }}>Fatura</div>
        </div>

        {/* Skeleton */}
        {loading && (
          <div style={{ padding: "6px 0" }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 20px",
                borderBottom: "1px solid var(--color-border-light)",
              }}>
                <span className={styles.skeleton} style={{ width: 14, height: 14, borderRadius: 3 }} />
                <span className={styles.skeleton} style={{ width: 80 }} />
                <span className={styles.skeleton} style={{ width: 110 }} />
                <span className={styles.skeleton} style={{ flex: 1 }} />
                <span className={styles.skeleton} style={{ width: 60 }} />
                <span className={styles.skeleton} style={{ width: 70 }} />
                <span className={styles.skeleton} style={{ width: 28, height: 28, borderRadius: 6 }} />
              </div>
            ))}
          </div>
        )}

        {/* Boş */}
        {!loading && groups.length === 0 && (
          <div className={styles.empty}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="36" height="36">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            Kayıt bulunamadı
          </div>
        )}

        {/* Accordion grupları */}
        {!loading && groups.map((group, gi) => {
          const isOpen = openGroups.has(group.evrakNo);
          return (
            <div
              key={group.evrakNo}
              style={{ borderBottom: gi < groups.length - 1 ? "1px solid var(--color-border-light)" : "none" }}
            >
              {/* ── Grup başlık satırı ── */}
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 0,
                  padding: "12px 16px",
                  cursor: "pointer",
                  background: isOpen ? "var(--color-surface-2)" : "transparent",
                  transition: "background 0.12s",
                  userSelect: "none",
                }}
                onClick={() => toggleGroup(group.evrakNo)}
              >
                {/* Chevron */}
                <div style={{ width: 24, flexShrink: 0, display: "flex", alignItems: "center" }}>
                  <svg
                    viewBox="0 0 20 20" fill="currentColor" width="14" height="14"
                    style={{
                      color: "var(--color-text-tertiary)",
                      transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                      transition: "transform 0.18s ease",
                    }}
                  >
                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
                  </svg>
                </div>

                {/* Tarih */}
                <div style={{ width: 88, flexShrink: 0, fontSize: "0.8rem", color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                  {formatTarih(group.tarih)}
                </div>

                {/* Evrak No */}
                <div style={{ width: 130, flexShrink: 0, fontWeight: 700, fontSize: "0.845rem", color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums" }}>
                  {group.evrakNo}
                </div>

                {/* Firma / Proje */}
                <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                  <div style={{
                    fontWeight: 500, fontSize: "0.845rem", color: "var(--color-text-primary)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{group.firmaAd ?? "—"}</div>
                  {group.projeAd && (
                    <div style={{
                      fontSize: "0.77rem", color: "var(--color-text-tertiary)",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>{group.projeAd}</div>
                  )}
                </div>

                {/* Numune sayısı */}
                <div style={{ width: 64, display: "flex", justifyContent: "center" }}>
                  <NumuneBadge count={group.numuneSayisi} />
                </div>

                {/* Ödeme */}
                <div style={{ width: 136, display: "flex", justifyContent: "center" }}>
                  <OdemeBadge durum={group.odemeDurumu} />
                </div>

                {/* Yazdır (seçili varsa) + Faturalandır */}
                <div
                  style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}
                  onClick={e => e.stopPropagation()}
                >
                  {isOpen && groupSelectedIds(group.numuneler).length > 0 && (
                    <div style={{ position: "relative" }}>
                      <button
                        className={styles.editBtn}
                        style={{ color: "var(--color-accent)", border: "1px solid var(--color-accent)" }}
                        title="Rapor Yazdır"
                        onClick={() => setPrintMenuEvrak(prev => prev === group.evrakNo ? null : group.evrakNo)}
                      >
                        <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                          <path fillRule="evenodd" d="M5 4v3H4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h1v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-1V4a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1Zm2 0h6v3H7V4Zm-1 9v-2h8v2H6Zm8 2H6v-1h8v1Z" clipRule="evenodd" />
                        </svg>
                      </button>
                      {printMenuEvrak === group.evrakNo && (
                        <div style={{
                          position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 400,
                          background: "var(--color-surface)", border: "1px solid var(--color-border)",
                          borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                          minWidth: 140, overflow: "hidden",
                        }}>
                          {([["tr", "Türkçe"], ["en", "İngilizce"]] as const).map(([lang, label]) => (
                            <button
                              key={lang}
                              type="button"
                              onClick={() => handlePrint(groupSelectedIds(group.numuneler), lang)}
                              style={{
                                display: "block", width: "100%", textAlign: "left",
                                padding: "9px 14px", border: "none", background: "transparent",
                                fontSize: "0.8125rem", cursor: "pointer", color: "var(--color-text-primary)",
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = "var(--color-surface-2)")}
                              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <button
                    className={styles.editBtn}
                    disabled={isFaturali(group.odemeDurumu)}
                    title={isFaturali(group.odemeDurumu) ? "Fatura kesilmiş" : "Faturalandır"}
                    onClick={() => {
                      // TODO: router.push(`/musteriler/proforma-listesi?evrakNo=${group.evrakNo}`)
                    }}
                    style={isFaturali(group.odemeDurumu)
                      ? { opacity: 0.25, cursor: "not-allowed" }
                      : { color: "#248a3d", border: "1px solid #34c75940" }
                    }
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                      <path fillRule="evenodd" d="M4 4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H4Zm0 2h12v8H4V6Zm3 5a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1Zm1-3a1 1 0 0 0 0 2h2a1 1 0 0 0 0-2H8Z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* ── Açılır numune listesi ── */}
              {isOpen && (
                <div style={{ background: "var(--color-surface-2)", borderTop: "1px solid var(--color-border-light)" }}>
                  {group.numuneler.length === 0 ? (
                    <div style={{ padding: "12px 20px 12px 52px", fontSize: "0.8rem", color: "var(--color-text-tertiary)" }}>
                      Numune bulunamadı.
                    </div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", tableLayout: "fixed" }}>
                      <colgroup>
                        <col style={{ width: 40 }} />
                        <col style={{ width: 150 }} />
                        <col />
                        <col style={{ width: 130 }} />
                        <col style={{ width: 170 }} />
                        <col style={{ width: 44 }} />
                      </colgroup>
                      <thead>
                        <tr style={{
                          background: "var(--color-surface)",
                          borderBottom: "2px solid var(--color-border)",
                        }}>
                          <th style={{ padding: "6px 6px 6px 16px" }} />
                          {["Rapor No", "Numune Adı", "Rapor Durumu", "Grup / Tür", ""].map((h, i) => (
                            <th key={i} style={{
                              padding: "6px 12px",
                              textAlign: "left", fontWeight: 700,
                              fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.07em",
                              color: "var(--color-text-secondary)",
                              whiteSpace: "nowrap",
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {group.numuneler.map((n, ni) => (
                          <tr
                            key={n.ID}
                            style={{
                              borderBottom: ni < group.numuneler.length - 1
                                ? "1px solid var(--color-border-light)"
                                : "none",
                              background: selectedIds.has(n.ID) ? "var(--color-accent-light)" : "transparent",
                            }}
                          >
                            <td style={{ padding: "9px 6px 9px 16px", verticalAlign: "middle" }}>
                              <input
                                type="checkbox"
                                checked={selectedIds.has(n.ID)}
                                onChange={() => toggleSelect(n.ID)}
                                style={{ cursor: "pointer", width: 14, height: 14, accentColor: "var(--color-accent)" }}
                              />
                            </td>
                            <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>
                              <a
                                href={`/laboratuvar/numune-form/${n.ID}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontWeight: 600, color: "var(--color-accent)",
                                  fontVariantNumeric: "tabular-nums",
                                  textDecoration: "none",
                                }}
                                onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                                onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
                              >
                                {n.RaporNo}
                              </a>
                            </td>
                            <td style={{ padding: "9px 12px", color: "var(--color-text-primary)", fontWeight: 500 }}>
                              {n.Numune_Adi}
                            </td>
                            <td style={{ padding: "9px 12px" }}>
                              <span style={{
                                display: "inline-block", padding: "2px 9px", borderRadius: 10,
                                fontSize: "0.72rem", fontWeight: 600,
                                background: "#ff950018", color: "#c06800",
                              }}>Devam Ediyor</span>
                            </td>
                            <td style={{ padding: "9px 12px", color: "var(--color-text-secondary)" }}>
                              {[n.Grup, n.Tur].filter(Boolean).join(" / ") || "—"}
                            </td>
                            <td style={{ padding: "9px 8px" }}>
                              <button
                                className={styles.editBtn} title="Pasife Al"
                                style={{ color: "#ff3b30" }}
                                onClick={() => setDeleteId(n.ID)}
                              >
                                <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                                  <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                                </svg>
                              </button>
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

        {/* ── Sayfalama ── */}
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
            <span className={styles.pageInfo}>{total} evrak</span>
          </div>
        )}
      </div>

      {/* ── PASİFE AL ONAY ── */}
      {deleteId !== null && (
        <div className={styles.modalOverlay} onClick={() => setDeleteId(null)}>
          <div className={styles.modal} style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Pasife Al</h2>
              <button className={styles.modalClose} onClick={() => setDeleteId(null)}>
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.deleteWarning}>
                Bu numune pasife alınacak ve aktif listeden kaldırılacak. Devam etmek istiyor musunuz?
              </p>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setDeleteId(null)} disabled={deleting}>İptal</button>
              <button className={styles.deleteBtnPrimary} onClick={handleDelete} disabled={deleting}>
                {deleting ? <span className={styles.loader} /> : "Pasife Al"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
