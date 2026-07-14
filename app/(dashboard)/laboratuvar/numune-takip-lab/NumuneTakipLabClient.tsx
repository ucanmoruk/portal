"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "@/app/styles/table.module.css";
import KabulBekleyenlerTab from "./KabulBekleyenlerTab";
import RaporTakipTable from "../rapor-takip/RaporTakipTable";

// Sonuç Girişi içinde nested format tabları
const FORMAT_TABS = ["Genel", "Challenge", "Stabilite", "Claim", "ÜGDR", "Diğer"] as const;
type FormatTab = (typeof FORMAT_TABS)[number];
const RESULT_TABS = ["Tümü", ...FORMAT_TABS] as const;
type ResultTab = (typeof RESULT_TABS)[number];

// Ana tablar
const MAIN_TABS = [
  { key: "kabul",      label: "Kabul Bekleyenler" },
  { key: "sonuc",      label: "Sonuç Girişi" },
  { key: "geri",       label: "Geri Gelenler" },
  { key: "onay",       label: "Onay Bekleyenler" },
] as const;
type MainKey = (typeof MAIN_TABS)[number]["key"];

const tabBtn = (active: boolean): React.CSSProperties => ({
  border: "none",
  borderRadius: 7,
  padding: "8px 14px",
  background: active ? "var(--color-accent)" : "transparent",
  color: active ? "#fff" : "var(--color-text-secondary)",
  fontSize: "0.82rem",
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
});

const tabContainer: React.CSSProperties = {
  display: "flex",
  gap: 6,
  padding: 4,
  marginBottom: 14,
  border: "1px solid var(--color-border-light)",
  borderRadius: 10,
  background: "var(--color-surface)",
  width: "fit-content",
  maxWidth: "100%",
  overflowX: "auto",
};

const subTabContainer: React.CSSProperties = {
  ...tabContainer,
  marginTop: -4,
  marginBottom: 12,
  background: "var(--color-bg)",
};

interface Counts {
  kabul: number; sonuc: number; geri: number; onay: number;
  dailyLab?: number;
  // Sonuç Girişi format sekmelerinin rozetleri için: anahtar
  // UPPER+normalize edilmiş RaporFormati (örn "GENEL", "UGDR", "DIGER").
  byFormatLab?: Record<string, number>;
}

interface GlobalSearchRow {
  NkrID: number;
  Tarih: string | null;
  Evrak_No: string | null;
  RaporNo: string | null;
  Barkod: string | null;
  Numune_Adi: string | null;
  FirmaAd: string | null;
  ProjeAd: string | null;
  RaporFormati: string;
  HizmetSayisi: number;
  SonucluSayisi: number;
  MaxTermin: string | null;
  DisRaporKodu: string | null;
  TakipDurumu: string;
  TabKey: MainKey | "approved";
}

function todayLocalISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

// FORMAT_TABS etiketlerini API anahtarına uydurur (Türkçe karakter + büyük harf).
function normFmt(s: string): string {
  return s
    .replace(/Ü/g, "U").replace(/ü/g, "U")
    .replace(/İ/g, "I").replace(/ı/g, "I")
    .replace(/Ö/g, "O").replace(/ö/g, "O")
    .replace(/Ç/g, "C").replace(/ç/g, "C")
    .replace(/Ş/g, "S").replace(/ş/g, "S")
    .replace(/Ğ/g, "G").replace(/ğ/g, "G")
    .toUpperCase();
}

const topBar: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 14,
  flexWrap: "wrap",
};

const globalSearchWrap: React.CSSProperties = {
  position: "relative",
  minWidth: 320,
  width: "min(420px, 100%)",
  marginLeft: "auto",
};

const globalPanel: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 8px)",
  right: 0,
  zIndex: 30,
  width: "min(560px, calc(100vw - 32px))",
  maxHeight: 430,
  overflow: "auto",
  background: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  boxShadow: "0 16px 42px rgba(15, 23, 42, 0.16)",
  padding: 8,
};

function durumColor(durum: string): { bg: string; fg: string } {
  const map: Record<string, { bg: string; fg: string }> = {
    "Kabul Bekleyenler": { bg: "#ff950018", fg: "#b85f00" },
    "Sonuç Girişi": { bg: "#0071e318", fg: "#0055a8" },
    "Geri Gelenler": { bg: "#ff3b3018", fg: "#b42318" },
    "Onay Bekleyenler": { bg: "#bf5af218", fg: "#7e3fa1" },
    "Onaylandı": { bg: "#34c75918", fg: "#248a3d" },
    "Yayınlandı": { bg: "#1f478818", fg: "#1f4788" },
    "Arşiv": { bg: "#8e8e9318", fg: "#636366" },
  };
  return map[durum] ?? { bg: "#8e8e9318", fg: "#636366" };
}

