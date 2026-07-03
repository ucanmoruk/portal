"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import GenelReport from "../formats/GenelReport";
import EkYukleBox from "./EkYukleBox";
import { isDigerFormat } from "@/lib/formatUtil";
import type { HizmetRow, RaporHeader, ReportFormatProps } from "../reportTypes";

interface Props {
  nkrId: number;
  format: string;
}

// rapor-duzenleme GET → loadRaporViewData çıktısının tamamı (header + hizmetler +
// meta/onay/karekod). WYSIWYG render için hepsi gerekir.
type ViewData = Omit<ReportFormatProps, "edit" | "hideToolbar">;

interface ApiData {
  data: ViewData;
  locked: boolean;
}

// Inline WYSIWYG düzenlemeyi destekleyen formatlar. Diğerleri klasik forma düşer.
const WYSIWYG_FORMATS = new Set(["Genel"]);

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
  const [view, setView] = useState<ViewData | null>(null);
  const [header, setHeader] = useState<RaporHeader | null>(null);
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
      .then((r) => readJson<ApiData>(r))
      .then((j) => {
        if (!alive) return;
        setView(j.data);
        setHeader(j.data.header);
        setHizmetler(j.data.hizmetler || []);
        setLocked(Boolean(j.locked));
      })
      .catch((e) => alive && setError(e.message || "Rapor yüklenemedi"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [apiUrl]);

  const editHandlers = useMemo(
    () => ({
      onHeaderChange: (patch: Partial<RaporHeader>) =>
        setHeader((h) => (h ? { ...h, ...patch } : h)),
      onRowChange: (idx: number, patch: Partial<HizmetRow>) =>
        setHizmetler((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r))),
      onAddRow: () => setHizmetler((rows) => [...rows, emptyRow()]),
      onRemoveRow: (idx: number) => setHizmetler((rows) => rows.filter((_, i) => i !== idx)),
    }),
    [],
  );

  const updateRow = (idx: number, patch: Partial<HizmetRow>) =>
    setHizmetler((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

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
      setMessage("Düzenleme kaydedildi. Onaylamak/paylaşmak için “Önizle”yi açın.");
    } catch (e: any) {
      setError(e.message || "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  const preview = () => {
    window.open(`/rapor-onay-print/${nkrId}?format=${encodeURIComponent(format)}`, "_blank", "noopener,noreferrer");
  };

  const wysiwyg = WYSIWYG_FORMATS.has(format) && Boolean(view && header);

  return (
    <div style={{ minHeight: "100vh", background: "#e9ecef", color: "#1d1d1f", fontFamily: "system-ui, sans-serif" }}>
      {/* Sabit üst araç çubuğu — rapor üzerinde gezinirken erişilebilir kalır */}
      <div style={toolbarBar}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Rapor Düzenle</div>
          <div style={{ fontSize: 12, color: "#6e6e73", marginTop: 2 }}>
            {header?.RaporNo || nkrId} · {format}
            {wysiwyg ? " · Rapor üzerinde doğrudan düzenleyin" : " · (bu format için klasik form)"}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {locked && <span style={lockBadge}>Kilitli</span>}
        <button type="button" onClick={preview} style={buttonStyle("ghost")}>Önizle</button>
        <button type="button" onClick={save} disabled={locked || saving || loading} style={buttonStyle("primary")}>
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </button>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px" }}>
        {error && <div style={alertStyle("#ff3b30")}>{error}</div>}
        {message && <div style={alertStyle("#34c759")}>{message}</div>}
      </div>

      {/* "Diğer" formatı: Ek-1 PDF yükleme (yayın/imza anında birleştirilir) */}
      {isDigerFormat(format) && (
        <EkYukleBox nkrId={nkrId} format={format} locked={locked} />
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#6e6e73" }}>Yükleniyor...</div>
      ) : wysiwyg && view && header ? (
        <GenelReport
          {...view}
          header={header}
          hizmetler={hizmetler}
          edit={locked ? undefined : editHandlers}
          hideToolbar
        />
      ) : (
        <LegacyForm
          header={header}
          hizmetler={hizmetler}
          locked={locked}
          onHeader={(patch) => setHeader((h) => (h ? { ...h, ...patch } : h))}
          onRow={updateRow}
          onAddRow={() => setHizmetler((rows) => [...rows, emptyRow()])}
          onRemoveRow={(idx) => setHizmetler((rows) => rows.filter((_, i) => i !== idx))}
        />
      )}
    </div>
  );
}

// ── Klasik form (WYSIWYG desteklemeyen formatlar için fallback) ──────────────
function LegacyForm({
  header,
  hizmetler,
  locked,
  onHeader,
  onRow,
  onAddRow,
  onRemoveRow,
}: {
  header: RaporHeader | null;
  hizmetler: HizmetRow[];
  locked: boolean;
  onHeader: (patch: Partial<RaporHeader>) => void;
  onRow: (idx: number, patch: Partial<HizmetRow>) => void;
  onAddRow: () => void;
  onRemoveRow: (idx: number) => void;
}) {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px 40px" }}>
      <section style={panelStyle}>
        <div style={sectionTitle}>Üst Bilgiler</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
          <Field label="Numune Adı" value={header?.Numune_Adi || ""} disabled={locked} onChange={(v) => onHeader({ Numune_Adi: v })} />
          <Field label="Ürün Tipi" value={header?.Urun_Tipi || ""} disabled={locked} onChange={(v) => onHeader({ Urun_Tipi: v })} />
          <Field label="Karar / Açıklama" value={header?.Karar || ""} disabled={locked} onChange={(v) => onHeader({ Karar: v })} />
        </div>
      </section>

      <section style={panelStyle}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
          <div style={sectionTitle}>Sonuç Tablosu</div>
          <div style={{ flex: 1 }} />
          <button type="button" disabled={locked} onClick={onAddRow} style={buttonStyle("ghost")}>Satır Ekle</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
            <thead>
              <tr>
                {["Kod", "Hizmet", "Metot", "Birim", "Limit", "Sonuç", "Değerlendirme", ""].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hizmetler.map((h, idx) => (
                <tr key={`${h.X1ID ?? idx}-${idx}`}>
                  <Cell value={h.Kod} disabled={locked} onChange={(v) => onRow(idx, { Kod: v })} />
                  <Cell value={h.Ad} disabled={locked} onChange={(v) => onRow(idx, { Ad: v })} wide />
                  <Cell value={h.Metot} disabled={locked} onChange={(v) => onRow(idx, { Metot: v })} />
                  <Cell value={h.Birim} disabled={locked} onChange={(v) => onRow(idx, { Birim: v })} />
                  <Cell value={h.LimitDeger || ""} disabled={locked} onChange={(v) => onRow(idx, { LimitDeger: v })} />
                  <Cell value={h.Sonuc || ""} disabled={locked} onChange={(v) => onRow(idx, { Sonuc: v })} />
                  <td style={tdStyle}>
                    <select value={h.Degerlendirme || ""} disabled={locked} onChange={(e) => onRow(idx, { Degerlendirme: e.target.value })} style={inputStyle}>
                      <option value="">-</option>
                      <option value="Uygun">Uygun</option>
                      <option value="Uygun Değil">Uygun Değil</option>
                      <option value="D.Y.">D.Y.</option>
                    </select>
                  </td>
                  <td style={{ ...tdStyle, width: 70, textAlign: "center" }}>
                    <button type="button" disabled={locked} onClick={() => onRemoveRow(idx)} style={{ ...buttonStyle("danger"), padding: "6px 9px" }}>Sil</button>
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
          value={header?.Aciklamalar ?? ""}
          disabled={locked}
          onChange={(e) => onHeader({ Aciklamalar: e.target.value })}
          placeholder="Test sonuçları müşteri spesifikasyonuna göre değerlendirilmiştir."
          rows={5}
          style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }}
        />
      </section>
    </div>
  );
}

function Field({ label, value, onChange, disabled }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  return (
    <label style={{ display: "grid", gap: 5, fontSize: 12, color: "#6e6e73", fontWeight: 700 }}>
      {label}
      <input value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </label>
  );
}

function Cell({ value, onChange, disabled, wide = false }: { value?: string | null; onChange: (value: string) => void; disabled: boolean; wide?: boolean }) {
  return (
    <td style={{ ...tdStyle, minWidth: wide ? 220 : 120 }}>
      <input value={value || ""} disabled={disabled} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </td>
  );
}

const toolbarBar: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 50,
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 16px",
  background: "rgba(255,255,255,0.92)",
  backdropFilter: "saturate(180%) blur(8px)",
  borderBottom: "1px solid #d2d2d7",
};

const lockBadge: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  background: "#34c75918",
  color: "#248a3d",
  fontWeight: 700,
  fontSize: 12,
};

const panelStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e5ea",
  borderRadius: 10,
  padding: 16,
  marginTop: 14,
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
    marginTop: 12,
    fontSize: 13,
    fontWeight: 600,
  };
}
