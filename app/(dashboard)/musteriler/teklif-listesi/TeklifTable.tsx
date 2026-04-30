"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import styles from "@/app/styles/table.module.css";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Teklif {
  ID: number;
  TeklifNo: number | null;
  RevNo: number;
  Tarih: string;
  MusteriID: number;
  MusteriAd: string;
  HizmetSayisi: number;
  Toplam: number | null;
  Notlar: string | null;
  Durum: string;
  TeklifDurum: string;
}

interface Satir {
  _key: string;
  hizmetId: number | null;
  hizmetAdi: string;
  hizmetKod: string;
  adet: string;
  fiyat: string;
  paraBirimi: string;
  iskonto: string;
  metot: string;
  akreditasyon: string;
  notlar: string;
}

interface MusteriOpt { ID: number; Ad: string; Email?: string; }
interface HizmetOpt  { ID: number; Kod: string; Ad: string; Fiyat: number | null; ParaBirimi: string | null; Metot?: string; Akreditasyon?: string; }
interface PaketItem  { HizmetID: number; HizmetAdi: string; Kod: string; Fiyat: number | null; ParaBirimi: string | null; Metot?: string; Akreditasyon?: string; }
interface PaketOpt   { ID: number; ListeAdi: string; Aciklama: string; items: PaketItem[]; }

// ─── Constants ────────────────────────────────────────────────────────────────

const PB_OPTIONS = ["TRY", "USD", "EUR"];

const DURUM_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  Taslak:      { label: "Taslak",      color: "#6e6e73", bg: "#f5f5f7" },
  Gönderildi:  { label: "Gönderildi",  color: "#0071e3", bg: "#e8f0fe" },
  Onaylandı:   { label: "Onaylandı",   color: "#1a7f4b", bg: "#e6f6ee" },
  Reddedildi:  { label: "Reddedildi",  color: "#c0392b", bg: "#fdecea" },
};
const DURUM_KEYS = Object.keys(DURUM_LABELS);

let _kc = 0;
function nextKey() { return `s-${++_kc}`; }

function makeSatir(h: HizmetOpt | PaketItem): Satir {
  return {
    _key:         nextKey(),
    hizmetId:     "ID" in h ? h.ID : h.HizmetID,
    hizmetAdi:    "Ad" in h ? h.Ad : h.HizmetAdi,
    hizmetKod:    h.Kod || "",
    adet:         "1",
    fiyat:        h.Fiyat != null ? String(h.Fiyat) : "",
    paraBirimi:   h.ParaBirimi || "TRY",
    iskonto:      "0",
    metot:        h.Metot || "",
    akreditasyon: h.Akreditasyon || "",
    notlar:       "",
  };
}

