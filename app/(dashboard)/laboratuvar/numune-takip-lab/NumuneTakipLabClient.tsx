"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import KabulBekleyenlerTab from "./KabulBekleyenlerTab";
import RaporTakipTable from "../rapor-takip/RaporTakipTable";

// Sonuç Girişi içinde nested format tabları
const FORMAT_TABS = ["Genel", "Challenge", "Stabilite", "Claim", "ÜGDR", "Diğer"] as const;
type FormatTab = (typeof FORMAT_TABS)[number];

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
  // Sonuç Girişi format sekmelerinin rozetleri için: anahtar
  // UPPER+normalize edilmiş RaporFormati (örn "GENEL", "UGDR", "DIGER").
  byFormatLab?: Record<string, number>;
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

export default function NumuneTakipLabClient() {
  const searchParams = useSearchParams();
  const [mainTab, setMainTab] = useState<MainKey>("kabul");
  const [formatTab, setFormatTab] = useState<FormatTab>("Genel");
  // Kabul Et sonrası ilgili format tab'ını "kirli" işaretle
  const [refreshKey, setRefreshKey] = useState<Record<string, number>>({});
  // Tab sayıları
  const [counts, setCounts] = useState<Counts>({ kabul: 0, sonuc: 0, geri: 0, onay: 0, byFormatLab: {} });

  const fetchCounts = useCallback(() => {
    fetch("/api/numune-takip-lab/counts", { cache: "no-store" })
      .then(r => r.json())
      .then((j: Counts) => setCounts({
        kabul: Number(j.kabul ?? 0),
        sonuc: Number(j.sonuc ?? 0),
        geri:  Number(j.geri  ?? 0),
        onay:  Number(j.onay  ?? 0),
        byFormatLab: j.byFormatLab ?? {},
      }))
      .catch(() => { /* yoksay */ });
  }, []);
  useEffect(() => { fetchCounts(); }, [mainTab, formatTab, fetchCounts]);

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

  return (
    <>
      {/* Ana tablar */}
      <div style={tabContainer}>
        {MAIN_TABS.map(t => {
          const n = counts[t.key as keyof Counts];
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

      {/* Aktif ana tab içeriği */}
      {mainTab === "kabul" && (
        <KabulBekleyenlerTab onAccepted={bumpRefresh} />
      )}

      {mainTab === "sonuc" && (
        <>
          {/* Nested rapor formatı tabları */}
          <div style={subTabContainer}>
            {FORMAT_TABS.map(f => {
              const active = formatTab === f;
              const n = counts.byFormatLab?.[normFmt(f)] ?? 0;
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
            fixedRaporTuru={formatTab}
            acceptedOnly
            phase="lab"
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
