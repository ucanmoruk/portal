"use client";

import { useCallback, useRef, useState } from "react";
import type { CSSProperties } from "react";
import styles from "@/app/styles/table.module.css";
import type { HizmetRow } from "./numuneFormTypes";

function addDays(isoDate: string, days: number): string {
  const base = isoDate ? new Date(isoDate + "T12:00:00") : new Date();
  if (Number.isNaN(base.getTime())) return new Date().toISOString().split("T")[0]!;
  base.setDate(base.getDate() + Math.max(0, days));
  return base.toISOString().split("T")[0]!;
}

function newKey() {
  return `h-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface HizmetOpt {
  ID: number;
  Kod: string;
  Ad: string;
  Fiyat: number | null;
  ParaBirimi: string | null;
  Metot?: string;
  Sure?: number | null;
  Matriks?: string;
}

interface PaketItem {
  HizmetID: number;
  HizmetAdi: string;
  Kod: string;
  Fiyat: number | null;
  ParaBirimi: string | null;
}

interface PaketOpt {
  ID: number;
  ListeAdi: string;
  Aciklama: string;
  items: PaketItem[];
}

interface Props {
  tarih: string;
  rows: HizmetRow[];
  onChange: (rows: HizmetRow[]) => void;
}

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--color-text-secondary)",
  marginBottom: 6,
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: 14,
  background: "var(--color-surface)",
  color: "var(--color-text-primary)",
  boxSizing: "border-box",
  outline: "none",
};

const panelStyle: CSSProperties = {
  background: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  padding: 12,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  fontWeight: 600,
  fontSize: 12,
  color: "var(--color-text-secondary)",
  padding: "4px 8px",
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = { padding: "6px 8px", verticalAlign: "middle" };

const addPanelBtnStyle: CSSProperties = {
  padding: "6px 14px",
  fontSize: 13,
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  background: "var(--color-surface)",
  color: "var(--color-text-primary)",
  cursor: "pointer",
  fontWeight: 500,
};

const smallAddBtnStyle: CSSProperties = {
  padding: "3px 10px",
  fontSize: 12,
  border: "1px solid var(--color-accent)",
  borderRadius: 6,
  background: "transparent",
  color: "var(--color-accent)",
  cursor: "pointer",
  fontWeight: 500,
  whiteSpace: "nowrap",
};

const smallText: CSSProperties = { fontSize: 13, color: "var(--color-text-tertiary)" };

function pickAnalizId(row: Record<string, unknown>): number {
  const v = row.AnalizID ?? row.analizid;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pickStr(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && v !== "") return String(v);
  }
  return "";
}

export default function Tab2Hizmetler({ tarih, rows, onChange }: Props) {
  const [addMode, setAddMode] = useState<"hizmet" | "paket" | null>(null);
  const [hizmetQ, setHizmetQ] = useState("");
  const [hizmetOpts, setHizmetOpts] = useState<HizmetOpt[]>([]);
  const [hizmetLoading, setHizmetLoading] = useState(false);
  const [paketler, setPaketler] = useState<PaketOpt[]>([]);
  const [paketLoading, setPaketLoading] = useState(false);
  const [paketExpanded, setPaketExpanded] = useState<number | null>(null);
  const [loadingPaketId, setLoadingPaketId] = useState<number | null>(null);
  const hizmetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleHizmetQ = useCallback((val: string) => {
    setHizmetQ(val);
    if (hizmetTimer.current) clearTimeout(hizmetTimer.current);
    hizmetTimer.current = setTimeout(async () => {
      setHizmetLoading(true);
      try {
        const r = await fetch(`/api/teklifler/lookup?type=hizmetler&q=${encodeURIComponent(val)}`);
        const j = await r.json();
        setHizmetOpts(j.data || []);
      } finally {
        setHizmetLoading(false);
      }
    }, 300);
  }, []);

  async function loadPaketler() {
    setPaketLoading(true);
    try {
      const r = await fetch("/api/teklifler/lookup?type=paketler");
      const j = await r.json();
      setPaketler(j.data || []);
    } finally {
      setPaketLoading(false);
    }
  }

  function toggleAddMode(mode: "hizmet" | "paket") {
    if (addMode === mode) {
      setAddMode(null);
      return;
    }
    setAddMode(mode);
    if (mode === "hizmet" && hizmetOpts.length === 0) handleHizmetQ("");
    if (mode === "paket" && paketler.length === 0) void loadPaketler();
  }

  const addHizmet = (h: HizmetOpt) => {
    if (rows.some(x => x.AnalizID === h.ID && !x.x3ID)) return;
    const metot = h.Metot ?? "";
    const termin = addDays(tarih, h.Sure ?? 0);
    onChange([
      ...rows,
      {
        key: newKey(),
        AnalizID: h.ID,
        Termin: termin,
        x3ID: null,
        Kod: h.Kod,
        Ad: h.Ad,
        Metot: metot,
        Sure: h.Sure ?? null,
      },
    ]);
  };

  const addPaketHizmetler = async (x3id: number) => {
    setLoadingPaketId(x3id);
    try {
      const r = await fetch(`/api/numune-form/paket-items?x3id=${x3id}`);
      const raw = r.ok ? await r.json() : [];
      const items = Array.isArray(raw) ? raw : [];
      const next = [...rows];
      for (const it of items as Record<string, unknown>[]) {
        const aid = pickAnalizId(it);
        if (!aid) continue;
        if (next.some(x => x.AnalizID === aid && x.x3ID === x3id)) continue;
        const sureRaw = it.Sure ?? it.sure;
        const sure = sureRaw == null ? null : Number(sureRaw);
        next.push({
          key: newKey(),
          AnalizID: aid,
          Termin: addDays(tarih, Number.isFinite(sure as number) ? (sure as number) : 0),
          x3ID: x3id,
          Kod: pickStr(it, "Kod", "kod"),
          Ad: pickStr(it, "Ad", "ad"),
          Metot: pickStr(it, "Metot", "metot"),
          Sure: Number.isFinite(sure as number) ? (sure as number) : null,
        });
      }
      onChange(next);
    } finally {
      setLoadingPaketId(null);
    }
  };

  const remove = (key: string) => onChange(rows.filter(r => r.key !== key));

  const setTermin = (key: string, termin: string) =>
    onChange(rows.map(r => (r.key === key ? { ...r, Termin: termin } : r)));

  return (
    <div style={{ padding: "20px 24px" }}>
      <label style={labelStyle}>Hizmet satırları</label>

      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        {(["hizmet", "paket"] as const).map(mode => (
          <button
            key={mode}
            type="button"
            style={{
              ...addPanelBtnStyle,
              background: addMode === mode ? "var(--color-accent)" : undefined,
              color: addMode === mode ? "#fff" : undefined,
            }}
            onClick={() => toggleAddMode(mode)}
          >
            {mode === "hizmet" ? "+ Hizmet Ekle" : "≡ Paketten Ekle"}
          </button>
        ))}
      </div>

      {addMode === "hizmet" && (
        <div style={{ ...panelStyle, marginBottom: 16 }}>
          <input
            style={{ ...inputStyle, marginBottom: 8 }}
            placeholder="Hizmet adı veya kodu ara..."
            value={hizmetQ}
            onChange={e => handleHizmetQ(e.target.value)}
            autoFocus
          />
          {hizmetLoading ? (
            <p style={smallText}>Yükleniyor...</p>
          ) : hizmetOpts.length === 0 ? (
            <p style={smallText}>Sonuç bulunamadı.</p>
          ) : (
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)", position: "sticky", top: 0, background: "var(--color-bg)" }}>
                    <th style={{ ...thStyle, width: 72 }}>Kod</th>
                    <th style={thStyle}>Hizmet adı</th>
                    <th style={thStyle}>Metot</th>
                    <th style={{ ...thStyle, width: 60 }}>Süre (g)</th>
                    <th style={thStyle}>Numune gereklilik</th>
                    <th style={{ ...thStyle, width: 60 }} />
                  </tr>
                </thead>
                <tbody>
                  {hizmetOpts.map(h => (
                    <tr key={h.ID} style={{ borderBottom: "1px solid var(--color-border-light)" }}>
                      <td style={{ ...tdStyle, color: "var(--color-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{h.Kod}</td>
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{h.Ad}</td>
                      <td style={{ ...tdStyle, color: "var(--color-text-secondary)", fontSize: 12 }}>{h.Metot || "—"}</td>
                      <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums", textAlign: "center" }}>{h.Sure ?? "—"}</td>
                      <td style={{ ...tdStyle, color: "var(--color-text-secondary)", fontSize: 12 }}>{h.Matriks || "—"}</td>
                      <td style={tdStyle}>
                        <button type="button" style={smallAddBtnStyle} onClick={() => addHizmet(h)}>
                          Ekle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {addMode === "paket" && (
        <div style={{ ...panelStyle, marginBottom: 16 }}>
          {paketLoading ? (
            <p style={smallText}>Yükleniyor...</p>
          ) : paketler.length === 0 ? (
            <p style={smallText}>Aktif paket bulunamadı.</p>
          ) : (
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {paketler.map(p => (
                <div key={p.ID} style={{ borderBottom: "1px solid var(--color-border)", marginBottom: 4 }}>
                  <div
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 4px", cursor: "pointer" }}
                    onClick={() => setPaketExpanded(prev => (prev === p.ID ? null : p.ID))}
                  >
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{p.ListeAdi}</span>
                      <span style={{ color: "var(--color-text-tertiary)", fontSize: 12, marginLeft: 8 }}>{p.items.length} hizmet</span>
                      {p.Aciklama ? (
                        <span style={{ color: "var(--color-text-secondary)", fontSize: 12, marginLeft: 8 }}>— {p.Aciklama}</span>
                      ) : null}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button
                        type="button"
                        style={smallAddBtnStyle}
                        disabled={loadingPaketId === p.ID}
                        onMouseDown={e => {
                          e.stopPropagation();
                          void addPaketHizmetler(p.ID);
                        }}
                      >
                        {loadingPaketId === p.ID ? "…" : "Tümünü Ekle"}
                      </button>
                      <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>{paketExpanded === p.ID ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {paketExpanded === p.ID && p.items.length > 0 && (
                    <div style={{ paddingLeft: 16, paddingBottom: 8 }}>
                      {p.items.map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: 12,
                            padding: "3px 0",
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          <span>
                            • {item.HizmetAdi}{" "}
                            {item.Kod ? <span style={{ color: "var(--color-text-tertiary)" }}>({item.Kod})</span> : null}
                          </span>
                          <span style={{ marginLeft: 16, flexShrink: 0 }}>
                            {item.Fiyat != null ? `${fmt(item.Fiyat)} ${item.ParaBirimi || "TRY"}` : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p style={{ fontSize: "0.78rem", color: "var(--color-text-tertiary)", marginBottom: 20 }}>
        Termin, Tab 1&apos;deki tarihe + hizmet süresi (gün) ile hesaplanır; aşağıdan değiştirebilirsiniz.
      </p>

      {rows.length === 0 ? (
        <div className={styles.empty} style={{ padding: 28 }}>
          Henüz hizmet eklenmedi.
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Kod</th>
                <th>Ad</th>
                <th>Metot</th>
                <th style={{ width: 160 }}>Termin</th>
                <th style={{ width: 56 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.key}>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.Kod}</td>
                  <td>{r.Ad}</td>
                  <td style={{ color: "var(--color-text-secondary)", fontSize: "0.82rem" }}>{r.Metot}</td>
                  <td>
                    <input
                      type="date"
                      value={r.Termin?.slice(0, 10) || ""}
                      onChange={e => setTermin(r.key, e.target.value)}
                      style={{ width: "100%" }}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.editBtn}
                      style={{ color: "var(--color-danger)" }}
                      onClick={() => remove(r.key)}
                      title="Kaldır"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
