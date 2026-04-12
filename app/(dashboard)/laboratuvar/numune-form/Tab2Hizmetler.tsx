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
  Limit?: string;
  Birim?: string;
  LOQ?: string;
  LimitEn?: string;
  BirimEn?: string;
  LOQEn?: string;
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
  const [paketDetaylari, setPaketDetaylari] = useState<Record<number, any[]>>({});
  const [loadingDetayId, setLoadingDetayId] = useState<number | null>(null);
  const [selectedPaketItems, setSelectedPaketItems] = useState<Record<string, boolean>>({});
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
    const sure = h.Sure == null ? null : Number(h.Sure);
    const next = [
      ...rows,
      {
        key: newKey(),
        AnalizID: h.ID,
        Termin: sure != null ? addDays(tarih, sure) : addDays(tarih, 0),
        x3ID: null,
        Kod: h.Kod,
        Ad: h.Ad,
        Metot: h.Metot || "",
        Sure: Number.isFinite(sure) ? sure : null,
        Limit: h.Limit,
        Birim: h.Birim,
        LimitEn: h.LimitEn,
        BirimEn: h.BirimEn,
        LOQ: h.LOQ,
        LOQEn: h.LOQEn,
      },
    ];
    onChange(next);
  };

  const addPaketHizmetler = async (x3id: number, onlySelected: boolean = false) => {
    setLoadingPaketId(x3id);
    try {
      const r = await fetch(`/api/numune-form/paket-items?x3id=${x3id}`);
      const raw = r.ok ? await r.json() : [];
      const items = Array.isArray(raw) ? raw : [];
      const next = [...rows];
      
      const itemsToAdd = onlySelected 
        ? items.filter((item, idx) => selectedPaketItems[`${x3id}-${idx}`])
        : items;
      
      for (const it of itemsToAdd) {
        const aid = pickAnalizId(it);
        if (!aid) continue;
        if (next.some(x => x.AnalizID === aid && x.x3ID === x3id)) continue;
        const sureRaw = it.Sure ?? it.sure;
        const sure = sureRaw == null ? null : Number(sureRaw);

        // Limit, Birim, LOQ ve EN versiyonlarını ayır
        const limitDeger = it.LimitDeger ? String(it.LimitDeger) : undefined;
        const limitBirim = it.LimitBirimi || undefined;
        const limitDegerEn = it.LimitDegerEn ? String(it.LimitDegerEn) : undefined;
        const limitBirimEn = it.LimitBirimiEn || undefined;
        const loq = it.LOQ ? String(it.LOQ) : undefined;
        const loqEn = it.LOQEn ? String(it.LOQEn) : undefined;

        next.push({
          key: newKey(),
          AnalizID: aid,
          Termin: addDays(tarih, Number.isFinite(sure as number) ? (sure as number) : 0),
          x3ID: x3id,
          Kod: pickStr(it, "Kod", "kod"),
          Ad: pickStr(it, "Ad", "ad"),
          Metot: pickStr(it, "Metot", "metot"),
          Sure: Number.isFinite(sure as number) ? (sure as number) : null,
          Limit: limitDeger,
          Birim: limitBirim,
          LimitEn: limitDegerEn,
          BirimEn: limitBirimEn,
          LOQ: loq,
          LOQEn: loqEn,
        });
      }
      onChange(next);
      if (onlySelected) {
        setSelectedPaketItems({});
      }
    } finally {
      setLoadingPaketId(null);
    }
  };

  const addSinglePaketItem = async (x3id: number, item: any) => {
    const aid = pickAnalizId(item);
    if (!aid) return;

    const next = [...rows];
    if (next.some(x => x.AnalizID === aid && x.x3ID === x3id)) return;

    const sureRaw = item.Sure ?? item.sure;
    const sure = sureRaw == null ? null : Number(sureRaw);

    // Limit, Birim, LOQ ve EN versiyonlarını ayır
    const limitDeger = item.LimitDeger ? String(item.LimitDeger) : undefined;
    const limitBirim = item.LimitBirimi || undefined;
    const limitDegerEn = item.LimitDegerEn ? String(item.LimitDegerEn) : undefined;
    const limitBirimEn = item.LimitBirimiEn || undefined;
    const loq = item.LOQ ? String(item.LOQ) : undefined;
    const loqEn = item.LOQEn ? String(item.LOQEn) : undefined;

    next.push({
      key: newKey(),
      AnalizID: aid,
      Termin: addDays(tarih, Number.isFinite(sure as number) ? (sure as number) : 0),
      x3ID: x3id,
      Kod: pickStr(item, "Kod", "kod"),
      Ad: pickStr(item, "Ad", "ad"),
      Metot: pickStr(item, "Metot", "metot"),
      Sure: Number.isFinite(sure as number) ? (sure as number) : null,
      Limit: limitDeger,
      Birim: limitBirim,
      LimitEn: limitDegerEn,
      BirimEn: limitBirimEn,
      LOQ: loq,
      LOQEn: loqEn,
    });

    onChange(next);
  };

  const togglePaketItemSelection = (x3id: number, idx: number) => {
    const key = `${x3id}-${idx}`;
    setSelectedPaketItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const selectAllPaketItems = (x3id: number, select: boolean) => {
    const items = paketDetaylari[x3id] || [];
    const newSelections: Record<string, boolean> = {};
    items.forEach((_, idx) => {
      newSelections[`${x3id}-${idx}`] = select;
    });
    setSelectedPaketItems(prev => ({ ...prev, ...newSelections }));
  };

  const fetchPaketDetaylari = async (x3id: number) => {
    if (paketDetaylari[x3id]) return; // Zaten yüklenmişse tekrar çekme
    
    setLoadingDetayId(x3id);
    try {
      const r = await fetch(`/api/numune-form/paket-items?x3id=${x3id}`);
      const raw = r.ok ? await r.json() : [];
      const items = Array.isArray(raw) ? raw : [];
      setPaketDetaylari(prev => ({ ...prev, [x3id]: items }));
    } finally {
      setLoadingDetayId(null);
    }
  };

  const setLimit = (key: string, limit: string) =>
    onChange(rows.map(r => (r.key === key ? { ...r, Limit: limit } : r)));

  const setBirim = (key: string, birim: string) =>
    onChange(rows.map(r => (r.key === key ? { ...r, Birim: birim } : r)));

  const setLOQ = (key: string, loq: string) =>
    onChange(rows.map(r => (r.key === key ? { ...r, LOQ: loq } : r)));

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
                    <th style={thStyle}>Matriks</th>
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
                    onClick={() => {
  const newExpanded = paketExpanded === p.ID ? null : p.ID;
  setPaketExpanded(newExpanded);
  if (newExpanded && !paketDetaylari[p.ID]) {
    void fetchPaketDetaylari(p.ID);
  }
}}
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
                          const hasSelected = Object.keys(selectedPaketItems).some(key => 
                            key.startsWith(`${p.ID}-`) && selectedPaketItems[key]
                          );
                          void addPaketHizmetler(p.ID, hasSelected);
                        }}
                      >
                        {loadingPaketId === p.ID ? "…" : (Object.keys(selectedPaketItems).some(key => 
                          key.startsWith(`${p.ID}-`) && selectedPaketItems[key]
                        ) ? "Seçilileri Ekle" : "Tümünü Ekle")}
                      </button>
                      <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>{paketExpanded === p.ID ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {paketExpanded === p.ID && (
                    <div style={{ paddingLeft: 16, paddingBottom: 8 }}>
                      {loadingDetayId === p.ID ? (
                        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", padding: "8px" }}>Yükleniyor...</p>
                      ) : (
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid var(--color-border-light)" }}>
                              <th style={{ textAlign: "center", padding: "4px 8px", color: "var(--color-text-secondary)", fontWeight: 600 }}>
                                <input
                                  type="checkbox"
                                  checked={(paketDetaylari[p.ID] || []).every((_, idx) => selectedPaketItems[`${p.ID}-${idx}`])}
                                  onChange={(e) => selectAllPaketItems(p.ID, e.target.checked)}
                                  style={{ cursor: "pointer" }}
                                />
                              </th>
                              <th style={{ textAlign: "left", padding: "4px 8px", color: "var(--color-text-secondary)", fontWeight: 600 }}>Kod</th>
                              <th style={{ textAlign: "left", padding: "4px 8px", color: "var(--color-text-secondary)", fontWeight: 600 }}>Hizmet Adı</th>
                              <th style={{ textAlign: "left", padding: "4px 8px", color: "var(--color-text-secondary)", fontWeight: 600 }}>Metot</th>
                              <th style={{ textAlign: "center", padding: "4px 8px", color: "var(--color-text-secondary)", fontWeight: 600 }}>Süre</th>
                              <th style={{ textAlign: "left", padding: "4px 8px", color: "var(--color-text-secondary)", fontWeight: 600 }}>Limit</th>
                              <th style={{ textAlign: "left", padding: "4px 8px", color: "var(--color-text-secondary)", fontWeight: 600 }}>Birim</th>
                              <th style={{ textAlign: "center", padding: "4px 8px", color: "var(--color-text-secondary)", fontWeight: 600 }}>İşlem</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(paketDetaylari[p.ID] || []).map((item, idx) => (
                              <tr key={idx} style={{ borderBottom: idx < (paketDetaylari[p.ID]?.length || 0) - 1 ? "1px solid var(--color-border-light)" : "none" }}>
                                <td style={{ padding: "4px 8px", textAlign: "center" }}>
                                  <input
                                    type="checkbox"
                                    checked={selectedPaketItems[`${p.ID}-${idx}`] || false}
                                    onChange={() => togglePaketItemSelection(p.ID, idx)}
                                    style={{ cursor: "pointer" }}
                                  />
                                </td>
                                <td style={{ padding: "4px 8px", color: "var(--color-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                                  {item.Kod || "—"}
                                </td>
                                <td style={{ padding: "4px 8px", fontWeight: 500 }}>
                                  {item.Ad || "—"}
                                </td>
                                <td style={{ padding: "4px 8px", color: "var(--color-text-secondary)" }}>
                                  {item.Metot || "—"}
                                </td>
                                <td style={{ padding: "4px 8px", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                                  {item.Sure ? `${item.Sure} gün` : "—"}
                                </td>
                                <td style={{ padding: "4px 8px", color: "var(--color-text-secondary)" }}>
                                  {item.LimitDeger || "—"}
                                </td>
                                <td style={{ padding: "4px 8px", color: "var(--color-text-secondary)" }}>
                                  {item.LimitBirimi || "—"}
                                </td>
                                <td style={{ padding: "4px 8px", textAlign: "center" }}>
                                  <button
                                    type="button"
                                    style={{
                                      padding: "2px 8px",
                                      fontSize: "11px",
                                      background: "var(--color-accent)",
                                      color: "white",
                                      border: "none",
                                      borderRadius: "4px",
                                      cursor: "pointer"
                                    }}
                                    onClick={() => addSinglePaketItem(p.ID, item)}
                                  >
                                    Ekle
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
                <th style={{ width: 140 }}>Limit</th>
                <th style={{ width: 100 }}>Birim</th>
                <th style={{ width: 100 }}>LOQ</th>
                <th style={{ width: 140 }}>Termin</th>
                <th style={{ width: 56 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.key}>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.Kod}</td>
                  <td>{r.Ad}</td>
                  <td style={{ color: "var(--color-text-secondary)", fontSize: "0.82rem" }}>{r.Metot}</td>
                  <td style={{ color: "var(--color-text-secondary)", fontSize: "0.82rem" }}>
                    <input
                      type="text"
                      value={r.Limit || ""}
                      onChange={e => setLimit(r.key, e.target.value)}
                      placeholder="Limit girin..."
                      style={{
                        width: "100%",
                        padding: "4px 8px",
                        border: "1px solid var(--color-border)",
                        borderRadius: "4px",
                        fontSize: "0.82rem",
                        background: "var(--color-surface)",
                        color: "var(--color-text-primary)"
                      }}
                    />
                  </td>
                  <td style={{ color: "var(--color-text-secondary)", fontSize: "0.82rem" }}>
                    <input
                      type="text"
                      value={r.Birim || ""}
                      onChange={e => setBirim(r.key, e.target.value)}
                      placeholder="Birim..."
                      style={{
                        width: "100%",
                        padding: "4px 8px",
                        border: "1px solid var(--color-border)",
                        borderRadius: "4px",
                        fontSize: "0.82rem",
                        background: "var(--color-surface)",
                        color: "var(--color-text-primary)"
                      }}
                    />
                  </td>
                  <td style={{ color: "var(--color-text-secondary)", fontSize: "0.82rem" }}>
                    <input
                      type="text"
                      value={r.LOQ || ""}
                      onChange={e => setLOQ(r.key, e.target.value)}
                      placeholder="LOQ..."
                      style={{
                        width: "100%",
                        padding: "4px 8px",
                        border: "1px solid var(--color-border)",
                        borderRadius: "4px",
                        fontSize: "0.82rem",
                        background: "var(--color-surface)",
                        color: "var(--color-text-primary)"
                      }}
                    />
                  </td>
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
