"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { HizmetRow, RaporHeader } from "../reportTypes";

interface Props {
  nkrId: number;
  format: string;
}

interface ApiData {
  data: {
    header: RaporHeader;
    hizmetler: HizmetRow[];
  };
  locked: boolean;
}

const emptyRow = (): HizmetRow => ({
  AnalizID: 0,
  X1ID: Math.floor(Math.random() * -1_000_000),
  Kod: "",
  Ad: "",
  Akreditasyon: "",
  Metot: "",
  Birim: "",
  LimitDeger: "",
  LOQ: "",
  Sonuc: "",
  Degerlendirme: "",
  Termin: null,
  altParametreler: [],
});

export default function RaporDuzenleClient({ nkrId, format }: Props) {
  const [header, setHeader] = useState<Partial<RaporHeader>>({});
  const [hizmetler, setHizmetler] = useState<HizmetRow[]>([]);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const apiUrl = useMemo(
    () => `/api/rapor-duzenleme/${nkrId}?format=${encodeURIComponent(format)}`,
    [nkrId, format],
  );

  async function readJson<T>(response: Response): Promise<T> {
    const text = await response.text();
    let data: any = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(text.slice(0, 300) || "Sunucu JSON olmayan bir yanıt döndürdü.");
      }
    }
    if (!response.ok) throw new Error(data.error || data.message || "İşlem tamamlanamadı.");
    return data as T;
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(apiUrl, { cache: "no-store" })
      .then(async (r) => {
        return readJson<ApiData>(r);
      })
      .then((j) => {
        if (!alive) return;
        setHeader(j.data.header || {});
        setHizmetler(j.data.hizmetler || []);
        setLocked(Boolean(j.locked));
      })
      .catch((e) => alive && setError(e.message || "Rapor yüklenemedi"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [apiUrl]);

  const updateRow = (idx: number, patch: Partial<HizmetRow>) => {
    setHizmetler((rows) => rows.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(apiUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ header, hizmetler }),
      });
      await readJson<{ ok: boolean }>(res);
      setMessage("Düzenleme kaydedildi.");
    } catch (e: any) {
      setError(e.message || "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  const preview = () => {
    window.open(`/rapor-onay-print/${nkrId}?format=${encodeURIComponent(format)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <main style={{ minHeight: "100vh", background: "#f5f5f7", color: "#1d1d1f", fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <div style={{ maxWidth: 1680, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>Rapor Düzenle</h1>
            <div style={{ fontSize: 13, color: "#6e6e73", marginTop: 3 }}>
              {header.RaporNo || nkrId} · {format} · Format değiştirilmez, sadece rapor içeriği düzenlenir.
            </div>
          </div>
          <div style={{ flex: 1 }} />
          {locked && <span style={{ padding: "6px 10px", borderRadius: 999, background: "#34c75918", color: "#248a3d", fontWeight: 700, fontSize: 12 }}>Kilitli</span>}
          <button type="button" onClick={preview} style={buttonStyle("ghost")}>Önizle</button>
          <button type="button" onClick={save} disabled={locked || saving || loading} style={buttonStyle("primary")}>
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>

        {error && <div style={alertStyle("#ff3b30")}>{error}</div>}
        {message && <div style={alertStyle("#34c759")}>{message}</div>}

        {loading ? (
          <div style={panelStyle}>Yükleniyor...</div>
        ) : (
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <section style={panelStyle}>
              <div style={sectionTitle}>Üst Bilgiler</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                <Field label="Numune Adı" value={header.Numune_Adi || ""} disabled={locked} onChange={v => setHeader(h => ({ ...h, Numune_Adi: v }))} />
                <Field label="Ürün Tipi" value={header.Urun_Tipi || ""} disabled={locked} onChange={v => setHeader(h => ({ ...h, Urun_Tipi: v }))} />
                <Field label="Karar / Açıklama" value={header.Karar || ""} disabled={locked} onChange={v => setHeader(h => ({ ...h, Karar: v }))} />
              </div>
            </section>

            <section style={panelStyle}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
                <div style={sectionTitle}>Sonuç Tablosu</div>
                <div style={{ flex: 1 }} />
                <button type="button" disabled={locked} onClick={() => setHizmetler(rows => [...rows, emptyRow()])} style={buttonStyle("ghost")}>Satır Ekle</button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
                  <thead>
                    <tr>
                      {["Kod", "Hizmet", "Metot", "Birim", "Limit", "Sonuç", "Değerlendirme", ""].map(h => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {hizmetler.map((h, idx) => (
                      <tr key={`${h.X1ID ?? idx}-${idx}`}>
                        <Cell value={h.Kod} disabled={locked} onChange={v => updateRow(idx, { Kod: v })} />
                        <Cell value={h.Ad} disabled={locked} onChange={v => updateRow(idx, { Ad: v })} wide />
                        <Cell value={h.Metot} disabled={locked} onChange={v => updateRow(idx, { Metot: v })} />
                        <Cell value={h.Birim} disabled={locked} onChange={v => updateRow(idx, { Birim: v })} />
                        <Cell value={h.LimitDeger || ""} disabled={locked} onChange={v => updateRow(idx, { LimitDeger: v })} />
                        <Cell value={h.Sonuc || ""} disabled={locked} onChange={v => updateRow(idx, { Sonuc: v })} />
                        <td style={tdStyle}>
                          <select
                            value={h.Degerlendirme || ""}
                            disabled={locked}
                            onChange={e => updateRow(idx, { Degerlendirme: e.target.value })}
                            style={inputStyle}
                          >
                            <option value="">-</option>
                            <option value="Uygun">Uygun</option>
                            <option value="Uygun Değil">Uygun Değil</option>
                            <option value="D.Y.">D.Y.</option>
                          </select>
                        </td>
                        <td style={{ ...tdStyle, width: 70, textAlign: "center" }}>
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() => setHizmetler(rows => rows.filter((_, i) => i !== idx))}
                            style={{ ...buttonStyle("danger"), padding: "6px 9px" }}
                          >
                            Sil
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section style={panelStyle}>
              <div style={{ ...sectionTitle, marginBottom: 10 }}>Açıklamalar</div>
              <textarea
                value={header.Aciklamalar ?? ""}
                disabled={locked}
                onChange={e => setHeader(h => ({ ...h, Aciklamalar: e.target.value }))}
                placeholder="Test sonuçları müşteri spesifikasyonuna göre değerlendirilmiştir."
                rows={5}
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }}
              />
              <div style={{ fontSize: 12, color: "#6e6e73", marginTop: 6 }}>
                Raporda &ldquo;AÇIKLAMALAR&rdquo; başlığı altında görünür. Boş bırakılırsa varsayılan cümle kullanılır.
                Analiz Periyodu satırı otomatik eklenir.
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

function Field({ label, value, onChange, disabled }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  return (
    <label style={{ display: "grid", gap: 5, fontSize: 12, color: "#6e6e73", fontWeight: 700 }}>
      {label}
      <input value={value} disabled={disabled} onChange={e => onChange(e.target.value)} style={inputStyle} />
    </label>
  );
}

function Cell({ value, onChange, disabled, wide = false }: { value?: string | null; onChange: (value: string) => void; disabled: boolean; wide?: boolean }) {
  return (
    <td style={{ ...tdStyle, minWidth: wide ? 220 : 120 }}>
      <input value={value || ""} disabled={disabled} onChange={e => onChange(e.target.value)} style={inputStyle} />
    </td>
  );
}

const panelStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e5ea",
  borderRadius: 10,
  padding: 16,
  marginBottom: 14,
};

const sectionTitle: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#6e6e73",
};

const thStyle: CSSProperties = {
  padding: "8px 10px",
  textAlign: "left",
  fontSize: 11,
  textTransform: "uppercase",
  color: "#6e6e73",
  borderBottom: "1px solid #e5e5ea",
};

const tdStyle: CSSProperties = {
  padding: 6,
  borderBottom: "1px solid #f2f2f7",
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #d2d2d7",
  borderRadius: 7,
  padding: "7px 9px",
  fontSize: 13,
  background: "#fff",
  color: "#1d1d1f",
};

function buttonStyle(kind: "primary" | "ghost" | "danger"): CSSProperties {
  const colors = {
    primary: { background: "#0071e3", color: "#fff", border: "1px solid #0071e3" },
    ghost: { background: "#fff", color: "#1d1d1f", border: "1px solid #d2d2d7" },
    danger: { background: "#ff3b3014", color: "#c00", border: "1px solid #ff3b3030" },
  }[kind];
  return {
    ...colors,
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  };
}

function alertStyle(color: string): CSSProperties {
  return {
    border: `1px solid ${color}33`,
    color,
    background: `${color}12`,
    borderRadius: 8,
    padding: "10px 12px",
    marginBottom: 12,
    fontSize: 13,
    fontWeight: 600,
  };
}
