"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type Firma = { ID: number; Ad: string };
type Secim = { id: number; ad: string } | null;

const TUR_SECENEKLERI = ["Rapor", "Sertifika", "Claim", "ÜGDR", "Diğer"] as const;
const DIGER: Secim = { id: 5487, ad: "DİĞER" };

// ── Aranabilir firma seçici ───────────────────────────────────────────────────
function FirmaSelect({
  value,
  onChange,
  placeholder,
}: {
  value: Secim;
  onChange: (s: Secim) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Firma[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/firmalar?search=${encodeURIComponent(q)}&limit=25`, { cache: "no-store" });
        const j = await r.json();
        setRows(Array.isArray(j.data) ? j.data : []);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, open]);

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", textAlign: "left", padding: "9px 12px",
          border: "1px solid var(--color-border)", borderRadius: 8,
          background: "var(--color-surface)", cursor: "pointer",
          fontSize: "0.9rem", color: value ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
        }}
      >
        {value ? value.ad : placeholder}
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50,
          background: "var(--color-surface)", border: "1px solid var(--color-border)",
          borderRadius: 8, boxShadow: "0 10px 30px rgba(0,0,0,0.15)", overflow: "hidden",
        }}>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Firma ara…"
            style={{
              width: "100%", padding: "9px 12px", border: "none",
              borderBottom: "1px solid var(--color-border-light)",
              background: "var(--color-surface)", fontSize: "0.88rem", outline: "none",
            }}
          />
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: "10px 12px", color: "var(--color-text-tertiary)", fontSize: "0.85rem" }}>Aranıyor…</div>
            ) : rows.length === 0 ? (
              <div style={{ padding: "10px 12px", color: "var(--color-text-tertiary)", fontSize: "0.85rem" }}>Sonuç yok</div>
            ) : (
              rows.map((f) => (
                <button
                  key={f.ID}
                  type="button"
                  onClick={() => { onChange({ id: f.ID, ad: f.Ad }); setOpen(false); setQ(""); }}
                  style={{
                    display: "block", width: "100%", textAlign: "left", padding: "8px 12px",
                    border: "none", background: "transparent", cursor: "pointer", fontSize: "0.85rem",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {f.Ad}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────
type Row = { file: File; raporNo: string; tur: string; numuneAdi: string; onayToken: string };

export default function BelgeYukleClient() {
  const [firma, setFirma] = useState<Secim>(null);
  const [proje, setProje] = useState<Secim>(DIGER);
  const [rows, setRows] = useState<Row[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const yeni: Row[] = [];
    for (const f of Array.from(fileList)) {
      if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) continue;
      yeni.push({ file: f, raporNo: "", tur: "Rapor", numuneAdi: f.name.replace(/\.pdf$/i, ""), onayToken: "" });
    }
    if (yeni.length) setRows((r) => [...r, ...yeni]);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));
  const patchRow = (i: number, p: Partial<Row>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...p } : row)));

  const submit = async () => {
    setMsg(null);
    if (!firma) { setMsg({ ok: false, text: "Firma seçin." }); return; }
    if (!rows.length) { setMsg({ ok: false, text: "En az bir PDF ekleyin." }); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      rows.forEach((r) => fd.append("files", r.file, r.file.name));
      fd.append("meta", JSON.stringify({
        firmaId: firma.id,
        firmaAd: firma.ad,
        projeId: (proje ?? DIGER)!.id,
        projeAd: (proje ?? DIGER)!.ad,
        items: rows.map((r) => ({ raporNo: r.raporNo, tur: r.tur, numuneAdi: r.numuneAdi, onayToken: r.onayToken.trim() })),
      }));
      const res = await fetch("/api/musteriler/belge-yukle", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Yükleme başarısız");
      setMsg({ ok: true, text: `${j.count} belge yüklendi ve müşteri portalına eklendi.` });
      setRows([]);
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || "Yükleme başarısız" });
    } finally {
      setBusy(false);
    }
  };

  const lbl = { display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: 6, color: "var(--color-text-secondary)" } as const;
  const inp = { width: "100%", padding: "7px 9px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-surface)", fontSize: "0.85rem", fontFamily: "inherit" } as const;

  return (
    <div style={{ maxWidth: 1100, display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Firma + Proje */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <label style={lbl}>Firma <span style={{ color: "#c00" }}>*</span></label>
          <FirmaSelect value={firma} onChange={setFirma} placeholder="Firma seçin…" />
        </div>
        <div>
          <label style={lbl}>Proje (görebilecek proje firması)</label>
          <FirmaSelect value={proje} onChange={(s) => setProje(s ?? DIGER)} placeholder="DİĞER" />
          <div style={{ fontSize: "0.72rem", color: "var(--color-text-tertiary)", marginTop: 4 }}>
            Varsayılan &quot;DİĞER&quot;. Belgeleri görmesi istenen bir proje firması varsa seçin.
          </div>
        </div>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? "var(--color-accent)" : "var(--color-border)"}`,
          borderRadius: 12, padding: "28px 20px", textAlign: "center", cursor: "pointer",
          background: dragOver ? "var(--color-surface-2)" : "transparent", transition: "all 0.15s",
        }}
      >
        <input
          ref={inputRef} type="file" accept="application/pdf,.pdf" multiple
          style={{ display: "none" }}
          onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
        />
        <div style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: 4 }}>
          Belgeleri buraya sürükleyin veya tıklayarak seçin
        </div>
        <div style={{ fontSize: "0.8rem", color: "var(--color-text-tertiary)" }}>Yalnızca PDF · birden fazla dosya seçilebilir</div>
      </div>

      {/* Dosya listesi */}
      {rows.length > 0 && (
        <div style={{ border: "1px solid var(--color-border)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 110px 110px 1fr 170px 40px", gap: 10,
            padding: "10px 14px", background: "var(--color-surface)", borderBottom: "1px solid var(--color-border-light)",
            fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
            color: "var(--color-text-tertiary)",
          }}>
            <div>Dosya</div><div>Rapor No</div><div>Tür</div><div>Numune Adı</div><div>Onay Token <span style={{ textTransform: "none", fontWeight: 400 }}>(override)</span></div><div></div>
          </div>
          {rows.map((r, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "1fr 110px 110px 1fr 170px 40px", gap: 10,
              padding: "10px 14px", alignItems: "center", borderBottom: "1px solid var(--color-border-light)",
            }}>
              <div style={{ fontSize: "0.82rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.file.name}>
                📄 {r.file.name}
              </div>
              <input style={inp} placeholder="ör. 26264" value={r.raporNo} onChange={(e) => patchRow(i, { raporNo: e.target.value })} />
              <select style={inp} value={r.tur} onChange={(e) => patchRow(i, { tur: e.target.value })}>
                {TUR_SECENEKLERI.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input style={inp} placeholder="Numune adı" value={r.numuneAdi} onChange={(e) => patchRow(i, { numuneAdi: e.target.value })} />
              <input style={inp} placeholder="QR kodu ya da token" value={r.onayToken} onChange={(e) => patchRow(i, { onayToken: e.target.value })} title="Doldurulursa: bu PDF, o onaylı raporun müşteri (yayın) versiyonunu değiştirir. QR altındaki 8 karakterlik kodu ya da tam token'ı girebilirsin." />
              <button
                type="button" onClick={() => removeRow(i)} title="Kaldır"
                style={{ border: "none", background: "transparent", cursor: "pointer", color: "#c00", fontSize: "1.1rem", lineHeight: 1 }}
              >×</button>
            </div>
          ))}
        </div>
      )}

      {msg && (
        <div style={{
          padding: "10px 14px", borderRadius: 8, fontSize: "0.85rem",
          background: msg.ok ? "#34c75915" : "#ff3b3010", color: msg.ok ? "#1c6b2e" : "#c00",
          border: `1px solid ${msg.ok ? "#34c75940" : "#ff3b3030"}`,
        }}>{msg.text}</div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button" onClick={submit} disabled={busy || !firma || rows.length === 0}
          style={{
            padding: "10px 22px", borderRadius: 8, border: "none",
            background: busy || !firma || rows.length === 0 ? "var(--color-surface-2)" : "var(--color-accent)",
            color: busy || !firma || rows.length === 0 ? "var(--color-text-tertiary)" : "#fff",
            fontSize: "0.9rem", fontWeight: 700,
            cursor: busy || !firma || rows.length === 0 ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Yükleniyor…" : `${rows.length || ""} Belge Yükle`}
        </button>
      </div>
    </div>
  );
}
