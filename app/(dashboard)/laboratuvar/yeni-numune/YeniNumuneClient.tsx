"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import yn from "./yeni-numune.module.css";
import type { HizmetRow, LookupData } from "../numune-form/numuneFormTypes";

// ── Tipler ────────────────────────────────────────────────
interface EvrakForm {
  Tarih: string;
  Evrak_No: string;
  Teklif_No: string;
  Talep_No: string;
  Karar: string;
  Dil: string;
  Firma_ID: number | null;
  FirmaAd: string;
  ProjeID: number | null;
  ProjeAd: string;
  Grup: string;
}

interface NumuneCard {
  cardId: string;
  savedId: number | null;
  RaporNo: string;
  Numune_Adi: string;
  Numune_Adi_En: string;
  Tur: string;
  Barkod: string;
  Miktar: string;
  Birim: string;
  TesteMiktar: string;
  TesteMiktarBirim: string;
  SeriNo: string;
  UretimTarihi: string;
  SKT: string;
  Aciklama: string;
  Urun_Tipi: string;
  UGDTip_ID: number | null;
  Hedef_Grup: string;
  hizmetler: HizmetRow[];
  FotoFile: File | null;
  FotoPreview: string;
  open: boolean;
  saving: boolean;
  saved: boolean;
  error: string;
}

const GRUPLAR = ["Özel", "K.D."];
const BIRIMLER = ["g", "mL", "L", "Adet"];
const KARALAR = ["Basit Karar Kuralı", "Müşteri Lehine", "Müşteri Aleyhine"];
const DILLER = ["Türkçe", "İngilizce", "Hem Türkçe Hem İngilizce"];