export default function NumuneTakipLabClient() {
  const searchParams = useSearchParams();
  const [mainTab, setMainTab] = useState<MainKey>("kabul");
  const [formatTab, setFormatTab] = useState<ResultTab>("Tümü");
  // Kabul Et sonrası ilgili format tab'ını "kirli" işaretle
  const [refreshKey, setRefreshKey] = useState<Record<string, number>>({});
  const [today] = useState(() => todayLocalISO());
  // Tab sayıları
  const [counts, setCounts] = useState<Counts>({ kabul: 0, sonuc: 0, geri: 0, onay: 0, byFormatLab: {} });
  const [globalSearch, setGlobalSearch] = useState("");
  const [globalRows, setGlobalRows] = useState<GlobalSearchRow[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [globalOpen, setGlobalOpen] = useState(false);
  const globalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCounts = useCallback(() => {
    const params = new URLSearchParams({ year: "2026", terminDate: today });
    fetch(`/api/numune-takip-lab/counts?${params}`, { cache: "no-store" })
      .then(r => r.json())
      .then((j: Counts) => setCounts({
        kabul: Number(j.kabul ?? 0),
        sonuc: Number(j.sonuc ?? 0),
        geri:  Number(j.geri  ?? 0),
        onay:  Number(j.onay  ?? 0),
        dailyLab: Number(j.dailyLab ?? 0),
        byFormatLab: j.byFormatLab ?? {},
      }))
      .catch(() => { /* yoksay */ });
  }, [today]);
  useEffect(() => { fetchCounts(); }, [mainTab, formatTab, fetchCounts]);

  useEffect(() => {
    if (globalTimer.current) clearTimeout(globalTimer.current);
    const q = globalSearch.trim();
    if (q.length < 2) {
      setGlobalRows([]);
      setGlobalError("");
      setGlobalLoading(false);
      return;
    }

    const ctrl = new AbortController();
    setGlobalLoading(true);
    setGlobalError("");
    setGlobalOpen(true);
    globalTimer.current = setTimeout(() => {
      fetch(`/api/numune-takip-lab/global-search?search=${encodeURIComponent(q)}`, {
        cache: "no-store",
        signal: ctrl.signal,
      })
        .then(async r => {
          const json = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(json.error || "Durum araması yapılamadı");
          setGlobalRows(Array.isArray(json.data) ? json.data : []);
        })
        .catch(e => {
          if (e.name !== "AbortError") {
            setGlobalRows([]);
            setGlobalError(e.message || "Durum araması yapılamadı");
          }
        })
        .finally(() => setGlobalLoading(false));
    }, 300);

    return () => {
      ctrl.abort();
      if (globalTimer.current) clearTimeout(globalTimer.current);
    };
  }, [globalSearch]);

  // URL'den initial tab (örn: ?tab=geri, ?tab=sonuc, ?tab=onaylanan)
  useEffect(() => {
    const q = (searchParams.get("tab") || "").toLowerCase();
    if (q === "geri" || q === "geri-gelenler") setMainTab("geri");
    else if (q === "sonuc" || q === "sonuc-girisi") setMainTab("sonuc");
    else if (q === "onay" || q === "onay-bekleyenler" || q === "onaylanan" || q === "onaylananlar") setMainTab("onay");
    else if (q === "kabul" || q === "kabul-bekleyenler") setMainTab("kabul");
    // ?format=Genel → Sonuç Girişi + ilgili format
    const f = searchParams.get("format");
    if (f) {
      const found = FORMAT_TABS.find(x => x.toLowerCase() === f.toLowerCase());
      if (found) {
        setMainTab("sonuc");
        setFormatTab(found);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bumpRefresh = (raporFormati: string) => {
    setRefreshKey(prev => ({ ...prev, [raporFormati]: (prev[raporFormati] ?? 0) + 1 }));
    // Kabul Et sonrası counts tazelensin (Kabul Bekleyenler ↓, Sonuç Girişi ↑)
    fetchCounts();
  };

  const jumpToGlobalResult = (row: GlobalSearchRow) => {
    if (row.TabKey !== "approved") {
      setMainTab(row.TabKey);
      if (row.TabKey === "sonuc") {
        const fmt = FORMAT_TABS.find(f => normFmt(f) === normFmt(row.RaporFormati));
        setFormatTab(fmt ?? "Tümü");
      }
    }
    setGlobalOpen(false);
  };

  return (
    <>
      {/* Ana tablar */}
      <div style={topBar}>
        <div style={tabContainer}>
          {MAIN_TABS.map(t => {
            // counts byFormatLab Record alanını da içerdiği için number'a daralt
            const v = counts[t.key as keyof Counts];
            const n: number = typeof v === "number" ? v : 0;
            const active = mainTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setMainTab(t.key)}
                style={tabBtn(active)}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                  {t.label}
                  <span style={{
                    padding: "1px 7px", borderRadius: 9,
                    background: active ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.08)",
                    color: active ? "#fff" : "var(--color-text-secondary)",
                    fontSize: "0.7rem", fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                  }}>{n}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div style={globalSearchWrap}>
          <div className={styles.searchBox} style={{ width: "100%" }}>
            <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
            </svg>
            <input
              className={styles.searchInput}
              placeholder="Durum ara: rapor no, evrak no, firma, numune..."
              value={globalSearch}
              onFocus={() => globalSearch.trim().length >= 2 && setGlobalOpen(true)}
              onChange={e => setGlobalSearch(e.target.value)}
            />
            {globalSearch && (
              <button
                className={styles.searchClear}
                onClick={() => { setGlobalSearch(""); setGlobalRows([]); setGlobalOpen(false); }}
                aria-label="Durum aramasını temizle"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            )}
          </div>

          {globalOpen && globalSearch.trim().length >= 2 && (
            <div style={globalPanel}>
              {globalLoading && (
                <div style={{ padding: "14px 12px", color: "var(--color-text-secondary)", fontSize: "0.82rem" }}>
                  Durum aranıyor...
                </div>
              )}
              {!globalLoading && globalError && (
                <div className={styles.errorBar} style={{ margin: 0 }}>{globalError}</div>
              )}
              {!globalLoading && !globalError && globalRows.length === 0 && (
                <div style={{ padding: "14px 12px", color: "var(--color-text-secondary)", fontSize: "0.82rem" }}>
                  Eşleşen kayıt bulunamadı.
                </div>
              )}
              {!globalLoading && !globalError && globalRows.map(row => {
                const c = durumColor(row.TakipDurumu);
                const canJump = row.TabKey !== "approved";
                return (
                  <div
                    key={`${row.NkrID}-${row.RaporFormati}`}
                    style={{
                      padding: "10px 10px",
                      borderBottom: "1px solid var(--color-border-light)",
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 5 }}>
                        <strong style={{ fontSize: "0.86rem", color: "var(--color-text)" }}>
                          {row.RaporNo || "Rapor no yok"}
                        </strong>
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: c.bg,
                          color: c.fg,
                          fontSize: "0.72rem",
                          fontWeight: 800,
                        }}>
                          {row.TakipDurumu}
                        </span>
                        <span style={{ color: "var(--color-text-tertiary)", fontSize: "0.72rem" }}>
                          {row.RaporFormati}
                        </span>
                      </div>
                      <div style={{
                        color: "var(--color-text-secondary)",
                        fontSize: "0.78rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {row.FirmaAd || row.ProjeAd || "Firma yok"} · {row.Numune_Adi || "Numune adı yok"}
                      </div>
                      <div style={{ color: "var(--color-text-tertiary)", fontSize: "0.72rem", marginTop: 3 }}>
                        Evrak: {row.Evrak_No || "-"} · Sonuç: {Number(row.SonucluSayisi || 0)}/{Number(row.HizmetSayisi || 0)}
                        {row.MaxTermin ? ` · Termin: ${row.MaxTermin}` : ""}
                        {row.DisRaporKodu ? ` · Dış No: ${row.DisRaporKodu}` : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {canJump && (
                        <button
                          type="button"
                          onClick={() => jumpToGlobalResult(row)}
                          style={{
                            border: "1px solid var(--color-border)",
                            background: "var(--color-surface)",
                            color: "var(--color-text)",
                            borderRadius: 7,
                            padding: "6px 9px",
                            fontSize: "0.74rem",
                            fontWeight: 700,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Sekmeye Git
                        </button>
                      )}
                      <Link
                        href={`/laboratuvar/numune-form/${row.NkrID}`}
                        style={{
                          textDecoration: "none",
                          border: "none",
                          background: "var(--color-accent)",
                          color: "#fff",
                          borderRadius: 7,
                          padding: "6px 10px",
                          fontSize: "0.74rem",
                          fontWeight: 800,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Aç
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Aktif ana tab içeriği */}
      {mainTab === "kabul" && (
        <KabulBekleyenlerTab onAccepted={bumpRefresh} />
      )}

      {mainTab === "sonuc" && (
        <>
          {/* Nested rapor formatı tabları */}
          <div style={subTabContainer}>
            {RESULT_TABS.map(f => {
              const active = formatTab === f;
              const n = f === "Tümü" ? counts.dailyLab ?? 0 : counts.byFormatLab?.[normFmt(f)] ?? 0;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormatTab(f)}
                  style={tabBtn(active)}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                    {f}
                    <span style={{
                      padding: "1px 7px", borderRadius: 9,
                      background: active ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.08)",
                      color: active ? "#fff" : "var(--color-text-secondary)",
                      fontSize: "0.7rem", fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                    }}>{n}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <RaporTakipTable
            key={`${formatTab}-${refreshKey[formatTab] ?? 0}`}
            fixedRaporTuru={formatTab === "Tümü" ? "" : formatTab}
            acceptedOnly
            phase="lab"
            hideRaporTuruTabs
            showTerminDateFilter={formatTab === "Tümü"}
            defaultTerminDate={today}
            enableExcelExport={formatTab === "Tümü"}
            onRefresh={fetchCounts}
          />
        </>
      )}

      {mainTab === "geri" && (
        <RaporTakipTable
          acceptedOnly
          phase="returned"
          hideRaporTuruTabs
          onRefresh={fetchCounts}
        />
      )}

      {mainTab === "onay" && (
        <RaporTakipTable
          acceptedOnly
          phase="approval"
          hideRaporTuruTabs
          onRefresh={fetchCounts}
        />
      )}
    </>
  );
}
