"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import styles from "@/app/styles/table.module.css";
import type { FormulRow, LookupData, NkrFormData } from "./numuneFormTypes";

function newKey() {
  return `f-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface Props {
  rows: FormulRow[];
  onChange: (rows: FormulRow[]) => void;
  form: Pick<NkrFormData, "Urun_Tipi" | "Hedef_Grup" | "UGDTip_ID" | "UGDTip_Kategori">;
  onFormChange: (u: Partial<NkrFormData>) => void;
  lookup: LookupData;
}

// ── Hesaplama yardımcıları ─────────────────────────────────
function calcSED(miktar: string, aStr: string, dap: string): number | null {
  const m = parseFloat(miktar);
  const a = parseFloat(aStr);
  const d = dap.trim() !== "" ? parseFloat(dap) : 100;
  if (!isFinite(m) || !isFinite(a) || !isFinite(d) || a === 0) return null;
  if (m === 0) return 0;
  return (m * a * d) / 10000;
}

function calcMOS(noael: string, sed: number | null): number | null {
  if (sed === null || sed === 0) return null;
  const n = parseFloat(noael);
  if (!isFinite(n)) return null;
  return n / sed;
}

function fmt4(v: number | null): string {
  if (v === null || !isFinite(v)) return "";
  return v.toFixed(4);
}

// ── Bölüm kartı ────────────────────────────────────────────
function SCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--color-surface)",
      border: "1px solid var(--color-border-light)",
      borderRadius: "var(--radius-md)",
      marginBottom: 18,
      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      overflow: "visible",
    }}>
      <div style={{
        padding: "11px 16px 9px",
        borderBottom: "1px solid var(--color-border-light)",
        background: "var(--color-surface-2)",
        borderRadius: "var(--radius-md) var(--radius-md) 0 0",
      }}>
        <div style={{ fontSize: "0.8125rem", fontWeight: 650, color: "var(--color-text-primary)", letterSpacing: "-0.01em", margin: 0 }}>{title}</div>
        {hint && <div style={{ fontSize: "0.72rem", color: "var(--color-text-tertiary)", marginTop: 4, lineHeight: 1.4 }}>{hint}</div>}
      </div>
      <div style={{ padding: "14px 16px 16px" }}>{children}</div>
    </div>
  );
}

const HEDEF_ONERI = ["Yetişkinler", "Bebekler", "Çocuklar", "Genel tüketici", "Profesyonel kullanım"];

const thSt: React.CSSProperties = {
  padding: "6px 8px",
  textAlign: "left",
  fontSize: "0.7rem",
  fontWeight: 700,
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
  color: "var(--color-text-secondary)",
  background: "var(--color-surface)",
  borderBottom: "2px solid var(--color-border)",
  whiteSpace: "nowrap",
  position: "sticky" as const,
  top: 0,
  zIndex: 1,
};

const tdSt: React.CSSProperties = {
  padding: "5px 6px",
  verticalAlign: "middle",
  borderBottom: "1px solid var(--color-border-light)",
};

const cellIn: React.CSSProperties = {
  width: "100%",
  padding: "4px 6px",
  border: "1px solid var(--color-border)",
  borderRadius: 4,
  fontSize: "0.8rem",
  background: "var(--color-surface)",
  color: "var(--color-text-primary)",
  boxSizing: "border-box" as const,
};

const cellRO: React.CSSProperties = {
  ...cellIn,
  background: "var(--color-surface-2)",
  color: "var(--color-text-secondary)",
  cursor: "default",
  border: "none",
  padding: "4px 6px",
};

const calcCell: React.CSSProperties = {
  ...cellRO,
  fontVariantNumeric: "tabular-nums",
  fontSize: "0.78rem",
  fontWeight: 600,
};

export default function Tab3Formul({ rows, onChange, form, onFormChange, lookup }: Props) {
  const [inputText, setInputText] = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedTip  = lookup.rUGDTipler.find(t => t.ID === form.UGDTip_ID) ?? null;
  const aStr         = selectedTip?.ADegeri || "";
  const ugdTipSorted = [...lookup.rUGDTipler].sort((a, b) =>
    a.Kategori.localeCompare(b.Kategori, "tr") || a.UrunTipi.localeCompare(b.UrunTipi, "tr")
  );

  const appendRows = (list: { INCIName: string; Miktar: string }[]) => {
    if (list.length === 0) return;
    onChange([
      ...rows,
      ...list.map(r => ({
        key: newKey(),
        HammaddeID: null,
        INCIName: r.INCIName,
        Miktar: r.Miktar,
        DaP: "",
        Noael: "",
        Cas: "",
        Regulation: "",
      })),
    ]);
  };

  const handlePaste = () => {
    setError("");
    if (!inputText.trim()) {
      setError("Önce formül satırlarını yapıştırın.");
      return;
    }
    const lines = inputText.split("\n").filter(l => l.trim());
    const parsed = lines.map(l => {
      const parts = l.split("\t");
      if (parts.length >= 2) return { INCIName: parts[0]!.trim(), Miktar: (parts[1] || "0").trim().replace(",", ".") };
      const fb = l.split(/\s\s+/);
      if (fb.length >= 2) return { INCIName: fb[0]!.trim(), Miktar: fb[1]!.trim().replace(",", ".") };
      return null;
    }).filter((x): x is { INCIName: string; Miktar: string } => !!x?.INCIName);
    if (parsed.length === 0) { setError("Satır ayrıştırılamadı."); return; }
    appendRows(parsed);
    setInputText("");
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]!]!;
        const data = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];
        const items = data.map(row => ({
          INCIName: String(row["INCI İsmi"] ?? row["INCI ismi"] ?? row["INCI"] ?? "").trim(),
          Miktar: String(row["Üst Değer(%)"] ?? row["Üst değer(%)"] ?? row["Miktar"] ?? "0").replace(",", "."),
        })).filter(i => i.INCIName);
        if (items.length === 0) { setError("Excel'de 'INCI İsmi' ve 'Miktar' sütunları bulunamadı."); return; }
        appendRows(items);
      } catch { setError("Dosya okunamadı."); }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  const matchAll = async () => {
    if (rows.length === 0) return;
    setLoading(true);
    setError("");
    try {
      const items = rows.map(r => ({ name: r.INCIName, amount: r.Miktar || "0" }));
      const res = await fetch("/api/formul-kontrol/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error("Eşleştirme başarısız");
      const json = await res.json() as Array<{
        INCIName: string | null; inputName: string; inputAmount: string;
        Cas?: string | null; Regulation?: string | null;
      }>;
      onChange(rows.map((r, i) => {
        const m = json[i];
        if (!m) return r;
        return {
          ...r,
          INCIName: m.INCIName || m.inputName || r.INCIName,
          Miktar: m.inputAmount || r.Miktar,
          Cas: m.Cas || r.Cas || "",
          Regulation: m.Regulation || r.Regulation || "",
        };
      }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Hata");
    } finally {
      setLoading(false);
    }
  };

  const update = (key: string, patch: Partial<FormulRow>) =>
    onChange(rows.map(r => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => onChange(rows.filter(r => r.key !== key));

  const sel: React.CSSProperties = { width: "100%" };

  return (
    <div style={{ padding: "20px 24px" }}>
      <datalist id="hedef-grup-oneri-t3">
        {HEDEF_ONERI.map(h => <option key={h} value={h} />)}
      </datalist>

      {/* ── Ürün Özellikleri ── */}
      <SCard
        title="Ürün Özellikleri — UGD Sınıflandırması"
        hint="Kategori seçilince A değeri otomatik dolar; formül tablosundaki SED/MOS hesaplamalarında kullanılır."
      >
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "10px 14px", marginBottom: 12 }}>
          <div className={styles.formGroup}>
            <label>Ürün tipi (durulama)</label>
            <select style={sel} value={form.Urun_Tipi} onChange={e => onFormChange({ Urun_Tipi: e.target.value })}>
              <option value="">Seçin</option>
              <option value="Durulanan">Durulanan</option>
              <option value="Durulanmayan">Durulanmayan</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label>Hedef grup</label>
            <input style={sel} value={form.Hedef_Grup} onChange={e => onFormChange({ Hedef_Grup: e.target.value })} list="hedef-grup-oneri-t3" placeholder="Önerilerden seçin veya yazın…" />
          </div>
        </div>

        <div className={styles.formGroup} style={{ marginBottom: 12 }}>
          <label>Kategori — UGD ürün türü</label>
          <select
            style={sel}
            value={form.UGDTip_ID != null ? String(form.UGDTip_ID) : ""}
            onChange={e => {
              const v = e.target.value;
              if (!v) { onFormChange({ UGDTip_ID: null, UGDTip_Kategori: "" }); return; }
              const id = parseInt(v, 10);
              const tip = lookup.rUGDTipler.find(t => t.ID === id);
              onFormChange({ UGDTip_ID: id, UGDTip_Kategori: tip?.Kategori ?? "" });
            }}
          >
            <option value="">Seçin</option>
            {ugdTipSorted.map(t => (
              <option key={t.ID} value={t.ID}>{t.Kategori} — {t.UrunTipi}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: "10px 14px" }}>
          <div className={styles.formGroup}>
            <label>Uygulama alanı</label>
            <input readOnly style={{ ...sel, background: "var(--color-surface-2)", color: "var(--color-text-secondary)" }} value={selectedTip?.UygulamaBolgesi || ""} placeholder="—" />
          </div>
          <div className={styles.formGroup}>
            <label>A değeri</label>
            <input readOnly style={{ ...sel, background: "var(--color-surface-2)", color: selectedTip?.ADegeri ? "var(--color-accent)" : "var(--color-text-tertiary)", fontWeight: 600 }} value={selectedTip?.ADegeri || ""} placeholder="—" />
          </div>
        </div>
      </SCard>

      {/* ── Formülasyon girişi ── */}
      <SCard
        title="Formülasyon"
        hint="Formül kontrol sayfasındaki gibi yapıştırma veya Excel şablonu kullanın. Eşleştirme CAS ve Regulation bilgilerini doldurur."
      >
        {error && <div className={styles.formError} style={{ marginBottom: 12 }}>{error}</div>}

        <div className={styles.formGroup} style={{ marginBottom: 12 }}>
          <label>Yapıştır (satır başına: INCI [tab] miktar)</label>
          <textarea
            rows={4}
            style={{ width: "100%", resize: "vertical", fontFamily: "ui-monospace, monospace", fontSize: "0.8rem" }}
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder={"GLYCERIN\t5\nAQUA\t80"}
          />
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const, marginBottom: 0 }}>
          <button type="button" className={styles.saveBtn} onClick={handlePaste}>Satırları ekle</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleFile} />
          <button type="button" className={styles.cancelBtn} onClick={() => fileRef.current?.click()}>Excel seç</button>
          <button type="button" className={styles.cancelBtn} onClick={() => void matchAll()} disabled={rows.length === 0 || loading}>
            {loading ? "Eşleştiriliyor…" : "Cosing ile eşleştir"}
          </button>
        </div>
      </SCard>

      {/* ── Değerlendirme tablosu ── */}
      {rows.length > 0 && (
        <SCard
          title="Değerlendirme Tablosu"
          hint={aStr ? `A = ${aStr}  |  SED = Miktar × A × DaP ÷ 10000  |  MOS = NOAEL ÷ SED` : "A değeri için üstten UGD kategorisi seçin."}
        >
          <div style={{ overflowX: "auto" as const }}>
            <table style={{ borderCollapse: "collapse", fontSize: "0.8rem", width: "max-content", minWidth: "100%" }}>
              <thead>
                <tr>
                  <th style={{ ...thSt, minWidth: 180 }}>INCI Name</th>
                  <th style={{ ...thSt, minWidth: 90 }}>CAS</th>
                  <th style={{ ...thSt, minWidth: 140 }}>Regulation</th>
                  <th style={{ ...thSt, minWidth: 70 }}>Miktar</th>
                  <th style={{ ...thSt, minWidth: 70 }}>DaP</th>
                  <th style={{ ...thSt, minWidth: 70 }}>A</th>
                  <th style={{ ...thSt, minWidth: 80 }}>NOAEL</th>
                  <th style={{ ...thSt, minWidth: 90, color: "#0071e3" }}>SED</th>
                  <th style={{ ...thSt, minWidth: 90, color: "#248a3d" }}>MOS</th>
                  <th style={{ ...thSt, minWidth: 36 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const sed = calcSED(r.Miktar, aStr, r.DaP);
                  const mos = calcMOS(r.Noael, sed);
                  return (
                    <tr key={r.key}>
                      <td style={tdSt}>
                        <input style={cellIn} value={r.INCIName} onChange={e => update(r.key, { INCIName: e.target.value })} />
                      </td>
                      <td style={tdSt}>
                        <input style={cellRO} readOnly value={r.Cas || ""} placeholder="—" />
                      </td>
                      <td style={tdSt}>
                        <div title={r.Regulation || ""} style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.77rem", color: "var(--color-text-secondary)", padding: "4px 6px" }}>
                          {r.Regulation || <span style={{ color: "var(--color-text-tertiary)" }}>—</span>}
                        </div>
                      </td>
                      <td style={tdSt}>
                        <input style={{ ...cellIn, textAlign: "right" }} value={r.Miktar} onChange={e => update(r.key, { Miktar: e.target.value })} />
                      </td>
                      <td style={tdSt}>
                        <input style={{ ...cellIn, textAlign: "right" }} value={r.DaP} onChange={e => update(r.key, { DaP: e.target.value })} placeholder="100" />
                      </td>
                      <td style={tdSt}>
                        <div style={{ ...cellRO, textAlign: "right", color: aStr ? "var(--color-accent)" : "var(--color-text-tertiary)", fontWeight: 600 }}>
                          {aStr || "—"}
                        </div>
                      </td>
                      <td style={tdSt}>
                        <input style={{ ...cellIn, textAlign: "right" }} value={r.Noael} onChange={e => update(r.key, { Noael: e.target.value })} placeholder="—" />
                      </td>
                      <td style={tdSt}>
                        <div style={{ ...calcCell, textAlign: "right", color: sed !== null ? "#0071e3" : "var(--color-text-tertiary)" }}>
                          {fmt4(sed) || "—"}
                        </div>
                      </td>
                      <td style={tdSt}>
                        <div style={{
                          ...calcCell, textAlign: "right",
                          color: mos === null ? "var(--color-text-tertiary)" : mos >= 100 ? "#248a3d" : mos >= 10 ? "#c06800" : "#ff3b30",
                        }}>
                          {fmt4(mos) || "—"}
                        </div>
                      </td>
                      <td style={{ ...tdSt, textAlign: "center" }}>
                        <button type="button" className={styles.editBtn} style={{ color: "var(--color-danger)" }} onClick={() => remove(r.key)}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 10, fontSize: "0.72rem", color: "var(--color-text-tertiary)", display: "flex", gap: 16, flexWrap: "wrap" as const }}>
            <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#248a3d", borderRadius: 2, marginRight: 4 }} />MOS ≥ 100 (güvenli)</span>
            <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#c06800", borderRadius: 2, marginRight: 4 }} />MOS 10–100 (sınırda)</span>
            <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#ff3b30", borderRadius: 2, marginRight: 4 }} />MOS &lt; 10 (kritik)</span>
          </div>
        </SCard>
      )}

      {rows.length === 0 && (
        <div className={styles.empty} style={{ padding: 32 }}>Formül satırı yok. Yukarıdan satır ekleyin.</div>
      )}
    </div>
  );
}