function newCardId() { return `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function newHizmetKey() { return `h-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

function emptyCard(partial: Partial<NumuneCard> = {}): NumuneCard {
  return {
    cardId: newCardId(),
    savedId: null,
    RaporNo: "",
    Numune_Adi: "",
    Numune_Adi_En: "",
    Tur: "",
    Barkod: "",
    Miktar: "",
    Birim: "mL",
    TesteMiktar: "",
    TesteMiktarBirim: "Adet",
    SeriNo: "",
    UretimTarihi: "",
    SKT: "",
    Aciklama: "",
    Urun_Tipi: "",
    UGDTip_ID: null,
    Hedef_Grup: "Yetişkinler",
    hizmetler: [],
    FotoFile: null,
    FotoPreview: "",
    open: true,
    saving: false,
    saved: false,
    error: "",
    ...partial,
  };
}

function normalizePartialDate(v: string): string | null {
  if (!v) return null;
  const parts = v.split("-");
  if (parts.length === 1) return `${parts[0]}-01-01`;
  if (parts.length === 2) return `${parts[0]}-${parts[1]}-01`;
  return v;
}

// ── FirmaSearch typeahead ──────────────────────────────────
function FirmaSearch({ label, value, displayValue, onChange, placeholder }: {
  label: string; value: number | null; displayValue: string;
  onChange: (id: number | null, ad: string) => void; placeholder?: string;
}) {
  const [q, setQ] = useState(displayValue);
  const [results, setRes] = useState<{ ID: number; Ad: string }[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQ(displayValue); }, [displayValue]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = useCallback((val: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (val.trim().length < 1) { setRes([]); setOpen(false); return; }
      try {
        const r = await fetch(`/api/numune-form/firmalar?q=${encodeURIComponent(val)}`);
        const data = await r.json();
        setRes(data); setOpen(data.length > 0);
      } catch { setRes([]); }
    }, 200);
  }, []);

  return (
    <div className={yn.fg} ref={wrapRef} style={{ position: "relative" }}>
      <label>{label}</label>
      <div style={{ position: "relative" }}>
        <input
          value={q}
          placeholder={placeholder || "Yazmaya başlayın…"}
          onChange={e => { setQ(e.target.value); search(e.target.value); if (!e.target.value) onChange(null, ""); }}
          onFocus={() => { if (results.length) setOpen(true); }}
          autoComplete="off"
        />
        {value ? (
          <button type="button"
            onClick={() => { onChange(null, ""); setQ(""); setRes([]); }}
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)", fontSize: "0.8rem" }}
          >✕</button>
        ) : null}
      </div>
      {open && results.length > 0 ? (
        <div style={{
          position: "absolute", zIndex: 300, top: "100%", left: 0, right: 0,
          background: "var(--color-surface)", border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)", boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          maxHeight: 200, overflowY: "auto",
        }}>
          {results.map(r => (
            <div key={r.ID}
              style={{ padding: "8px 12px", cursor: "pointer", fontSize: "0.845rem", borderBottom: "1px solid var(--color-border-light)", background: r.ID === value ? "var(--color-accent-light)" : "transparent" }}
              onMouseDown={() => { onChange(r.ID, r.Ad); setQ(r.Ad); setOpen(false); }}
            >{r.Ad}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}


// ── Mini hizmet panel ──────────────────────────────────────
function HizmetPanel({ tarih, rows, onChange }: { tarih: string; rows: HizmetRow[]; onChange: (r: HizmetRow[]) => void }) {
  const [mode, setMode] = useState<"hizmet" | "paket" | null>(null);
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [paketler, setPaketler] = useState<any[]>([]);
  const [paketLoading, setPaketLoading] = useState(false);
  const [paketExpanded, setPaketExpanded] = useState<number | null>(null);
  const [loadingPaketId, setLoadingPaketId] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchHizmet = (val: string) => {
    setQ(val);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/teklifler/lookup?type=hizmetler&q=${encodeURIComponent(val)}`);
        const j = await r.json();
        setOpts(j.data || []);
      } finally { setSearching(false); }
    }, 300);
  };

  const loadPaketler = async () => {
    setPaketLoading(true);
    try {
      const r = await fetch("/api/teklifler/lookup?type=paketler");
      const j = await r.json();
      setPaketler(j.data || []);
    } finally { setPaketLoading(false); }
  };

  const toggleMode = (m: "hizmet" | "paket") => {
    if (mode === m) { setMode(null); return; }
    setMode(m);
    if (m === "paket" && paketler.length === 0) void loadPaketler();
    if (m === "hizmet" && opts.length === 0) searchHizmet("");
  };

  const addFromDate = (tarihStr: string, sure: number) => {
    const base = tarihStr ? new Date(tarihStr + "T12:00:00") : new Date();
    base.setDate(base.getDate() + Math.max(0, sure));
    return base.toISOString().split("T")[0]!;
  };

  const addHizmet = (h: any) => {
    if (rows.some(x => x.AnalizID === h.ID && !x.x3ID)) return;
    onChange([...rows, { key: newHizmetKey(), AnalizID: h.ID, Termin: addFromDate(tarih, h.Sure ?? 0), x3ID: null, Kod: h.Kod, Ad: h.Ad, Metot: h.Metot ?? "", Sure: h.Sure ?? null }]);
    setQ(""); setOpts([]); setMode(null);
  };

  const addPaket = async (x3id: number) => {
    setLoadingPaketId(x3id);
    try {
      const r = await fetch(`/api/numune-form/paket-items?x3id=${x3id}`);
      const raw = r.ok ? await r.json() : [];
      const items: any[] = Array.isArray(raw) ? raw : [];
      const next = [...rows];
      for (const it of items) {
        const aid = Number(it.AnalizID ?? it.analizid);
        if (!aid || !isFinite(aid)) continue;
        if (next.some(x => x.AnalizID === aid && x.x3ID === x3id)) continue;
        const sure = it.Sure != null ? Number(it.Sure) : 0;
        next.push({ key: newHizmetKey(), AnalizID: aid, Termin: addFromDate(tarih, isFinite(sure) ? sure : 0), x3ID: x3id, Kod: String(it.Kod || ""), Ad: String(it.Ad || ""), Metot: String(it.Metot || ""), Sure: isFinite(sure) ? sure : null });
      }
      onChange(next);
    } finally { setLoadingPaketId(null); }
  };

  const remove = (key: string) => onChange(rows.filter(r => r.key !== key));

  const btnBase: React.CSSProperties = { padding: "5px 12px", fontSize: "0.8rem", border: "1px solid var(--color-border)", borderRadius: 8, background: "var(--color-surface)", color: "var(--color-text-primary)", cursor: "pointer", fontWeight: 500 };
  const btnActive: React.CSSProperties = { ...btnBase, background: "var(--color-accent)", color: "#fff", border: "1px solid var(--color-accent)" };
  const smallAdd: React.CSSProperties = { padding: "3px 10px", fontSize: "0.75rem", border: "1px solid var(--color-accent)", borderRadius: 6, background: "transparent", color: "var(--color-accent)", cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap" as const };

  return (
    <div className={yn.hizmetSection}>
      <div className={yn.hizmetSectionTitle}>Hizmetler</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button type="button" style={mode === "hizmet" ? btnActive : btnBase} onClick={() => toggleMode("hizmet")}>+ Hizmet Ekle</button>
        <button type="button" style={mode === "paket" ? btnActive : btnBase} onClick={() => toggleMode("paket")}>≡ Paketten Ekle</button>
      </div>

      {mode === "hizmet" && (
        <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8, padding: 10, marginBottom: 10, position: "relative" }}>
          <input value={q} onChange={e => searchHizmet(e.target.value)} placeholder="Hizmet adı veya kodu…" autoFocus
            style={{ width: "100%", padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", fontSize: "0.8125rem", background: "var(--color-surface)", color: "var(--color-text-primary)", boxSizing: "border-box" as const, marginBottom: 6 }} />
          {searching ? <p style={{ fontSize: "0.78rem", color: "var(--color-text-tertiary)" }}>Yükleniyor…</p> : opts.length === 0 ? <p style={{ fontSize: "0.78rem", color: "var(--color-text-tertiary)" }}>Sonuç bulunamadı.</p> : (
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                    {["Kod", "Hizmet Adı", "Metot", "Süre", ""].map((h, i) => (
                      <th key={i} style={{ textAlign: "left", padding: "3px 8px", fontWeight: 600, fontSize: "0.7rem", color: "var(--color-text-secondary)", textTransform: "uppercase" as const }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {opts.map((h: any) => (
                    <tr key={h.ID} style={{ borderBottom: "1px solid var(--color-border-light)" }}>
                      <td style={{ padding: "5px 8px", color: "var(--color-text-tertiary)", whiteSpace: "nowrap" as const }}>{h.Kod}</td>
                      <td style={{ padding: "5px 8px", fontWeight: 500 }}>{h.Ad}</td>
                      <td style={{ padding: "5px 8px", color: "var(--color-text-secondary)", fontSize: "0.77rem" }}>{h.Metot || "—"}</td>
                      <td style={{ padding: "5px 8px", textAlign: "center", whiteSpace: "nowrap" as const }}>{h.Sure ?? "—"}</td>
                      <td style={{ padding: "5px 6px" }}><button type="button" style={smallAdd} onMouseDown={() => addHizmet(h)}>Ekle</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {mode === "paket" && (
        <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8, padding: 10, marginBottom: 10 }}>
          {paketLoading ? <p style={{ fontSize: "0.78rem", color: "var(--color-text-tertiary)" }}>Yükleniyor…</p>
            : paketler.length === 0 ? <p style={{ fontSize: "0.78rem", color: "var(--color-text-tertiary)" }}>Aktif paket bulunamadı.</p>
            : (
              <div style={{ maxHeight: 260, overflowY: "auto" }}>
                {paketler.map((p: any) => (
                  <div key={p.ID} style={{ borderBottom: "1px solid var(--color-border-light)", marginBottom: 2 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 4px", cursor: "pointer" }}
                      onClick={() => setPaketExpanded(prev => prev === p.ID ? null : p.ID)}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: "0.8rem" }}>{p.ListeAdi}</span>
                        <span style={{ color: "var(--color-text-tertiary)", fontSize: "0.75rem", marginLeft: 8 }}>{(p.items || []).length} hizmet</span>
                        {p.Aciklama ? <span style={{ color: "var(--color-text-secondary)", fontSize: "0.75rem", marginLeft: 8 }}>— {p.Aciklama}</span> : null}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button type="button" style={smallAdd} disabled={loadingPaketId === p.ID}
                          onMouseDown={e => { e.stopPropagation(); void addPaket(p.ID); }}>
                          {loadingPaketId === p.ID ? "…" : "Tümünü Ekle"}
                        </button>
                        <span style={{ color: "var(--color-text-tertiary)", fontSize: "0.75rem" }}>{paketExpanded === p.ID ? "▲" : "▼"}</span>
                      </div>
                    </div>
                    {paketExpanded === p.ID && (p.items || []).length > 0 && (
                      <div style={{ paddingLeft: 14, paddingBottom: 6 }}>
                        {(p.items as any[]).map((item: any, idx: number) => (
                          <div key={idx} style={{ fontSize: "0.77rem", padding: "2px 0", color: "var(--color-text-secondary)" }}>
                            • {item.HizmetAdi}{item.Kod ? <span style={{ color: "var(--color-text-tertiary)" }}> ({item.Kod})</span> : null}
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

      {rows.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-light)" }}>
              {["Kod", "Hizmet", "Termin", ""].map((h, i) => (
                <th key={i} style={{ textAlign: "left", padding: "4px 8px", fontWeight: 600, color: "var(--color-text-secondary)", fontSize: "0.7rem", textTransform: "uppercase" as const }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key} style={{ borderBottom: "1px solid var(--color-border-light)" }}>
                <td style={{ padding: "5px 8px", color: "var(--color-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{r.Kod}</td>
                <td style={{ padding: "5px 8px" }}>{r.Ad}</td>
                <td style={{ padding: "5px 8px" }}>
                  <input type="date" value={r.Termin?.slice(0, 10) || ""} onChange={e => onChange(rows.map(x => x.key === r.key ? { ...x, Termin: e.target.value } : x))}
                    style={{ width: "100%", padding: "3px 6px", border: "1px solid var(--color-border)", borderRadius: 4, fontSize: "0.8rem", background: "var(--color-surface)" }} />
                </td>
                <td style={{ padding: "5px 4px" }}>
                  <button type="button" onClick={() => remove(r.key)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)", fontSize: "0.9rem", padding: 2 }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Kamera ────────────────────────────────────────────────
function CameraCapture({ onCapture, onClose }: {
  onCapture: (file: File, preview: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camError, setCamError] = useState("");
  const [snapping, setSnapping] = useState(false);

  useEffect(() => {
    let active = true;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then(stream => {
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch(err => { if (active) setCamError(err.message || "Kameraya erişilemedi."); });
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, []);

  const snap = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    setSnapping(true);
    canvas.toBlob(blob => {
      setSnapping(false);
      if (!blob) return;
      const file = new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" });
      onCapture(file, URL.createObjectURL(blob));
    }, "image/jpeg", 0.92);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "var(--color-surface)", borderRadius: 14, padding: 16, width: "100%", maxWidth: 480, boxShadow: "0 12px 48px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontWeight: 650, fontSize: "0.9rem", color: "var(--color-text-primary)" }}>Kameradan Fotoğraf Çek</span>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.1rem", color: "var(--color-text-tertiary)", padding: "2px 6px", lineHeight: 1 }}>✕</button>
        </div>
        {camError ? (
          <div style={{ padding: "16px 0", color: "var(--color-danger, #ff3b30)", fontSize: "0.85rem" }}>{camError}</div>
        ) : (
          <video ref={videoRef} playsInline muted style={{ width: "100%", borderRadius: 8, background: "#111", maxHeight: 340, objectFit: "cover", display: "block" }} />
        )}
        <canvas ref={canvasRef} style={{ display: "none" }} />
        <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose}
            style={{ padding: "7px 16px", border: "1px solid var(--color-border)", borderRadius: 8, background: "var(--color-surface)", color: "var(--color-text-primary)", cursor: "pointer", fontSize: "0.85rem" }}>
            İptal
          </button>
          <button type="button" onClick={snap} disabled={!!camError || snapping}
            style={{ padding: "7px 16px", border: "none", borderRadius: 8, background: "var(--color-accent)", color: "#fff", cursor: camError ? "not-allowed" : "pointer", fontSize: "0.85rem", fontWeight: 600, opacity: (camError || snapping) ? 0.6 : 1 }}>
            {snapping ? "…" : "Fotoğraf Çek"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Ana bileşen ────────────────────────────────────────────
export default function YeniNumuneClient() {
  const today = new Date().toISOString().split("T")[0]!;

  const [evrak, setEvrak] = useState<EvrakForm>({
    Tarih: today, Evrak_No: "", Teklif_No: "", Talep_No: "",
    Karar: "Basit Karar Kuralı", Dil: "Türkçe",
    Firma_ID: null, FirmaAd: "", ProjeID: null, ProjeAd: "", Grup: "Özel",
  });
  const [evrakOpen, setEvrakOpen] = useState(true);
  const [evrakSaved, setEvrakSaved] = useState(false);
  const [loadingNos, setLoadingNos] = useState(false);

  const [numuneler, setNumuneler] = useState<NumuneCard[]>([]);
  const [lookup, setLookup] = useState<LookupData>({ grupTurleri: [], rUGDTipler: [], paketler: [] });
  const [cameraCardId, setCameraCardId] = useState<string | null>(null);

  // Load lookup data
  useEffect(() => {
    fetch("/api/numune-form/lookup").then(r => r.json()).then((d: LookupData) => { if (d.grupTurleri) setLookup(d); }).catch(() => {});
  }, []);

  // Auto-fill Evrak_No when Grup changes (if not yet filled)
  useEffect(() => {
    if (!evrak.Grup || evrak.Evrak_No) return;
    let cancelled = false;
    (async () => {
      setLoadingNos(true);
      try {
        const r = await fetch(`/api/numune-form/next-no?grup=${encodeURIComponent(evrak.Grup)}`);
        const j = await r.json();
        if (!cancelled && r.ok) setEvrak(e => ({ ...e, Evrak_No: j.evrakNo }));
      } finally { if (!cancelled) setLoadingNos(false); }
    })();
    return () => { cancelled = true; };
  }, [evrak.Grup]);

  const patchEvrak = (u: Partial<EvrakForm>) => setEvrak(e => ({ ...e, ...u }));

  // Fetch next Rapor No for a new card
  const fetchNextRaporNo = async (): Promise<string> => {
    try {
      const r = await fetch(`/api/numune-form/next-no?grup=${encodeURIComponent(evrak.Grup || "Özel")}`);
      const j = await r.json();
      return r.ok ? j.raporNo : "";
    } catch { return ""; }
  };

  const addNumune = async () => {
    const raporNo = await fetchNextRaporNo();
    const card = emptyCard({ RaporNo: raporNo, Tur: "" });
    setNumuneler(prev => [...prev, card]);
  };

  const patchCard = (cardId: string, update: Partial<NumuneCard>) => {
    setNumuneler(prev => prev.map(c => c.cardId === cardId ? { ...c, ...update } : c));
  };

  const removeCard = (cardId: string) => {
    setNumuneler(prev => prev.filter(c => c.cardId !== cardId));
  };

  const saveCard = async (card: NumuneCard) => {
    if (!card.Numune_Adi.trim()) { patchCard(card.cardId, { error: "Numune Adı zorunludur." }); return; }
    if (!card.RaporNo.trim()) { patchCard(card.cardId, { error: "Rapor No zorunludur." }); return; }
    if (!evrak.Evrak_No.trim()) { patchCard(card.cardId, { error: "Önce Evrak No girin." }); return; }

    patchCard(card.cardId, { saving: true, error: "" });

    const body = {
      nkr: {
        Tarih: evrak.Tarih || null,
        Barkod: card.Barkod || null,
        Teklif_No: evrak.Teklif_No || null,
        Talep_No: evrak.Talep_No || null,
        Evrak_No: evrak.Evrak_No.trim(),
        RaporNo: card.RaporNo.trim(),
        Revno: "0",
        Grup: evrak.Grup || null,
        Tur: card.Tur || null,
        Karar: evrak.Karar || null,
        Dil: evrak.Dil || null,
        Firma_ID: evrak.Firma_ID,
        Numune_Adi: card.Numune_Adi.trim(),
        Numune_Adi_En: card.Numune_Adi_En || null,
        Urun_Tipi: card.Urun_Tipi || null,
        UGDTip_ID: card.UGDTip_ID,
        Hedef_Grup: card.Hedef_Grup || null,
        TesteMiktar: card.TesteMiktar || null,
        TesteMiktarBirim: card.TesteMiktarBirim || null,
        Aciklama: card.Aciklama || null,
      },
      detay: {
        ProjeID: evrak.ProjeID,
        Miktar: card.Miktar || null,
        Birim: card.Birim || null,
        SeriNo: card.SeriNo || null,
        UretimTarihi: normalizePartialDate(card.UretimTarihi),
        SKT: normalizePartialDate(card.SKT),
      },
      hizmetler: card.hizmetler.map(h => ({ AnalizID: h.AnalizID, Termin: h.Termin || null, x3ID: h.x3ID })),
      formul: [],
    };

    const url = card.savedId ? `/api/numune-form/${card.savedId}` : "/api/numune-form";
    const method = card.savedId ? "PUT" : "POST";

    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Kaydedilemedi");
      const newSavedId = card.savedId ?? (data.id as number);
      patchCard(card.cardId, { saving: false, saved: true, savedId: newSavedId, open: false });
      setEvrakSaved(true);
    } catch (e: any) {
      patchCard(card.cardId, { saving: false, error: e.message || "Hata" });
    }
  };

  const turler = evrak.Grup
    ? lookup.grupTurleri.filter(g => g.Grup === evrak.Grup).map(g => g.Tur)
    : [];

  const sel: React.CSSProperties = { width: "100%" };

  return (
    <div className={yn.page}>
      {/* Toolbar */}
      <div className={yn.toolbar}>
        <div>
          <div className={yn.title}>Yeni Numune Girişi <span style={{ fontSize: "0.7rem", verticalAlign: "middle", padding: "2px 8px", background: "#0071e320", color: "#0071e3", borderRadius: 8, marginLeft: 6 }}>Önizleme</span></div>
          <div className={yn.subtitle}>Tek evrak için birden fazla numune ekleyebilirsiniz.</div>
        </div>
        <Link href="/laboratuvar/numune-takip" className={yn.backLink}>← Listeye dön</Link>
      </div>

      {/* ── Evrak Bilgileri ── */}
      <div className={yn.evrakCard}>
        <div
          className={`${yn.evrakCardHead} ${evrakOpen ? yn.open : ""}`}
          onClick={() => setEvrakOpen(o => !o)}
        >
          <div className={yn.evrakCardTitle}>
            <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" style={{ color: "var(--color-text-tertiary)", transform: evrakOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
            </svg>
            Evrak Bilgileri
          </div>
          {!evrakOpen && evrakSaved && (
            <div className={yn.evrakSummary}>
              {evrak.FirmaAd && <span className={yn.evrakSummaryItem}><span className={yn.evrakSummaryLabel}>Firma:</span> <strong>{evrak.FirmaAd}</strong></span>}
              {evrak.Evrak_No && <span className={yn.evrakSummaryItem}><span className={yn.evrakSummaryLabel}>Evrak:</span> <strong>{evrak.Evrak_No}</strong></span>}
              {evrak.Grup && <span className={yn.evrakSummaryItem}><span className={yn.evrakSummaryLabel}>Grup:</span> <strong>{evrak.Grup}</strong></span>}
            </div>
          )}
        </div>

        {evrakOpen && (
          <div className={yn.evrakBody}>
            <div className={yn.evrakGrid}>
              <div className={yn.fg}>
                <label>Tarih</label>
                <input type="date" style={sel} value={evrak.Tarih} onChange={e => patchEvrak({ Tarih: e.target.value })} />
              </div>
              <div className={yn.fg}>
                <label>Ürün grubu</label>
                <select style={sel} value={evrak.Grup} onChange={e => patchEvrak({ Grup: e.target.value })}>
                  {GRUPLAR.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className={yn.fg}>
                <label>Evrak No {loadingNos && <span style={{ fontWeight: 400, color: "var(--color-text-tertiary)", fontSize: "0.7rem" }}>…</span>}</label>
                <input style={sel} value={evrak.Evrak_No} onChange={e => patchEvrak({ Evrak_No: e.target.value })} />
              </div>
              <div className={yn.fg}>
                <label>Teklif No</label>
                <input style={sel} value={evrak.Teklif_No} onChange={e => patchEvrak({ Teklif_No: e.target.value })} />
              </div>
              <div className={yn.fg}>
                <label>Talep No</label>
                <input style={sel} value={evrak.Talep_No} onChange={e => patchEvrak({ Talep_No: e.target.value })} />
              </div>
            </div>
            <div className={yn.evrakGrid2}>
              <FirmaSearch label="Firma" value={evrak.Firma_ID} displayValue={evrak.FirmaAd} onChange={(id, ad) => patchEvrak({ Firma_ID: id, FirmaAd: ad })} placeholder="Firma adı…" />
              <FirmaSearch label="Proje" value={evrak.ProjeID} displayValue={evrak.ProjeAd} onChange={(id, ad) => patchEvrak({ ProjeID: id, ProjeAd: ad })} placeholder="Proje adı…" />
              <div className={yn.fg}>
                <label>Karar kuralı</label>
                <select style={sel} value={evrak.Karar} onChange={e => patchEvrak({ Karar: e.target.value })}>
                  {KARALAR.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div className={yn.fg}>
                <label>Raporlama dili</label>
                <select style={sel} value={evrak.Dil} onChange={e => patchEvrak({ Dil: e.target.value })}>
                  {DILLER.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                style={{ padding: "6px 16px", background: "var(--color-surface-2)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", fontSize: "0.8125rem", cursor: "pointer", fontWeight: 500 }}
                onClick={() => { setEvrakOpen(false); setEvrakSaved(true); }}
              >
                Tamam, numune ekle →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Numune listesi ── */}
      <div className={yn.numuneListHeader}>
        <div className={yn.numuneListTitle}>
          Numuneler
          {numuneler.length > 0 && (
            <span style={{ marginLeft: 8, padding: "2px 9px", background: "var(--color-accent-light)", color: "var(--color-accent)", borderRadius: 10, fontSize: "0.72rem", fontWeight: 600 }}>
              {numuneler.length}
            </span>
          )}
        </div>
        <button type="button" className={yn.addBtn} onClick={() => void addNumune()}>
          <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          Numune Ekle
        </button>
      </div>

      {numuneler.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", background: "var(--color-surface)", border: "2px dashed var(--color-border-light)", borderRadius: "var(--radius-md)", color: "var(--color-text-tertiary)", fontSize: "0.845rem" }}>
          Henüz numune eklenmedi. Yukarıdaki "+ Numune Ekle" butonunu kullanın.
        </div>
      )}

      {cameraCardId && (
        <CameraCapture
          onCapture={(file, preview) => {
            patchCard(cameraCardId, { FotoFile: file, FotoPreview: preview });
            setCameraCardId(null);
          }}
          onClose={() => setCameraCardId(null)}
        />
      )}

      {numuneler.map((card) => {
        const cardTurler = evrak.Grup ? lookup.grupTurleri.filter(g => g.Grup === evrak.Grup).map(g => g.Tur) : [];
        return (
          <div key={card.cardId} className={yn.numuneCard}>
            {/* Kart başlığı */}
            <div
              className={`${yn.numuneCardHead} ${card.open ? yn.open : ""}`}
              onClick={() => patchCard(card.cardId, { open: !card.open })}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12" style={{ color: "var(--color-text-tertiary)", flexShrink: 0, transform: card.open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
              </svg>
              {card.RaporNo
                ? <span className={yn.numuneRaporNo}>{card.RaporNo}</span>
                : <span className={yn.numuneRaporNoEmpty}>Rapor No…</span>
              }
              <span className={yn.numuneAd}>{card.Numune_Adi || <span style={{ color: "var(--color-text-tertiary)", fontStyle: "italic" }}>Numune adı girilmedi</span>}</span>
              {[evrak.Grup, card.Tur].filter(Boolean).length > 0 && (
                <span className={yn.numuneGrupTur}>{[evrak.Grup, card.Tur].filter(Boolean).join(" / ")}</span>
              )}
              {card.hizmetler.length > 0 && (
                <span className={yn.numuneBadge}>{card.hizmetler.length} hizmet</span>
              )}
              {card.saved && !card.open && (
                <span className={yn.savedBadge}>✓ Kaydedildi</span>
              )}
            </div>

            {/* Kart gövdesi */}
            {card.open && (
              <div className={yn.numuneCardBody}>
                {card.error && <div className={yn.cardErr}>{card.error}</div>}

                {/* İlk satır: Rapor No + Numune Adı TR + Numune Adı EN + Tür */}
                <div className={yn.numuneInfoGrid}>
                  <div className={yn.fg}>
                    <label>Numune Adı (TR) *</label>
                    <input style={sel} value={card.Numune_Adi} onChange={e => patchCard(card.cardId, { Numune_Adi: e.target.value })} placeholder="Türkçe ad…" />
                  </div>
                  <div className={yn.fg}>
                    <label>Numune Adı (EN)</label>
                    <input style={sel} value={card.Numune_Adi_En} onChange={e => patchCard(card.cardId, { Numune_Adi_En: e.target.value })} placeholder="English name…" />
                  </div>
                  <div className={yn.fg}>
                    <label>Rapor No *</label>
                    <input style={sel} value={card.RaporNo} onChange={e => patchCard(card.cardId, { RaporNo: e.target.value })} />
                  </div>
                  <div className={yn.fg}>
                    <label>Ürün türü</label>
                    <select style={sel} value={card.Tur} onChange={e => patchCard(card.cardId, { Tur: e.target.value })} disabled={cardTurler.length === 0}>
                      <option value="">Seçin</option>
                      {cardTurler.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                {/* İkinci satır: Barkod + Nominal + Teste + Seri + ÜretimTarihi + SKT */}
                <div className={yn.numuneInfoGrid2}>
                  <div className={yn.fg}>
                    <label>Barkod</label>
                    <input style={sel} value={card.Barkod} onChange={e => patchCard(card.cardId, { Barkod: e.target.value })} />
                  </div>
                  <div className={yn.fg}>
                    <label>Nominal miktar</label>
                    <div style={{ display: "flex", gap: 4 }}>
                      <input type="number" min={0} placeholder="0" value={card.Miktar} onChange={e => patchCard(card.cardId, { Miktar: e.target.value })} style={{ flex: 1, padding: "7px 8px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", fontSize: "0.8375rem", background: "var(--color-surface)", minWidth: 0 }} />
                      <select value={card.Birim} onChange={e => patchCard(card.cardId, { Birim: e.target.value })} style={{ width: 62, padding: "7px 4px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", fontSize: "0.8125rem", background: "var(--color-surface)" }}>
                        <option value="">—</option>
                        {BIRIMLER.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className={yn.fg}>
                    <label>Teste gelen miktar</label>
                    <div style={{ display: "flex", gap: 4 }}>
                      <input type="number" min={0} placeholder="0" value={card.TesteMiktar} onChange={e => patchCard(card.cardId, { TesteMiktar: e.target.value })} style={{ flex: 1, padding: "7px 8px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", fontSize: "0.8375rem", background: "var(--color-surface)", minWidth: 0 }} />
                      <select value={card.TesteMiktarBirim} onChange={e => patchCard(card.cardId, { TesteMiktarBirim: e.target.value })} style={{ width: 62, padding: "7px 4px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", fontSize: "0.8125rem", background: "var(--color-surface)" }}>
                        <option value="">—</option>
                        {BIRIMLER.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className={yn.fg}>
                    <label>Seri / Lot</label>
                    <input style={sel} value={card.SeriNo} onChange={e => patchCard(card.cardId, { SeriNo: e.target.value })} />
                  </div>
                  <div className={yn.fg}>
                    <label>Üretim tarihi</label>
                    <input style={sel} value={card.UretimTarihi} onChange={e => patchCard(card.cardId, { UretimTarihi: e.target.value })} placeholder="2024-06" />
                  </div>
                  <div className={yn.fg}>
                    <label>SKT</label>
                    <input style={sel} value={card.SKT} onChange={e => patchCard(card.cardId, { SKT: e.target.value })} placeholder="2025-12" />
                  </div>
                </div>

                {/* Ürün fotoğrafı */}
                <div style={{ borderTop: "1px solid var(--color-border-light)", paddingTop: 12 }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 650, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-secondary)", marginBottom: 8 }}>Ürün Fotoğrafı</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <input
                      type="file"
                      accept="image/*"
                      id={`foto-${card.cardId}`}
                      style={{ display: "none" }}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        patchCard(card.cardId, { FotoFile: file, FotoPreview: URL.createObjectURL(file) });
                        e.target.value = "";
                      }}
                    />
                    <button type="button"
                      style={{ padding: "5px 12px", fontSize: "0.8rem", border: "1px solid var(--color-border)", borderRadius: 8, background: "var(--color-surface)", color: "var(--color-text-primary)", cursor: "pointer" }}
                      onClick={() => document.getElementById(`foto-${card.cardId}`)?.click()}
                    >
                      Dosyadan seç
                    </button>
                    <button type="button"
                      style={{ padding: "5px 12px", fontSize: "0.8rem", border: "1px solid var(--color-border)", borderRadius: 8, background: "var(--color-surface)", color: "var(--color-text-primary)", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
                      onClick={() => setCameraCardId(card.cardId)}
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                        <path fillRule="evenodd" d="M1 8a2 2 0 0 1 2-2h.93a2 2 0 0 0 1.664-.89l.812-1.22A2 2 0 0 1 8.07 3h3.86a2 2 0 0 1 1.664.89l.812 1.22A2 2 0 0 0 16.07 6H17a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8Zm13.5 3a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM10 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
                      </svg>
                      Kameradan çek
                    </button>
                    {card.FotoPreview && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "var(--color-surface-2)", border: "1px solid var(--color-border-light)", borderRadius: 8 }}>
                        <img src={card.FotoPreview} alt="Önizleme" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 6 }} />
                        <button type="button"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-danger, #ff3b30)", fontSize: "0.8rem" }}
                          onClick={() => patchCard(card.cardId, { FotoFile: null, FotoPreview: "" })}
                        >Kaldır</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Hizmetler */}
                <HizmetPanel
                  tarih={evrak.Tarih}
                  rows={card.hizmetler}
                  onChange={rows => patchCard(card.cardId, { hizmetler: rows })}
                />

                {/* Footer */}
                <div className={yn.numuneCardFooter}>
                  <button type="button" className={yn.deleteCardBtn} onClick={() => removeCard(card.cardId)} disabled={card.saving}>
                    Kartı Kaldır
                  </button>
                  <button type="button" className={yn.saveCardBtn} onClick={() => void saveCard(card)} disabled={card.saving}>
                    {card.saving ? "Kaydediliyor…" : card.savedId ? "Güncelle" : "Kaydet"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