function netTutar(s: Satir) {
  const adet = parseInt(s.adet) || 1;
  return adet * (parseFloat(s.fiyat) || 0) * (1 - (parseFloat(s.iskonto) || 0) / 100);
}

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function teklifLabel(no: number | null, rev: number) {
  if (!no) return "—";
  const yy  = String(no).slice(0, 2);
  const seq = String(no).slice(2).padStart(4, "0");
  return rev > 0 ? `ROT${yy}${seq}/${rev}` : `ROT${yy}${seq}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TeklifTable({ userName = "" }: { userName?: string }) {

  // ── list ──
  const [data,       setData]       = useState<Teklif[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [page,       setPage]       = useState(1);
  const [limit,      setLimit]      = useState(20);
  const [total,      setTotal]      = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [search,     setSearch]     = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── add/edit modal ──
  const [modalOpen,    setModalOpen]    = useState(false);
  const [modalMode,    setModalMode]    = useState<"add" | "edit">("add");
  const [editId,       setEditId]       = useState<number | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [saveErr,      setSaveErr]      = useState("");
  const [satirLoading, setSatirLoading] = useState(false);

  // ── form fields ──
  const [musteri,      setMusteri]      = useState<MusteriOpt | null>(null);
  const [satirlar,     setSatirlar]     = useState<Satir[]>([]);
  const [teklifNotlar, setTeklifNotlar] = useState("");
  const [kdvOran,      setKdvOran]      = useState("20");
  const [genelIskonto, setGenelIskonto] = useState("0");
  const [revizeOfId,   setRevizeOfId]   = useState<number | null>(null);

  // ── müşteri dropdown ──
  const [musteriQ,       setMusteriQ]       = useState("");
  const [musteriOpts,    setMusteriOpts]    = useState<MusteriOpt[]>([]);
  const [musteriLoading, setMusteriLoading] = useState(false);
  const [musteriOpen,    setMusteriOpen]    = useState(false);
  const musteriRef  = useRef<HTMLDivElement>(null);
  const musteriTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── hizmet/paket ──
  const [addMode,       setAddMode]       = useState<"hizmet" | "paket" | null>(null);
  const [hizmetQ,       setHizmetQ]       = useState("");
  const [hizmetOpts,    setHizmetOpts]    = useState<HizmetOpt[]>([]);
  const [hizmetLoading, setHizmetLoading] = useState(false);
  const [paketler,      setPaketler]      = useState<PaketOpt[]>([]);
  const [paketLoading,  setPaketLoading]  = useState(false);
  const [paketExpanded, setPaketExpanded] = useState<number | null>(null);
  const hizmetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── durum değiştirme dropdown ──
  const [durumMenuId, setDurumMenuId] = useState<number | null>(null);

  // ── mail modal ──
  const [mailTarget,  setMailTarget]  = useState<Teklif | null>(null);
  const [mailTo,      setMailTo]      = useState<string[]>([]);
  const [mailToInput, setMailToInput] = useState("");
  const [mailCc,      setMailCc]      = useState<string[]>([]);
  const [mailCcInput, setMailCcInput] = useState("");
  const [mailKonu,    setMailKonu]    = useState("");
  const [mailMesaj,   setMailMesaj]   = useState("");
  const [mailSending, setMailSending] = useState(false);
  const [mailErr,     setMailErr]     = useState("");
  const [mailOk,      setMailOk]      = useState(false);

  // ── delete ──
  const [deleteTarget, setDeleteTarget] = useState<Teklif | null>(null);
  const [deleting,     setDeleting]     = useState(false);

  // ── fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (s: string, p: number, lim: number) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/teklifler?search=${encodeURIComponent(s)}&page=${p}&limit=${lim}`);
      const j = await r.json();
      setData(j.data || []);
      setTotal(j.total || 0);
      setTotalPages(j.totalPages || 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(search, page, limit); }, [page, limit]);

  function handleSearch(val: string) {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setPage(1); fetchData(val, 1, limit); }, 350);
  }

  // ── müşteri ──────────────────────────────────────────────────────────────
  function handleMusteriQ(val: string) {
    setMusteriQ(val); setMusteri(null); setMusteriOpen(true);
    if (musteriTimer.current) clearTimeout(musteriTimer.current);
    musteriTimer.current = setTimeout(async () => {
      setMusteriLoading(true);
      try {
        const r = await fetch(`/api/teklifler/lookup?type=musteriler&q=${encodeURIComponent(val)}`);
        const j = await r.json();
        setMusteriOpts(j.data || []);
      } finally { setMusteriLoading(false); }
    }, 300);
  }

  function pickMusteri(m: MusteriOpt) {
    setMusteri(m); setMusteriQ(m.Ad); setMusteriOpen(false);
  }

  useEffect(() => {
    function h(e: MouseEvent) {
      if (musteriRef.current && !musteriRef.current.contains(e.target as Node)) setMusteriOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── hizmet ───────────────────────────────────────────────────────────────
  function handleHizmetQ(val: string) {
    setHizmetQ(val);
    if (hizmetTimer.current) clearTimeout(hizmetTimer.current);
    hizmetTimer.current = setTimeout(async () => {
      setHizmetLoading(true);
      try {
        const r = await fetch(`/api/teklifler/lookup?type=hizmetler&q=${encodeURIComponent(val)}`);
        const j = await r.json();
        setHizmetOpts(j.data || []);
      } finally { setHizmetLoading(false); }
    }, 300);
  }

  async function loadPaketler() {
    setPaketLoading(true);
    try {
      const r = await fetch("/api/teklifler/lookup?type=paketler");
      const j = await r.json();
      setPaketler(j.data || []);
    } finally { setPaketLoading(false); }
  }

  function toggleAddMode(mode: "hizmet" | "paket") {
    if (addMode === mode) { setAddMode(null); return; }
    setAddMode(mode);
    if (mode === "hizmet" && hizmetOpts.length === 0) handleHizmetQ("");
    if (mode === "paket"  && paketler.length === 0)   loadPaketler();
  }

  function addHizmet(h: HizmetOpt)   { setSatirlar(p => [...p, makeSatir(h)]); }
  function addPaket(pk: PaketOpt)    { setSatirlar(p => [...p, ...pk.items.map(makeSatir)]); }
  function removeSatir(key: string)  { setSatirlar(p => p.filter(s => s._key !== key)); }
  function updateSatir(key: string, field: keyof Omit<Satir, "_key">, val: string) {
    setSatirlar(p => p.map(s => s._key === key ? { ...s, [field]: val } : s));
  }

  // ── open modal ─────────────────────────────────────────────────────────────
  function resetModal() {
    setMusteri(null); setMusteriQ(""); setMusteriOpts([]);
    setSatirlar([]); setTeklifNotlar("");
    setKdvOran("20"); setGenelIskonto("0");
    setAddMode(null); setHizmetQ(""); setHizmetOpts([]); setPaketler([]);
    setSaveErr(""); setRevizeOfId(null);
  }

  function openAdd() {
    setModalMode("add"); setEditId(null); resetModal(); setModalOpen(true);
  }

  async function openEdit(t: Teklif) {
    setModalMode("edit"); setEditId(t.ID);
    setMusteri({ ID: t.MusteriID, Ad: t.MusteriAd });
    setMusteriQ(t.MusteriAd); setMusteriOpts([]);
    setSatirlar([]); setTeklifNotlar(t.Notlar || "");
    setKdvOran("20"); setGenelIskonto("0");
    setAddMode(null); setHizmetQ(""); setHizmetOpts([]); setPaketler([]);
    setSaveErr(""); setRevizeOfId(null);
    setModalOpen(true);
    setSatirLoading(true);
    try {
      const r = await fetch(`/api/teklifler/${t.ID}`);
      const j = await r.json();
      if (j.header) {
        setKdvOran(String(j.header.KdvOran ?? 20));
        setGenelIskonto(String(j.header.GenelIskonto ?? 0));
        setTeklifNotlar(j.header.Notlar || "");
      }
      if (j.satirlar) setSatirlar(j.satirlar.map((s: any) => ({
        _key: nextKey(), hizmetId: s.HizmetID, hizmetAdi: s.HizmetAdi || "",
        hizmetKod: "", adet: s.Adet != null ? String(s.Adet) : "1",
        fiyat: s.Fiyat != null ? String(s.Fiyat) : "",
        paraBirimi: s.ParaBirimi || "TRY", iskonto: s.Iskonto != null ? String(s.Iskonto) : "0",
        metot: s.Metot || "", akreditasyon: s.Akreditasyon || "",
        notlar: s.Notlar || "",
      })));
    } catch {} finally { setSatirLoading(false); }
  }

  function openRevize(t: Teklif) {
    setModalMode("add"); setEditId(null);
    setMusteri({ ID: t.MusteriID, Ad: t.MusteriAd });
    setMusteriQ(t.MusteriAd); setMusteriOpts([]);
    setSatirlar([]); setTeklifNotlar(t.Notlar || "");
    setKdvOran("20"); setGenelIskonto("0");
    setAddMode(null); setHizmetQ(""); setHizmetOpts([]); setPaketler([]);
    setSaveErr(""); setRevizeOfId(t.ID);
    setModalOpen(true);
    setSatirLoading(true);
    fetch(`/api/teklifler/${t.ID}`).then(r => r.json()).then(j => {
      if (j.header) {
        setKdvOran(String(j.header.KdvOran ?? 20));
        setGenelIskonto(String(j.header.GenelIskonto ?? 0));
        setTeklifNotlar(j.header.Notlar || "");
      }
      if (j.satirlar) setSatirlar(j.satirlar.map((s: any) => ({
        _key: nextKey(), hizmetId: s.HizmetID, hizmetAdi: s.HizmetAdi || "",
        hizmetKod: "", adet: s.Adet != null ? String(s.Adet) : "1",
        fiyat: s.Fiyat != null ? String(s.Fiyat) : "",
        paraBirimi: s.ParaBirimi || "TRY", iskonto: s.Iskonto != null ? String(s.Iskonto) : "0",
        metot: s.Metot || "", akreditasyon: s.Akreditasyon || "",
        notlar: s.Notlar || "",
      })));
    }).catch(() => {}).finally(() => setSatirLoading(false));
  }

  // ── save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaveErr("");
    if (!musteri)               { setSaveErr("Müşteri seçimi zorunludur."); return; }
    if (satirlar.length === 0)  { setSaveErr("En az bir hizmet eklemelisiniz."); return; }

    const payload = {
      musteriId:    musteri.ID,
      satirlar:     satirlar.map(s => ({
        hizmetId: s.hizmetId, hizmetAdi: s.hizmetAdi,
        adet: s.adet, fiyat: s.fiyat, paraBirimi: s.paraBirimi,
        iskonto: s.iskonto, metot: s.metot, akreditasyon: s.akreditasyon,
        notlar: s.notlar,
      })),
      notlar:       teklifNotlar,
      teklifKonusu: "Fiyat teklifimiz",
      teklifVeren:  userName,
      kdvOran:      kdvOran,
      genelIskonto: genelIskonto,
      revizeOfId:   revizeOfId ?? undefined,
    };

    setSaving(true);
    try {
      const url    = modalMode === "edit" ? `/api/teklifler/${editId}` : "/api/teklifler";
      const method = modalMode === "edit" ? "PUT" : "POST";
      const r      = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j      = await r.json();
      if (!r.ok) { setSaveErr(j.error || "Kayıt başarısız."); return; }
      setModalOpen(false);
      setPage(1); fetchData(search, 1, limit);
    } catch { setSaveErr("Sunucu hatası."); }
    finally  { setSaving(false); }
  }

  // ── durum değiştir ────────────────────────────────────────────────────────
  useEffect(() => {
    function h(e: MouseEvent) {
      const target = e.target as Element;
      if (!target.closest("[data-durum-menu]")) setDurumMenuId(null);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  async function changeDurum(id: number, teklifDurum: string) {
    setDurumMenuId(null);
    await fetch(`/api/teklifler/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teklifDurum }),
    });
    setData(prev => prev.map(t => t.ID === id ? { ...t, TeklifDurum: teklifDurum } : t));
  }

  // ── mail modal ────────────────────────────────────────────────────────────
  async function openMail(t: Teklif) {
    setMailTarget(t); setMailErr(""); setMailOk(false);
    setMailTo([]); setMailToInput(""); setMailCc([]); setMailCcInput("");
    setMailKonu(`Teklif: ${teklifLabel(t.TeklifNo, t.RevNo)} — ${t.MusteriAd}`);
    setMailMesaj("");
    // Müşteri mailini çek
    try {
      const r = await fetch(`/api/teklifler/${t.ID}`);
      const j = await r.json();
      const email = j.header?.MusteriEmail;
      if (email) setMailTo([email]);
    } catch {}
  }

  function addMailAddr(list: string[], setList: (v: string[]) => void, input: string, setInput: (v: string) => void) {
    const v = input.trim();
    if (v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && !list.includes(v)) {
      setList([...list, v]);
    }
    setInput("");
  }

  async function handleSendMail() {
    if (!mailTarget || mailTo.length === 0) { setMailErr("En az bir alıcı gereklidir."); return; }
    setMailSending(true); setMailErr("");
    try {
      const r = await fetch(`/api/teklifler/${mailTarget.ID}/mail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: mailTo, cc: mailCc, konu: mailKonu, mesaj: mailMesaj }),
      });
      const j = await r.json();
      if (!r.ok) { setMailErr(j.error || "Gönderilemedi."); return; }
      setMailOk(true);
      setData(prev => prev.map(t => t.ID === mailTarget.ID && t.TeklifDurum === "Taslak" ? { ...t, TeklifDurum: "Gönderildi" } : t));
    } catch { setMailErr("Sunucu hatası."); }
    finally   { setMailSending(false); }
  }

  // ── delete ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/teklifler/${deleteTarget.ID}`, { method: "DELETE" });
      setDeleteTarget(null); fetchData(search, page, limit);
    } finally { setDeleting(false); }
  }

  // ── pagination ─────────────────────────────────────────────────────────────
  function pageNumbers(): (number | "…")[] {
    const pages: (number | "…")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("…");
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
      if (page < totalPages - 2) pages.push("…");
      pages.push(totalPages);
    }
    return pages;
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchBox}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="9" r="7" /><path d="M16 16l-3-3" />
            </svg>
            <input className={styles.searchInput} placeholder="Müşteri, teklif no veya not ara..."
              value={search} onChange={e => handleSearch(e.target.value)} />
            {search && <button className={styles.searchClear} onClick={() => handleSearch("")}>✕</button>}
          </div>
          <span className={styles.totalCount}>{total} kayıt</span>
        </div>
        <div className={styles.toolbarRight}>
          <select className={styles.pageSizeSelect} value={limit}
            onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
            {[10, 20, 50].map(n => <option key={n} value={n}>{n} / sayfa</option>)}
          </select>
          <button className={styles.addBtn} onClick={openAdd}>+ Yeni Teklif</button>
        </div>
      </div>

      {/* Table */}
      <div className={styles.tableCard}>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 140 }}>Teklif No</th>
                <th style={{ width: 90 }}>Tarih</th>
                <th>Müşteri</th>
                <th style={{ width: 80, textAlign: "center" }}>Hizmet</th>
                <th style={{ width: 120, textAlign: "right" }}>Toplam</th>
                <th style={{ width: 110, textAlign: "center" }}>Durum</th>
                <th style={{ width: 130 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (
                      <td key={j}><div className={styles.skeleton} style={{ height: 14 }} /></td>
                    ))}</tr>
                  ))
                : data.length === 0
                  ? <tr><td colSpan={7} className={styles.empty}>
                      {search ? "Arama sonucu bulunamadı." : "Henüz teklif oluşturulmamış."}
                    </td></tr>
                  : data.map(t => {
                      const durumCfg = DURUM_LABELS[t.TeklifDurum] ?? DURUM_LABELS.Taslak;
                      return (
                        <tr key={t.ID}>
                          <td className={styles.tdMono} style={{ fontWeight: 600 }}>
                            {teklifLabel(t.TeklifNo, t.RevNo)}
                          </td>
                          <td className={styles.tdSecondary}>{t.Tarih}</td>
                          <td className={styles.tdName}>
                            {t.MusteriAd || <em style={{ color: "var(--color-text-tertiary)" }}>—</em>}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <span className={`${styles.badge} ${styles.badgeGray}`}>{t.HizmetSayisi}</span>
                          </td>
                          <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                            {fmt(t.Toplam)}
                          </td>
                          {/* Durum badge — tıklanabilir */}
                          <td style={{ textAlign: "center" }}>
                            <div style={{ position: "relative", display: "inline-block" }} data-durum-menu>
                              <button
                                style={{
                                  background: durumCfg.bg, color: durumCfg.color,
                                  border: "none", borderRadius: 20, padding: "3px 10px",
                                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                                  whiteSpace: "nowrap",
                                }}
                                onClick={() => setDurumMenuId(prev => prev === t.ID ? null : t.ID)}
                                title="Durumu değiştir"
                              >
                                {durumCfg.label} ▾
                              </button>
                              {durumMenuId === t.ID && (
                                <div style={{
                                  position: "absolute", top: "calc(100% + 4px)", right: 0,
                                  background: "var(--color-surface)", border: "1px solid var(--color-border)",
                                  borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                                  zIndex: 50, minWidth: 140,
                                }}>
                                  {DURUM_KEYS.map(k => {
                                    const cfg = DURUM_LABELS[k];
                                    return (
                                      <button key={k}
                                        style={{
                                          display: "block", width: "100%", textAlign: "left",
                                          padding: "8px 14px", background: "none", border: "none",
                                          cursor: "pointer", fontSize: 13,
                                          color: k === t.TeklifDurum ? cfg.color : "var(--color-text-primary)",
                                          fontWeight: k === t.TeklifDurum ? 700 : 400,
                                        }}
                                        onMouseDown={() => changeDurum(t.ID, k)}
                                      >
                                        {cfg.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </td>
                          {/* Aksiyonlar */}
                          <td>
                            <div style={{ display: "flex", gap: 3, justifyContent: "flex-end" }}>
                              <button className={styles.editBtn}   onClick={() => openEdit(t)}         title="Düzenle">✏️</button>
                              <button className={styles.editBtn}   onClick={() => openRevize(t)}        title="Revizyon" style={{ filter: "sepia(1) hue-rotate(180deg)" }}>🔄</button>
                              <button className={styles.editBtn}   onClick={() => openMail(t)}          title="Mail gönder">✉️</button>
                              <button className={styles.editBtn}   onClick={() => window.open(`/teklif-print/${t.ID}?print=1`, "_blank")} title="PDF olarak kaydet">PDF</button>
                              <button className={styles.editBtn}   onClick={() => window.open(`/api/teklifler/${t.ID}/export?format=docx`, "_blank")} title="Word indir">DOC</button>
                              <button className={styles.deleteBtn} onClick={() => setDeleteTarget(t)}   title="Sil">🗑</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button className={styles.pageBtn} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
          {pageNumbers().map((n, i) =>
            n === "…"
              ? <span key={`d${i}`} className={styles.pageDots}>…</span>
              : <button key={n}
                  className={`${styles.pageBtn} ${page === n ? styles.pageBtnActive : ""}`}
                  onClick={() => setPage(n as number)}>{n}</button>
          )}
          <button className={styles.pageBtn} onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
          <span className={styles.pageInfo}>{page} / {totalPages}</span>
        </div>
      )}

      {/* ── Add / Edit Modal ─────────────────────────────────────────────────── */}
      {modalOpen && (
        <div className={styles.modalOverlay} onClick={() => !saving && setModalOpen(false)}>
          <div className={styles.modal}
            style={{ maxWidth: 960, width: "95vw" }}
            onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>
                {modalMode === "edit" ? "Teklif Güncelle"
                  : revizeOfId ? "Teklif Revizyonu" : "Yeni Teklif"}
              </h2>
              {revizeOfId && (
                <span style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginLeft: 10 }}>
                  (#{revizeOfId} revizyonu)
                </span>
              )}
              <button className={styles.modalClose} onClick={() => !saving && setModalOpen(false)}>✕</button>
            </div>

            <div className={styles.modalBody}>
              {/* Müşteri */}
              <section style={{ marginBottom: 24 }}>
                <label style={labelStyle}>Müşteri <span className={styles.required}>*</span></label>
                <div ref={musteriRef} style={{ position: "relative" }}>
                  <input style={inputStyle} placeholder="Müşteri ara..." value={musteriQ}
                    onChange={e => handleMusteriQ(e.target.value)}
                    onFocus={() => { setMusteriOpen(true); if (musteriOpts.length === 0) handleMusteriQ(""); }}
                    autoComplete="off" />
                  {musteriOpen && (
                    <div style={dropdownStyle}>
                      {musteriLoading
                        ? <div style={dropItemStyle}>Yükleniyor...</div>
                        : musteriOpts.length === 0
                          ? <div style={dropItemStyle}>Sonuç bulunamadı.</div>
                          : musteriOpts.map(m => (
                              <div key={m.ID}
                                style={{ ...dropItemStyle, background: musteri?.ID === m.ID ? "var(--color-accent)" : undefined, color: musteri?.ID === m.ID ? "#fff" : undefined, cursor: "pointer" }}
                                onMouseDown={() => pickMusteri(m)}>
                                {m.Ad}
                              </div>
                            ))
                      }
                    </div>
                  )}
                </div>
              </section>

              {/* Hizmet satırları */}
              <section style={{ marginBottom: 24 }}>
                {/* Başlık + KDV seçimi */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Hizmet Satırları <span className={styles.required}>*</span></label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 600 }}>KDV %</span>
                    <select style={{ ...cellInputStyle, width: 72 }} value={kdvOran} onChange={e => setKdvOran(e.target.value)}>
                      {["0","1","8","10","18","20"].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                </div>

                {/* Ekle butonları — hep üstte */}
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  {(["hizmet", "paket"] as const).map(mode => (
                    <button key={mode} style={{ ...addPanelBtnStyle, background: addMode === mode ? "var(--color-accent)" : undefined, color: addMode === mode ? "#fff" : undefined }}
                      onClick={() => toggleAddMode(mode)}>
                      {mode === "hizmet" ? "+ Hizmet Ekle" : "≡ Paketten Ekle"}
                    </button>
                  ))}
                </div>

                {addMode === "hizmet" && (
                  <div style={panelStyle}>
                    <input style={{ ...inputStyle, marginBottom: 8 }} placeholder="Hizmet adı veya kodu ara..."
                      value={hizmetQ} onChange={e => handleHizmetQ(e.target.value)} autoFocus />
                    {hizmetLoading
                      ? <p style={smallText}>Yükleniyor...</p>
                      : hizmetOpts.length === 0
                        ? <p style={smallText}>Sonuç bulunamadı.</p>
                        : <div style={{ maxHeight: 220, overflowY: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                              <thead><tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                                <th style={thStyle}>Kod</th><th style={thStyle}>Hizmet Adı</th>
                                <th style={{ ...thStyle, textAlign: "right" }}>Fiyat</th><th style={{ ...thStyle, width: 60 }}></th>
                              </tr></thead>
                              <tbody>
                                {hizmetOpts.map(h => (
                                  <tr key={h.ID} style={{ borderBottom: "1px solid var(--color-border)" }}>
                                    <td style={{ ...tdStyle, color: "var(--color-text-tertiary)", width: 80 }}>{h.Kod}</td>
                                    <td style={tdStyle}>{h.Ad}</td>
                                    <td style={{ ...tdStyle, textAlign: "right" }}>{h.Fiyat != null ? `${fmt(h.Fiyat)} ${h.ParaBirimi || "TRY"}` : <span style={{ color: "var(--color-text-tertiary)" }}>—</span>}</td>
                                    <td style={tdStyle}><button style={smallAddBtnStyle} onClick={() => addHizmet(h)}>Ekle</button></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                    }
                  </div>
                )}

                {addMode === "paket" && (
                  <div style={panelStyle}>
                    {paketLoading
                      ? <p style={smallText}>Yükleniyor...</p>
                      : paketler.length === 0
                        ? <p style={smallText}>Aktif paket bulunamadı.</p>
                        : <div style={{ maxHeight: 300, overflowY: "auto" }}>
                            {paketler.map(p => (
                              <div key={p.ID} style={{ borderBottom: "1px solid var(--color-border)", marginBottom: 4 }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 4px", cursor: "pointer" }}
                                  onClick={() => setPaketExpanded(prev => prev === p.ID ? null : p.ID)}>
                                  <div>
                                    <span style={{ fontWeight: 600, fontSize: 13 }}>{p.ListeAdi}</span>
                                    <span style={{ color: "var(--color-text-tertiary)", fontSize: 12, marginLeft: 8 }}>{p.items.length} hizmet</span>
                                    {p.Aciklama && <span style={{ color: "var(--color-text-secondary)", fontSize: 12, marginLeft: 8 }}>— {p.Aciklama}</span>}
                                  </div>
                                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    <button style={smallAddBtnStyle} onMouseDown={e => { e.stopPropagation(); addPaket(p); }}>Tümünü Ekle</button>
                                    <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>{paketExpanded === p.ID ? "▲" : "▼"}</span>
                                  </div>
                                </div>
                                {paketExpanded === p.ID && p.items.length > 0 && (
                                  <div style={{ paddingLeft: 16, paddingBottom: 8 }}>
                                    {p.items.map((item, idx) => (
                                      <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", color: "var(--color-text-secondary)" }}>
                                        <span>• {item.HizmetAdi} {item.Kod && <span style={{ color: "var(--color-text-tertiary)" }}>({item.Kod})</span>}</span>
                                        <span style={{ marginLeft: 16, flexShrink: 0 }}>{item.Fiyat != null ? `${fmt(item.Fiyat)} ${item.ParaBirimi || "TRY"}` : "—"}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                    }
                  </div>
                )}

                {/* Satır tablosu */}
                {satirLoading && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 0", color: "var(--color-text-secondary)", fontSize: 14 }}>
                    <span style={{ display: "inline-block", width: 18, height: 18, border: "2px solid var(--color-border)", borderTopColor: "var(--color-accent)", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                    Hizmet satırları yükleniyor…
                  </div>
                )}
                {!satirLoading && satirlar.length > 0 && (
                  <div style={{ overflowX: "auto", marginTop: 10 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                          <th style={thStyle}>Hizmet</th>
                          <th style={{ ...thStyle, width: 55 }}>Adet</th>
                          <th style={{ ...thStyle, width: 110 }}>Fiyat</th>
                          <th style={{ ...thStyle, width: 76 }}>Birim</th>
                          <th style={{ ...thStyle, width: 65 }}>İsk %</th>
                          <th style={{ ...thStyle, width: 110, textAlign: "right" }}>Net</th>
                          <th style={{ ...thStyle, width: 130 }}>Not</th>
                          <th style={{ ...thStyle, width: 30 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {satirlar.map(s => (
                          <tr key={s._key} style={{ borderBottom: "1px solid var(--color-border)" }}>
                            <td style={tdStyle}>
                              <span style={{ fontWeight: 500 }}>{s.hizmetAdi}</span>
                              {s.hizmetKod && <span style={{ color: "var(--color-text-tertiary)", fontSize: 11, marginLeft: 4 }}>{s.hizmetKod}</span>}
                            </td>
                            <td style={tdStyle}>
                              <input type="number" min="1" step="1" style={cellInputStyle}
                                value={s.adet} onChange={e => updateSatir(s._key, "adet", e.target.value)} placeholder="1" />
                            </td>
                            <td style={tdStyle}>
                              <input type="number" min="0" step="0.01" style={cellInputStyle}
                                value={s.fiyat} onChange={e => updateSatir(s._key, "fiyat", e.target.value)} placeholder="0.00" />
                            </td>
                            <td style={tdStyle}>
                              <select style={{ ...cellInputStyle, paddingRight: 4 }}
                                value={s.paraBirimi} onChange={e => updateSatir(s._key, "paraBirimi", e.target.value)}>
                                {PB_OPTIONS.map(p => <option key={p}>{p}</option>)}
                              </select>
                            </td>
                            <td style={tdStyle}>
                              <input type="number" min="0" max="100" step="0.1" style={cellInputStyle}
                                value={s.iskonto} onChange={e => updateSatir(s._key, "iskonto", e.target.value)} placeholder="0" />
                            </td>
                            <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                              {fmt(netTutar(s))} <span style={{ color: "var(--color-text-tertiary)", fontSize: 11 }}>{s.paraBirimi}</span>
                            </td>
                            <td style={tdStyle}>
                              <input style={cellInputStyle} value={s.notlar}
                                onChange={e => updateSatir(s._key, "notlar", e.target.value)} placeholder="..." />
                            </td>
                            <td style={tdStyle}>
                              <button onClick={() => removeSatir(s._key)}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-danger)", fontSize: 16, padding: "0 4px" }}>×</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Özet */}
                    {(() => {
                      const araTutar   = satirlar.reduce((acc, s) => acc + netTutar(s), 0);
                      const gIsk       = parseFloat(genelIskonto) || 0;
                      const iskontolu  = araTutar * (1 - gIsk / 100);
                      const kdv        = iskontolu * (parseInt(kdvOran) || 0) / 100;
                      const toplam     = iskontolu + kdv;
                      // Para birimi: çoğunluk
                      const pbCount: Record<string, number> = {};
                      satirlar.forEach(s => { pbCount[s.paraBirimi] = (pbCount[s.paraBirimi] || 0) + 1; });
                      const pb = Object.entries(pbCount).sort((a,b) => b[1]-a[1])[0]?.[0] ?? "";
                      const isMixed = Object.keys(pbCount).length > 1;
                      const pbLabel = isMixed ? "Karma" : pb;
                      return (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, padding: "10px 8px", borderTop: "2px solid var(--color-border)", fontSize: 13 }}>
                          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                            <span style={{ color: "var(--color-text-secondary)" }}>Ara Toplam</span>
                            <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 130, textAlign: "right" }}>{fmt(araTutar)} <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{pbLabel}</span></span>
                          </div>
                          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                            <span style={{ color: "var(--color-text-secondary)" }}>Genel İskonto %</span>
                            <input type="number" min="0" max="100" step="0.1" style={{ ...cellInputStyle, width: 65, textAlign: "right" }}
                              value={genelIskonto} onChange={e => setGenelIskonto(e.target.value)} placeholder="0" />
                            <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 130, textAlign: "right", color: "var(--color-danger)" }}>
                              -{fmt(araTutar * gIsk / 100)} <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{pbLabel}</span>
                            </span>
                          </div>
                          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                            <span style={{ color: "var(--color-text-secondary)" }}>KDV (%{kdvOran})</span>
                            <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 130, textAlign: "right" }}>{fmt(kdv)} <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{pbLabel}</span></span>
                          </div>
                          <div style={{ display: "flex", gap: 16, alignItems: "center", fontWeight: 700, fontSize: 14, color: "var(--color-accent)" }}>
                            <span>Genel Toplam</span>
                            <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 130, textAlign: "right" }}>{fmt(toplam)} <span style={{ fontSize: 12 }}>{pbLabel}</span></span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </section>

              {/* Teklif Notu */}
              <section>
                <label style={labelStyle}>Teklif Notu</label>
                <textarea style={{ ...inputStyle, height: 80, resize: "vertical" }}
                  placeholder="Teklife eklemek istediğiniz not..."
                  value={teklifNotlar} onChange={e => setTeklifNotlar(e.target.value)} />
              </section>

              {saveErr && <p className={styles.formError} style={{ marginTop: 12 }}>{saveErr}</p>}
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => !saving && setModalOpen(false)} disabled={saving}>İptal</button>
              <button className={styles.saveBtn}   onClick={handleSave} disabled={saving}>
                {saving ? <span className={styles.loader} /> : "KAYDET"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mail Modal ───────────────────────────────────────────────────────── */}
      {mailTarget && (
        <div className={styles.modalOverlay} onClick={() => !mailSending && setMailTarget(null)}>
          <div className={styles.modal} style={{ maxWidth: 600, width: "95vw" }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Mail Gönder</h2>
              <span style={{ fontSize: 13, color: "var(--color-text-tertiary)", marginLeft: 10 }}>
                {teklifLabel(mailTarget.TeklifNo, mailTarget.RevNo)} — {mailTarget.MusteriAd}
              </span>
              <button className={styles.modalClose} onClick={() => !mailSending && setMailTarget(null)}>✕</button>
            </div>

            {mailOk
              ? <div className={styles.modalBody} style={{ textAlign: "center", padding: "40px 32px" }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
                  <p style={{ fontWeight: 600, fontSize: 16 }}>Mail başarıyla gönderildi.</p>
                  <p style={{ color: "var(--color-text-tertiary)", marginTop: 6 }}>
                    Teklif durumu "Gönderildi" olarak güncellendi.
                  </p>
                  <button className={styles.saveBtn} style={{ marginTop: 20 }} onClick={() => setMailTarget(null)}>Kapat</button>
                </div>
              : <>
                  <div className={styles.modalBody}>
                    {/* Alıcılar */}
                    <div style={{ marginBottom: 18 }}>
                      <label style={labelStyle}>Alıcı (To) <span className={styles.required}>*</span></label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                        {mailTo.map(e => (
                          <span key={e} style={tagStyle}>
                            {e}
                            <button style={tagRemoveStyle} onClick={() => setMailTo(mailTo.filter(x => x !== e))}>×</button>
                          </span>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input style={{ ...inputStyle, flex: 1 }} type="email" placeholder="mail@ornek.com"
                          value={mailToInput} onChange={e => setMailToInput(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addMailAddr(mailTo, setMailTo, mailToInput, setMailToInput); } }} />
                        <button style={smallAddBtnStyle} onClick={() => addMailAddr(mailTo, setMailTo, mailToInput, setMailToInput)}>Ekle</button>
                      </div>
                    </div>

                    {/* CC */}
                    <div style={{ marginBottom: 18 }}>
                      <label style={labelStyle}>CC (İsteğe bağlı)</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                        {mailCc.map(e => (
                          <span key={e} style={tagStyle}>
                            {e}
                            <button style={tagRemoveStyle} onClick={() => setMailCc(mailCc.filter(x => x !== e))}>×</button>
                          </span>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input style={{ ...inputStyle, flex: 1 }} type="email" placeholder="cc@ornek.com"
                          value={mailCcInput} onChange={e => setMailCcInput(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addMailAddr(mailCc, setMailCc, mailCcInput, setMailCcInput); } }} />
                        <button style={smallAddBtnStyle} onClick={() => addMailAddr(mailCc, setMailCc, mailCcInput, setMailCcInput)}>Ekle</button>
                      </div>
                    </div>

                    {/* Konu */}
                    <div style={{ marginBottom: 18 }}>
                      <label style={labelStyle}>Konu</label>
                      <input style={inputStyle} value={mailKonu} onChange={e => setMailKonu(e.target.value)} />
                    </div>

                    {/* Mesaj */}
                    <div>
                      <label style={labelStyle}>Ek Mesaj (opsiyonel)</label>
                      <textarea style={{ ...inputStyle, height: 90, resize: "vertical" }}
                        placeholder="Müşteriye iletmek istediğiniz ek not..." value={mailMesaj}
                        onChange={e => setMailMesaj(e.target.value)} />
                    </div>

                    {mailErr && <p className={styles.formError} style={{ marginTop: 12 }}>{mailErr}</p>}
                  </div>

                  <div className={styles.modalFooter}>
                    <button className={styles.cancelBtn} onClick={() => setMailTarget(null)} disabled={mailSending}>İptal</button>
                    <button className={styles.saveBtn}   onClick={handleSendMail}             disabled={mailSending}>
                      {mailSending ? <span className={styles.loader} /> : "✉ Gönder"}
                    </button>
                  </div>
                </>
            }
          </div>
        </div>
      )}

      {/* ── Delete Confirm ───────────────────────────────────────────────────── */}
      {deleteTarget && (
        <div className={styles.modalOverlay} onClick={() => !deleting && setDeleteTarget(null)}>
          <div className={`${styles.modal} ${styles.modalSm}`} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Teklif Silinsin mi?</h2>
              <button className={styles.modalClose} onClick={() => setDeleteTarget(null)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <p>
                <strong>{teklifLabel(deleteTarget.TeklifNo, deleteTarget.RevNo)}</strong> numaralı teklif pasife alınacak.
                {deleteTarget.MusteriAd && <> ({deleteTarget.MusteriAd})</>}
              </p>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn}     onClick={() => setDeleteTarget(null)} disabled={deleting}>İptal</button>
              <button className={styles.deleteBtnPrimary} onClick={handleDelete}              disabled={deleting}>
                {deleting ? <span className={styles.loader} /> : "Pasife Al"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.04em",
  color: "var(--color-text-secondary)", marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px",
  border: "1px solid var(--color-border)", borderRadius: 8,
  fontSize: 14, background: "var(--color-surface)",
  color: "var(--color-text-primary)", boxSizing: "border-box", outline: "none",
};
const dropdownStyle: React.CSSProperties = {
  position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
  background: "var(--color-surface)", border: "1px solid var(--color-border)",
  borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 100,
  maxHeight: 220, overflowY: "auto",
};
const dropItemStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 14 };
const panelStyle: React.CSSProperties = {
  background: "var(--color-bg)", border: "1px solid var(--color-border)",
  borderRadius: 10, padding: 12,
};
const thStyle: React.CSSProperties = {
  textAlign: "left", fontWeight: 600, fontSize: 12,
  color: "var(--color-text-secondary)", padding: "4px 8px", whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = { padding: "6px 8px", verticalAlign: "middle" };
const cellInputStyle: React.CSSProperties = {
  width: "100%", padding: "4px 6px",
  border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 13,
  background: "var(--color-surface)", color: "var(--color-text-primary)", boxSizing: "border-box",
};
const addPanelBtnStyle: React.CSSProperties = {
  padding: "6px 14px", fontSize: 13,
  border: "1px solid var(--color-border)", borderRadius: 8,
  background: "var(--color-surface)", color: "var(--color-text-primary)",
  cursor: "pointer", fontWeight: 500,
};
const smallAddBtnStyle: React.CSSProperties = {
  padding: "3px 10px", fontSize: 12,
  border: "1px solid var(--color-accent)", borderRadius: 6,
  background: "transparent", color: "var(--color-accent)",
  cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap",
};
const smallText: React.CSSProperties = { fontSize: 13, color: "var(--color-text-tertiary)" };
const tagStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4,
  background: "var(--color-bg)", border: "1px solid var(--color-border)",
  borderRadius: 20, padding: "2px 10px", fontSize: 13,
};
const tagRemoveStyle: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer",
  color: "var(--color-text-tertiary)", fontSize: 14, lineHeight: 1, padding: 0,
};
