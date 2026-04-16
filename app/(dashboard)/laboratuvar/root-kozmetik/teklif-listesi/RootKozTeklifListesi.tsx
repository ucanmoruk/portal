"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import styles from "@/app/styles/table.module.css";

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────
interface Teklif {
  ID: number;
  TeklifNo: string;
  RevNo: number;
  Tarih: string;
  MusteriAdi: string;
  MusteriEmail: string;
  MarkaAdi: string;
  UrunKategorisi: string;
  SKUSayisi: number;
  ToplamTutar: number;
  Durum: string;
  DahilKalemSayisi: number;
}

interface Kalem {
  _key: string;
  bolum: string;
  hizmetAdi: string;
  sure: string;
  miktar: string;
  birimFiyat: string;
  paraBirimi: string;
  iskonto: string;
  dahil: boolean;
  notlar: string;
  isCustom?: boolean; // kullanıcı tarafından manuel eklenen satır
}

interface TeklifForm {
  musteriAdi: string;
  musteriEmail: string;
  musteriTelefon: string;
  markaAdi: string;
  urunKategorisi: string;
  skuSayisi: string;
  uretimMiktari: string;
  hedefPazar: string;
  odemeTuru: string;
  kdvOran: string;
  genelIskonto: string;
  notlar: string;
  kalemler: Kalem[];
}

// ──────────────────────────────────────────────────────────────
// Default hizmet kalemleri (DOCX'ten)
// ──────────────────────────────────────────────────────────────
const DEFAULT_BOLUMLER: { bolum: string; label: string; kalemler: Omit<Kalem, "_key" | "bolum" | "miktar" | "birimFiyat" | "paraBirimi" | "iskonto" | "notlar" | "dahil">[] }[] = [
  {
    bolum: "FORMULASYON", label: "Formülasyon & Ar-Ge (Root Scientific)",
    kalemler: [
      { hizmetAdi: "Yeni formül geliştirme (1 ürün)",            sure: "4–6 hafta" },
      { hizmetAdi: "Mevcut formül optimizasyonu",                 sure: "2–3 hafta" },
      { hizmetAdi: "Stabilite testi (25°C/40°C/50°C)",           sure: "4–12 hafta" },
      { hizmetAdi: "Pilot üretim (lab batch)",                    sure: "1–2 hafta" },
      { hizmetAdi: "Formül revizyon hakkı (3 iterasyon)",        sure: "—" },
      { hizmetAdi: "Ham madde kaynak araştırması",               sure: "1 hafta" },
    ],
  },
  {
    bolum: "FASON", label: "Fason Üretim (Root Works)",
    kalemler: [
      { hizmetAdi: "Emülsiyon (krem/losyon) — karma + dolum",    sure: "Min. 500 adet" },
      { hizmetAdi: "Serum / jel dolum",                          sure: "Min. 500 adet" },
      { hizmetAdi: "Toz ürün (maske, pudra) dolum",              sure: "Min. 500 adet" },
      { hizmetAdi: "Şampuan / duş jeli dolum",                   sure: "Min. 1.000 adet" },
      { hizmetAdi: "Etiketleme (baskı dahil)",                   sure: "—" },
      { hizmetAdi: "Shrink / kutulama",                          sure: "—" },
      { hizmetAdi: "Ambalaj malzemesi temini",                   sure: "—" },
    ],
  },
  {
    bolum: "RUHSAT", label: "Ruhsatlandırma & Mevzuat (Root Regulation)",
    kalemler: [
      { hizmetAdi: "TİTCK ürün bildirimi (ürün başına)",         sure: "2–4 hafta" },
      { hizmetAdi: "Ürün Bilgi Dosyası (PIF) hazırlama",         sure: "1–2 hafta" },
      { hizmetAdi: "Güvenlik değerlendirmesi raporu",            sure: "2–3 hafta" },
      { hizmetAdi: "INCI listesi & etiket mevzuat kontrolü",     sure: "3–5 gün" },
      { hizmetAdi: "Responsible Person (RP) atama",              sure: "Sürekli" },
      { hizmetAdi: "ÜTS Firma Kayıt İşlemi",                    sure: "1–2 hafta" },
      { hizmetAdi: "Mesul Müdür Atama",                          sure: "1–2 hafta" },
      { hizmetAdi: "AB CPNP bildirimi",                          sure: "—" },
      { hizmetAdi: "GCC / Körfez ülkeleri mevzuat uyumu",        sure: "—" },
      { hizmetAdi: "Free Sale Certificate",                      sure: "—" },
      { hizmetAdi: "Halal sertifikasyon danışmanlığı",           sure: "—" },
    ],
  },
  {
    bolum: "TEST", label: "Test & Analiz (Cosmoliz by Root)",
    kalemler: [
      { hizmetAdi: "TAMC (Total Aerobic Microbial Count)",        sure: "5–7 gün" },
      { hizmetAdi: "TYMC (Total Yeast & Mold Count)",             sure: "5–7 gün" },
      { hizmetAdi: "Pseudomonas aeruginosa",                      sure: "7–10 gün" },
      { hizmetAdi: "Staphylococcus aureus",                       sure: "7–10 gün" },
      { hizmetAdi: "E. coli",                                     sure: "7–10 gün" },
      { hizmetAdi: "Candida albicans",                            sure: "7–10 gün" },
      { hizmetAdi: "PET (Preservative Efficacy Test)",            sure: "28 gün" },
      { hizmetAdi: "pH ölçümü",                                   sure: "1 gün" },
      { hizmetAdi: "Viskozite ölçümü",                            sure: "1 gün" },
      { hizmetAdi: "Yoğunluk tayini",                             sure: "1 gün" },
      { hizmetAdi: "Renk / koku / görünüm değerlendirmesi",       sure: "1 gün" },
      { hizmetAdi: "Hızlandırılmış stabilite (40°C / 3 ay)",      sure: "90 gün" },
      { hizmetAdi: "Gerçek zamanlı stabilite (25°C / 12 ay)",     sure: "365 gün" },
      { hizmetAdi: "Donma-çözünme döngüleri (5 çevrim)",          sure: "15 gün" },
      { hizmetAdi: "SPF testi (in vitro)",                         sure: "10–14 gün" },
      { hizmetAdi: "Cilt tahriş / duyarlılık testi (in vitro)",   sure: "7–14 gün" },
      { hizmetAdi: "Nem ölçümü (korneometre)",                     sure: "3–5 gün" },
      { hizmetAdi: "Ağır metal analizi (Pb, As, Hg, Cd)",         sure: "5–7 gün" },
      { hizmetAdi: "Paraben & koruyucu analizi (HPLC)",           sure: "5–7 gün" },
      { hizmetAdi: "Alerjen parfüm bileşenleri analizi",          sure: "7–10 gün" },
    ],
  },
  {
    bolum: "MARKA", label: "Marka & Tasarım (Root Branding)",
    kalemler: [
      { hizmetAdi: "Logo tasarımı (3 konsept + 2 revizyon)",      sure: "—" },
      { hizmetAdi: "Brand Guidelines (renk, font, kullanım)",     sure: "—" },
      { hizmetAdi: "Ambalaj tasarımı (ürün başına)",              sure: "—" },
      { hizmetAdi: "Etiket tasarımı & baskı hazırlığı",          sure: "—" },
      { hizmetAdi: "Ürün fotoğraf çekimi (10 ürün, stüdyo)",     sure: "—" },
      { hizmetAdi: "E-ticaret ürün sayfası tasarımı",            sure: "—" },
      { hizmetAdi: "Sosyal medya görselleri (20 adet)",          sure: "—" },
      { hizmetAdi: "Ürün içerik metni (TR + EN, ürün başına)",   sure: "—" },
      { hizmetAdi: "Lansman strateji danışmanlığı (2 saat)",     sure: "—" },
    ],
  },
];

function makeDefaultKalemler(): Kalem[] {
  let idx = 0;
  return DEFAULT_BOLUMLER.flatMap(b =>
    b.kalemler.map(k => ({
      _key:       String(idx++),
      bolum:      b.bolum,
      hizmetAdi:  k.hizmetAdi,
      sure:       k.sure,
      miktar:     "1",
      birimFiyat: "",
      paraBirimi: "TRY",
      iskonto:    "0",
      dahil:      false,
      notlar:     "",
      isCustom:   false,
    }))
  );
}

function emptyForm(): TeklifForm {
  return {
    musteriAdi: "", musteriEmail: "", musteriTelefon: "",
    markaAdi: "", urunKategorisi: "", skuSayisi: "", uretimMiktari: "", hedefPazar: "",
    odemeTuru: "", kdvOran: "20", genelIskonto: "0", notlar: "",
    kalemler: makeDefaultKalemler(),
  };
}

// ──────────────────────────────────────────────────────────────
// Formatters / Helpers
// ──────────────────────────────────────────────────────────────
function fmtTL(n: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2 }).format(n);
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("tr-TR");
}

function calcToplam(kalemler: Kalem[], genelIskonto: string, kdvOran: string): number {
  const ara = kalemler
    .filter(k => k.dahil)
    .reduce((s, k) => {
      const m = parseFloat(k.miktar)     || 1;
      const f = parseFloat(k.birimFiyat) || 0;
      const i = parseFloat(k.iskonto)    || 0;
      return s + m * f * (1 - i / 100);
    }, 0);
  const isk = parseFloat(genelIskonto) || 0;
  const kdv = parseFloat(kdvOran)      || 20;
  return ara * (1 - isk / 100) * (1 + kdv / 100);
}

const DURUM_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  Taslak:     { label: "Taslak",     color: "#6e6e73", bg: "#f5f5f7"  },
  Gönderildi: { label: "Gönderildi", color: "#0071e3", bg: "#e8f0fe"  },
  Onaylandı:  { label: "Onaylandı",  color: "#1a7f4b", bg: "#e6f6ee"  },
  Reddedildi: { label: "Reddedildi", color: "#c0392b", bg: "#fdecea"  },
};
const DURUM_KEYS = Object.keys(DURUM_LABELS);
const WIZARD_STEPS = [
  "Müşteri & Proje",
  "Formülasyon",
  "Fason Üretim",
  "Ruhsatlandırma",
  "Test & Analiz",
  "Marka & Tasarım",
  "Ödeme & Notlar",
  "Özet",
];

// ──────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────
export default function RootKozTeklifListesi() {
  // List state
  const [data,       setData]       = useState<Teklif[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [page,       setPage]       = useState(1);
  const [limit,      setLimit]      = useState(20);
  const [total,      setTotal]      = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Modal state
  const [modalOpen,   setModalOpen]   = useState(false);
  const [modalMode,   setModalMode]   = useState<"add" | "edit">("add");
  const [editId,      setEditId]      = useState<number | null>(null);
  const [wizardStep,  setWizardStep]  = useState(0);
  const [form,        setForm]        = useState<TeklifForm>(emptyForm());
  const [saving,      setSaving]      = useState(false);
  const [saveErr,     setSaveErr]     = useState("");

  // Status dropdown
  const [durumMenuId, setDurumMenuId] = useState<number | null>(null);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  // Mail modal
  const [mailTarget,  setMailTarget]  = useState<Teklif | null>(null);
  const [mailTo,      setMailTo]      = useState<string[]>([]);
  const [mailCC,      setMailCC]      = useState<string[]>([]);
  const [mailToInput, setMailToInput] = useState("");
  const [mailCCInput, setMailCCInput] = useState("");
  const [mailKonu,    setMailKonu]    = useState("");
  const [mailSending, setMailSending] = useState(false);
  const [mailErr,     setMailErr]     = useState("");
  const [mailOk,      setMailOk]      = useState(false);

  // ── Fetch ──────────────────────────────────────────────────
  const fetchData = useCallback(async (s: string, p: number, l: number) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/root-koz-teklif?search=${encodeURIComponent(s)}&page=${p}&limit=${l}`);
      const j = await r.json();
      setData(j.data || []);
      setTotal(j.total || 0);
      setTotalPages(j.totalPages || 1);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(search, page, limit);
  }, [page, limit, fetchData]); // eslint-disable-line

  const handleSearch = (v: string) => {
    setSearch(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchData(v, 1, limit);
    }, 350);
  };

  // ── Open add modal ─────────────────────────────────────────
  const openAdd = () => {
    setForm(emptyForm());
    setModalMode("add");
    setEditId(null);
    setWizardStep(0);
    setSaveErr("");
    setModalOpen(true);
  };

  // ── Open edit modal ────────────────────────────────────────
  const openEdit = async (id: number) => {
    const r = await fetch(`/api/root-koz-teklif/${id}`);
    const j = await r.json();
    const defaultKeySet = new Set(makeDefaultKalemler().map(k => k.bolum + "||" + k.hizmetAdi));
    const kalemler: Kalem[] = (j.kalemler || []).map((k: any, i: number) => {
      const compositeKey = `${k.Bolum || ""}||${k.HizmetAdi || ""}`;
      return {
        _key:       String(i),
        bolum:      k.Bolum      || "",
        hizmetAdi:  k.HizmetAdi  || "",
        sure:       k.Sure       || "",
        miktar:     String(k.Miktar     ?? "1"),
        birimFiyat: String(k.BirimFiyat ?? ""),
        paraBirimi: k.ParaBirimi || "TRY",
        iskonto:    String(k.Iskonto    ?? "0"),
        dahil:      !!k.Dahil,
        notlar:     k.Notlar || "",
        isCustom:   !defaultKeySet.has(compositeKey),
      };
    });
    // Merge with defaults (yeni eklenen default satırları DB'de yoksa ekle)
    const existingKeys = new Set(kalemler.map(k => k.bolum + "||" + k.hizmetAdi));
    const defaults = makeDefaultKalemler();
    const merged = [
      ...kalemler,
      ...defaults.filter(d => !existingKeys.has(d.bolum + "||" + d.hizmetAdi)),
    ];

    setForm({
      musteriAdi:     j.MusteriAdi     || "",
      musteriEmail:   j.MusteriEmail   || "",
      musteriTelefon: j.MusteriTelefon || "",
      markaAdi:       j.MarkaAdi       || "",
      urunKategorisi: j.UrunKategorisi || "",
      skuSayisi:      String(j.SKUSayisi ?? ""),
      uretimMiktari:  j.UretimMiktari  || "",
      hedefPazar:     j.HedefPazar     || "",
      odemeTuru:      j.OdemeTuru      || "",
      kdvOran:        String(j.KDVOran       ?? "20"),
      genelIskonto:   String(j.GenelIskonto  ?? "0"),
      notlar:         j.Notlar         || "",
      kalemler:       merged,
    });
    setModalMode("edit");
    setEditId(id);
    setWizardStep(0);
    setSaveErr("");
    setModalOpen(true);
  };

  // ── Save ───────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setSaveErr("");
    try {
      const payload = {
        musteriAdi:     form.musteriAdi,
        musteriEmail:   form.musteriEmail,
        musteriTelefon: form.musteriTelefon,
        markaAdi:       form.markaAdi,
        urunKategorisi: form.urunKategorisi,
        skuSayisi:      form.skuSayisi,
        uretimMiktari:  form.uretimMiktari,
        hedefPazar:     form.hedefPazar,
        odemeTuru:      form.odemeTuru,
        kdvOran:        form.kdvOran,
        genelIskonto:   form.genelIskonto,
        notlar:         form.notlar,
        kalemler:       form.kalemler,
      };
      const url    = modalMode === "edit" ? `/api/root-koz-teklif/${editId}` : "/api/root-koz-teklif";
      const method = modalMode === "edit" ? "PUT" : "POST";
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) {
        let errMsg = "Kayıt hatası";
        try { const j = await r.json(); errMsg = j.error || errMsg; } catch { /* boş yanıt */ }
        throw new Error(errMsg);
      }
      setModalOpen(false);
      fetchData(search, page, limit);
    } catch (e: any) {
      setSaveErr(e.message || "Bir hata oluştu");
    } finally {
      setSaving(false);
    }
  };

  // ── Durum değiştir ─────────────────────────────────────────
  const changeDurum = async (id: number, durum: string) => {
    setDurumMenuId(null);
    await fetch(`/api/root-koz-teklif/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durum }),
    });
    fetchData(search, page, limit);
  };

  // ── Sil ───────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    await fetch(`/api/root-koz-teklif/${deleteTarget}`, { method: "DELETE" });
    setDeleteTarget(null);
    fetchData(search, page, limit);
  };

  // ── Mail gönder ────────────────────────────────────────────
  const openMail = (row: Teklif) => {
    setMailTarget(row);
    setMailTo(row.MusteriEmail ? [row.MusteriEmail] : []);
    setMailCC([]);
    setMailToInput(""); setMailCCInput("");
    setMailKonu(`Root Kozmetik Teklif — ${row.TeklifNo} — ${row.MusteriAdi}`);
    setMailErr(""); setMailOk(false); setMailSending(false);
  };

  const addMailTag = (type: "to" | "cc", val: string) => {
    const email = val.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    if (type === "to") { if (!mailTo.includes(email)) setMailTo(p => [...p, email]); setMailToInput(""); }
    else               { if (!mailCC.includes(email)) setMailCC(p => [...p, email]); setMailCCInput(""); }
  };

  const sendMail = async () => {
    if (!mailTarget || !mailTo.length) return;
    setMailSending(true); setMailErr(""); setMailOk(false);
    try {
      const r = await fetch(`/api/root-koz-teklif/${mailTarget.ID}/mail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: mailTo, cc: mailCC, konu: mailKonu }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Gönderim hatası");
      setMailOk(true);
      fetchData(search, page, limit);
    } catch (e: any) {
      setMailErr(e.message);
    } finally {
      setMailSending(false);
    }
  };

  // ── Kalem helpers ─────────────────────────────────────────
  const updateKalem = (key: string, field: keyof Kalem, value: string | boolean) => {
    setForm(f => ({
      ...f,
      kalemler: f.kalemler.map(k => k._key === key ? { ...k, [field]: value } : k),
    }));
  };

  const toggleAllInBolum = (bolum: string, checked: boolean) => {
    setForm(f => ({
      ...f,
      kalemler: f.kalemler.map(k => k.bolum === bolum ? { ...k, dahil: checked } : k),
    }));
  };

  const addCustomKalem = (bolum: string) => {
    const newKey = `custom_${Date.now()}`;
    setForm(f => ({
      ...f,
      kalemler: [...f.kalemler, {
        _key: newKey, bolum,
        hizmetAdi: "", sure: "",
        miktar: "1", birimFiyat: "", paraBirimi: "TRY",
        iskonto: "0", dahil: true, notlar: "", isCustom: true,
      }],
    }));
  };

  const removeKalem = (key: string) => {
    setForm(f => ({ ...f, kalemler: f.kalemler.filter(k => k._key !== key) }));
  };

  // ── Copy teklif ───────────────────────────────────────────────
  const [copying, setCopying] = useState<number | null>(null);

  const handleCopy = async (id: number) => {
    setCopying(id);
    try {
      const r = await fetch(`/api/root-koz-teklif/${id}/copy`, { method: "POST" });
      if (!r.ok) throw new Error("Kopyalama hatası");
      fetchData(search, page, limit);
    } catch {
      // silent
    } finally {
      setCopying(null);
    }
  };

  // ── Pagination helper ─────────────────────────────────────────
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

  // ── Wizard step content ────────────────────────────────────
  const renderWizardStep = () => {
    // Step 0: Müşteri & Proje
    if (wizardStep === 0) return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={labelStyle}>
            Müşteri Adı *
            <input style={inputStyle} value={form.musteriAdi}
              onChange={e => setForm(f => ({ ...f, musteriAdi: e.target.value }))} placeholder="Ad Soyad / Firma" />
          </label>
          <label style={labelStyle}>
            E-posta
            <input style={inputStyle} type="email" value={form.musteriEmail}
              onChange={e => setForm(f => ({ ...f, musteriEmail: e.target.value }))} placeholder="ornek@firma.com" />
          </label>
          <label style={labelStyle}>
            Telefon
            <input style={inputStyle} value={form.musteriTelefon}
              onChange={e => setForm(f => ({ ...f, musteriTelefon: e.target.value }))} placeholder="+90 5xx xxx xx xx" />
          </label>
          <label style={labelStyle}>
            Marka Adı
            <input style={inputStyle} value={form.markaAdi}
              onChange={e => setForm(f => ({ ...f, markaAdi: e.target.value }))} placeholder="Marka adı" />
          </label>
          <label style={labelStyle}>
            Ürün Kategorisi
            <input style={inputStyle} value={form.urunKategorisi}
              onChange={e => setForm(f => ({ ...f, urunKategorisi: e.target.value }))} placeholder="Nemlendirici Krem, Serum..." />
          </label>
          <label style={labelStyle}>
            SKU Sayısı
            <input style={inputStyle} type="number" min="1" value={form.skuSayisi}
              onChange={e => setForm(f => ({ ...f, skuSayisi: e.target.value }))} placeholder="2" />
          </label>
          <label style={labelStyle}>
            Üretim Miktarı
            <input style={inputStyle} value={form.uretimMiktari}
              onChange={e => setForm(f => ({ ...f, uretimMiktari: e.target.value }))} placeholder="100 adet/SKU" />
          </label>
          <label style={labelStyle}>
            Hedef Pazar
            <input style={inputStyle} value={form.hedefPazar}
              onChange={e => setForm(f => ({ ...f, hedefPazar: e.target.value }))} placeholder="Yurt içi, AB, GCC..." />
          </label>
        </div>
      </div>
    );

    // Steps 1-5: Hizmet bölümleri
    const bolumIdx  = wizardStep - 1; // 1→0, 2→1, ...5→4
    if (wizardStep >= 1 && wizardStep <= 5) {
      const bolumDef  = DEFAULT_BOLUMLER[bolumIdx];
      const kalemler  = form.kalemler.filter(k => k.bolum === bolumDef.bolum);
      const allChecked = kalemler.every(k => k.dahil);
      const anyChecked = kalemler.some(k => k.dahil);

      return (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <input type="checkbox" id="all-check"
              checked={allChecked} ref={el => { if (el) el.indeterminate = !allChecked && anyChecked; }}
              onChange={e => toggleAllInBolum(bolumDef.bolum, e.target.checked)}
              style={{ width: 16, height: 16, cursor: "pointer" }} />
            <label htmlFor="all-check" style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f", cursor: "pointer" }}>
              {bolumDef.label} — Tümünü seç / kaldır
            </label>
          </div>
          <div style={{ border: "1px solid #e5e5ea", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f5f5f7" }}>
                  <th style={{ ...thStyle, width: 36 }}></th>
                  <th style={{ ...thStyle, textAlign: "left" }}>Hizmet</th>
                  <th style={{ ...thStyle, width: 110 }}>Süre</th>
                  <th style={{ ...thStyle, width: 72 }}>Miktar</th>
                  <th style={{ ...thStyle, width: 120 }}>Birim Fiyat</th>
                  <th style={{ ...thStyle, width: 64 }}>Para B.</th>
                  <th style={{ ...thStyle, width: 64 }}>İsk.%</th>
                  <th style={{ ...thStyle, width: 32 }}></th>
                </tr>
              </thead>
              <tbody>
                {kalemler.map(k => (
                  <tr key={k._key} style={{ background: k.dahil ? "#fff" : "#fafafa", opacity: k.dahil ? 1 : 0.6 }}>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <input type="checkbox" checked={k.dahil}
                        onChange={e => updateKalem(k._key, "dahil", e.target.checked)}
                        style={{ width: 14, height: 14, cursor: "pointer" }} />
                    </td>
                    <td style={{ ...tdStyle }}>
                      {k.isCustom ? (
                        <input style={{ ...cellInputStyle, width: "100%", minWidth: 160 }}
                          value={k.hizmetAdi} placeholder="Hizmet adı girin..."
                          onChange={e => updateKalem(k._key, "hizmetAdi", e.target.value)} />
                      ) : (
                        <span style={{ fontWeight: k.dahil ? 500 : 400 }}>{k.hizmetAdi}</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      {k.isCustom ? (
                        <input style={{ ...cellInputStyle, width: 90 }}
                          value={k.sure} placeholder="Süre..."
                          onChange={e => updateKalem(k._key, "sure", e.target.value)} />
                      ) : (
                        <span style={{ color: "#515154" }}>{k.sure}</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle }}>
                      <input style={{ ...cellInputStyle, width: 60 }} type="number" min="0" step="0.01"
                        value={k.miktar} disabled={!k.dahil}
                        onChange={e => updateKalem(k._key, "miktar", e.target.value)} />
                    </td>
                    <td style={{ ...tdStyle }}>
                      <input style={{ ...cellInputStyle, width: 108 }} type="number" min="0" step="0.01"
                        value={k.birimFiyat} disabled={!k.dahil} placeholder="0.00"
                        onChange={e => updateKalem(k._key, "birimFiyat", e.target.value)} />
                    </td>
                    <td style={{ ...tdStyle }}>
                      <select style={{ ...cellInputStyle, width: 58, paddingLeft: 4 }}
                        value={k.paraBirimi} disabled={!k.dahil}
                        onChange={e => updateKalem(k._key, "paraBirimi", e.target.value)}>
                        <option>TRY</option>
                        <option>USD</option>
                        <option>EUR</option>
                      </select>
                    </td>
                    <td style={{ ...tdStyle }}>
                      <input style={{ ...cellInputStyle, width: 56 }} type="number" min="0" max="100" step="0.1"
                        value={k.iskonto} disabled={!k.dahil}
                        onChange={e => updateKalem(k._key, "iskonto", e.target.value)} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      {k.isCustom && (
                        <button onClick={() => removeKalem(k._key)} title="Satırı sil"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#ff3b30", fontSize: 16, lineHeight: 1, padding: 2 }}>
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Manuel kalem ekleme */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
            <button onClick={() => addCustomKalem(bolumDef.bolum)}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px dashed #0071e3", borderRadius: 8, padding: "5px 14px", fontSize: 12, color: "#0071e3", cursor: "pointer", fontWeight: 500 }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Manuel kalem ekle
            </button>
            <span style={{ fontSize: 11, color: "#86868b" }}>
              İşaretli hizmetler teklife dahil edilir · Fiyat sonra da girilebilir
            </span>
          </div>
        </div>
      );
    }

    // Step 6: Ödeme & Notlar
    if (wizardStep === 6) {
      const dahilKalemler = form.kalemler.filter(k => k.dahil);
      const ara = dahilKalemler.reduce((s, k) => {
        return s + (parseFloat(k.miktar)||1)*(parseFloat(k.birimFiyat)||0)*(1-(parseFloat(k.iskonto)||0)/100);
      }, 0);
      const gIsk   = parseFloat(form.genelIskonto) || 0;
      const iskSon = ara * (1 - gIsk / 100);
      const kdvOr  = parseFloat(form.kdvOran) || 20;
      const kdv    = iskSon * kdvOr / 100;
      const toplam = iskSon + kdv;

      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <label style={labelStyle}>
              KDV Oranı (%)
              <input style={inputStyle} type="number" min="0" max="100"
                value={form.kdvOran}
                onChange={e => setForm(f => ({ ...f, kdvOran: e.target.value }))} />
            </label>
            <label style={labelStyle}>
              Genel İskonto (%)
              <input style={inputStyle} type="number" min="0" max="100"
                value={form.genelIskonto}
                onChange={e => setForm(f => ({ ...f, genelIskonto: e.target.value }))} />
            </label>
          </div>

          <div>
            <label style={{ ...labelStyle, marginBottom: 6 }}>Ödeme Planı</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {["Tek ödeme (%3 nakit indirimi)", "2 taksit — %50 peşin, %50 teslimde", "3 taksit — %40 peşin, %30+%30 aşamalı", "Aylık abonelik (RP, danışmanlık vb.)"].map(opt => (
                <label key={opt} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                  <input type="radio" name="odeme" value={opt}
                    checked={form.odemeTuru === opt}
                    onChange={e => setForm(f => ({ ...f, odemeTuru: e.target.value }))} />
                  {opt}
                </label>
              ))}
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="radio" name="odeme" value={form.odemeTuru && !["Tek ödeme (%3 nakit indirimi)", "2 taksit — %50 peşin, %50 teslimde", "3 taksit — %40 peşin, %30+%30 aşamalı", "Aylık abonelik (RP, danışmanlık vb.)"].includes(form.odemeTuru) ? form.odemeTuru : ""}
                  checked={!!form.odemeTuru && !["Tek ödeme (%3 nakit indirimi)", "2 taksit — %50 peşin, %50 teslimde", "3 taksit — %40 peşin, %30+%30 aşamalı", "Aylık abonelik (RP, danışmanlık vb.)"].includes(form.odemeTuru)}
                  onChange={() => {}} />
                Diğer:
                <input style={{ ...inputStyle, flex: 1, marginTop: 0 }} placeholder="Özel ödeme planı..."
                  value={["Tek ödeme (%3 nakit indirimi)", "2 taksit — %50 peşin, %50 teslimde", "3 taksit — %40 peşin, %30+%30 aşamalı", "Aylık abonelik (RP, danışmanlık vb.)"].includes(form.odemeTuru) ? "" : form.odemeTuru}
                  onChange={e => setForm(f => ({ ...f, odemeTuru: e.target.value }))} />
              </label>
            </div>
          </div>

          <label style={labelStyle}>
            Notlar
            <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
              value={form.notlar}
              onChange={e => setForm(f => ({ ...f, notlar: e.target.value }))}
              placeholder="Teklife ait özel notlar..." />
          </label>

          {/* Mini özet */}
          <div style={{ background: "#f5f5f7", borderRadius: 10, padding: "14px 18px" }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#515154", marginBottom: 8 }}>Fiyat Özeti</p>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
              <span style={{ color: "#515154" }}>Ara Toplam</span>
              <span>{fmtTL(ara)}</span>
            </div>
            {gIsk > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: "#515154" }}>İskonto (%{gIsk})</span>
                <span style={{ color: "#e53935" }}>-{fmtTL(ara - iskSon)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: "#515154" }}>KDV (%{kdvOr})</span>
              <span>{fmtTL(kdv)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, borderTop: "2px solid #0071e3", paddingTop: 8, color: "#0071e3" }}>
              <span>TOPLAM</span>
              <span>{fmtTL(toplam)}</span>
            </div>
          </div>
        </div>
      );
    }

    // Step 7: Özet
    const dahilKalemler = form.kalemler.filter(k => k.dahil);
    const ara = dahilKalemler.reduce((s, k) => {
      return s + (parseFloat(k.miktar)||1)*(parseFloat(k.birimFiyat)||0)*(1-(parseFloat(k.iskonto)||0)/100);
    }, 0);
    const gIsk   = parseFloat(form.genelIskonto) || 0;
    const kdvOr  = parseFloat(form.kdvOran) || 20;
    const iskSon = ara * (1 - gIsk / 100);
    const kdv    = iskSon * kdvOr / 100;
    const toplam = iskSon + kdv;

    const grouped: Record<string, Kalem[]> = {};
    for (const k of dahilKalemler) {
      if (!grouped[k.bolum]) grouped[k.bolum] = [];
      grouped[k.bolum].push(k);
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Müşteri & Proje bilgisi */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, background: "#e5e5ea", border: "1px solid #e5e5ea", borderRadius: 10, overflow: "hidden" }}>
          {[
            ["Müşteri", form.musteriAdi],
            ["Marka", form.markaAdi],
            ["Kategori", form.urunKategorisi],
            ["SKU", form.skuSayisi ? `${form.skuSayisi} SKU · ${form.uretimMiktari}` : "—"],
          ].map(([l, v]) => (
            <div key={l} style={{ background: "#fafafa", padding: "10px 14px" }}>
              <div style={{ fontSize: 10, color: "#86868b", textTransform: "uppercase", letterSpacing: ".5px" }}>{l}</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{v || "—"}</div>
            </div>
          ))}
        </div>

        {/* Dahil hizmetler */}
        {Object.entries(grouped).map(([bolum, items]) => {
          const def = DEFAULT_BOLUMLER.find(b => b.bolum === bolum);
          return (
            <div key={bolum}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#0071e3", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 6 }}>
                {def?.label || bolum}
              </p>
              <div style={{ border: "1px solid #e5e5ea", borderRadius: 8, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <tbody>
                    {items.map(k => {
                      const net = (parseFloat(k.miktar)||1)*(parseFloat(k.birimFiyat)||0)*(1-(parseFloat(k.iskonto)||0)/100);
                      return (
                        <tr key={k._key} style={{ borderBottom: "1px solid #f2f2f7" }}>
                          <td style={{ padding: "7px 12px" }}>{k.hizmetAdi}</td>
                          <td style={{ padding: "7px 12px", color: "#515154", width: 100, textAlign: "center" }}>{k.sure}</td>
                          <td style={{ padding: "7px 12px", textAlign: "right", width: 130, fontWeight: 600 }}>
                            {k.birimFiyat ? fmtTL(net) : <span style={{ color: "#86868b" }}>Fiyat girilmedi</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {dahilKalemler.length === 0 && (
          <p style={{ color: "#86868b", fontSize: 13, textAlign: "center", padding: 24 }}>
            Henüz hiçbir hizmet seçilmedi. Geri dönerek hizmetleri işaretleyin.
          </p>
        )}

        {/* Toplam */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <div style={{ minWidth: 260 }}>
            {gIsk > 0 && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: "#515154" }}>Ara Toplam</span><span>{fmtTL(ara)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: "#515154" }}>İskonto (%{gIsk})</span>
                  <span style={{ color: "#e53935" }}>-{fmtTL(ara - iskSon)}</span>
                </div>
              </>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: "#515154" }}>KDV (%{kdvOr})</span><span>{fmtTL(kdv)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 700, borderTop: "2px solid #0071e3", paddingTop: 10, color: "#0071e3" }}>
              <span>TOPLAM</span><span>{fmtTL(toplam)}</span>
            </div>
          </div>
        </div>

        {saveErr && <p style={{ color: "#e53935", fontSize: 13 }}>{saveErr}</p>}
      </div>
    );
  };

  // ──────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Root Kozmetik — Teklif Listesi</h1>

      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchBox}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="9" r="7" /><path d="M16 16l-3-3" />
            </svg>
            <input
              className={styles.searchInput}
              placeholder="Müşteri, marka, teklif no..."
              value={search}
              onChange={e => handleSearch(e.target.value)}
            />
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

      {/* ── Tablo ── */}
      <div className={styles.tableCard}>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 150 }}>Teklif No</th>
                <th style={{ width: 90 }}>Tarih</th>
                <th>Müşteri</th>
                <th>Marka</th>
                <th style={{ width: 80, textAlign: "center" }}>Hizmet</th>
                <th style={{ width: 130, textAlign: "right" }}>Toplam</th>
                <th style={{ width: 120, textAlign: "center" }}>Durum</th>
                <th style={{ width: 160 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 8 }).map((_, j) => (
                      <td key={j}><div className={styles.skeleton} style={{ height: 14 }} /></td>
                    ))}</tr>
                  ))
                : data.length === 0
                  ? <tr><td colSpan={8} className={styles.empty}>
                      {search ? "Arama sonucu bulunamadı." : "Henüz teklif oluşturulmamış."}
                    </td></tr>
                  : data.map(row => {
                      const durumCfg = DURUM_LABELS[row.Durum] ?? DURUM_LABELS.Taslak;
                      return (
                        <tr key={row.ID}>
                          <td style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{row.TeklifNo}</td>
                          <td style={{ color: "#515154" }}>{fmtDate(row.Tarih)}</td>
                          <td>{row.MusteriAdi || "—"}</td>
                          <td>{row.MarkaAdi || "—"}</td>
                          <td style={{ textAlign: "center" }}>
                            <span style={{ background: "#e8f4fd", color: "#0071e3", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>
                              {row.DahilKalemSayisi}
                            </span>
                          </td>
                          <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                            {fmtTL(row.ToplamTutar)}
                          </td>
                          {/* Durum — tıklanabilir */}
                          <td style={{ textAlign: "center", position: "relative" }}>
                            <button
                              onClick={() => setDurumMenuId(durumMenuId === row.ID ? null : row.ID)}
                              style={{
                                background: durumCfg.bg, color: durumCfg.color,
                                border: "none", borderRadius: 20, padding: "3px 12px",
                                fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                              }}>
                              {durumCfg.label} ▾
                            </button>
                            {durumMenuId === row.ID && (
                              <div style={{
                                position: "absolute", top: "calc(100% + 4px)", left: "50%",
                                transform: "translateX(-50%)", zIndex: 50,
                                background: "#fff", border: "1px solid #e5e5ea",
                                borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.12)",
                                minWidth: 150, overflow: "hidden",
                              }}>
                                {DURUM_KEYS.map(k => {
                                  const cfg = DURUM_LABELS[k];
                                  return (
                                    <button key={k} onMouseDown={() => changeDurum(row.ID, k)}
                                      style={{
                                        display: "block", width: "100%", padding: "9px 14px",
                                        textAlign: "left", background: "none", border: "none",
                                        fontSize: 13, cursor: "pointer",
                                        color: k === row.Durum ? cfg.color : "#1d1d1f",
                                        fontWeight: k === row.Durum ? 700 : 400,
                                      }}>
                                      {cfg.label}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                          {/* Aksiyonlar */}
                          <td>
                            <div style={{ display: "flex", gap: 3, justifyContent: "flex-end" }}>
                              <button className={styles.editBtn} title="Düzenle" onClick={() => openEdit(row.ID)}>✏️</button>
                              <button className={styles.editBtn} title="Kopyala"
                                onClick={() => handleCopy(row.ID)}
                                disabled={copying === row.ID}
                                style={{ opacity: copying === row.ID ? 0.5 : 1 }}>📋</button>
                              <button className={styles.editBtn} title="Mail gönder" onClick={() => openMail(row)}>✉️</button>
                              <button className={styles.editBtn} title="Yazdır / PDF"
                                onClick={() => window.open(`/api/root-koz-teklif/${row.ID}/export`, "_blank")}>🖨️</button>
                              <button className={styles.deleteBtn} title="Sil" onClick={() => setDeleteTarget(row.ID)}>🗑</button>
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

      {/* ── Sayfalama ── */}
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

      {/* ─────────────────────────────────────────────────────
          WIZARD MODAL
      ───────────────────────────────────────────────────── */}
      {modalOpen && (
        <div style={overlay} onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div style={{ background: "#fff", borderRadius: 18, width: "min(95vw, 860px)", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,.18)" }}>
            {/* Modal header */}
            <div style={{ padding: "22px 28px 16px", borderBottom: "1px solid #e5e5ea", flexShrink: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1d1d1f" }}>
                  {modalMode === "add" ? "Yeni Root Kozmetik Teklifi" : "Teklifi Düzenle"}
                </h2>
                <button onClick={() => setModalOpen(false)}
                  style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#515154" }}>✕</button>
              </div>
              {/* Step indicator */}
              <div style={{ display: "flex", gap: 0, overflowX: "auto" }}>
                {WIZARD_STEPS.map((label, i) => (
                  <button key={i} onClick={() => setWizardStep(i)}
                    style={{
                      flex: "0 0 auto",
                      padding: "6px 12px",
                      fontSize: 12,
                      fontWeight: i === wizardStep ? 700 : 400,
                      color: i === wizardStep ? "#0071e3" : i < wizardStep ? "#30d158" : "#86868b",
                      background: "none",
                      border: "none",
                      borderBottom: i === wizardStep ? "2px solid #0071e3" : "2px solid transparent",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}>
                    {i < wizardStep ? "✓ " : ""}{i + 1}. {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Step content */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
              {renderWizardStep()}
            </div>

            {/* Footer */}
            <div style={{ padding: "14px 28px", borderTop: "1px solid #e5e5ea", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <button onClick={() => setWizardStep(s => Math.max(0, s - 1))} disabled={wizardStep === 0}
                style={{ background: "#f5f5f7", border: "1px solid #e5e5ea", borderRadius: 8, padding: "8px 18px", fontSize: 14, cursor: wizardStep === 0 ? "not-allowed" : "pointer", color: "#1d1d1f", opacity: wizardStep === 0 ? .4 : 1 }}>
                ← Geri
              </button>
              <div style={{ display: "flex", gap: 10 }}>
                {saveErr && <span style={{ color: "#e53935", fontSize: 13 }}>{saveErr}</span>}
                {wizardStep < WIZARD_STEPS.length - 1
                  ? <button onClick={() => setWizardStep(s => s + 1)}
                      style={{ background: "#0071e3", color: "#fff", border: "none", borderRadius: 8, padding: "8px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                      İleri →
                    </button>
                  : <button onClick={handleSave} disabled={saving}
                      style={{ background: "#0071e3", color: "#fff", border: "none", borderRadius: 8, padding: "8px 22px", fontSize: 14, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? .7 : 1 }}>
                      {saving ? "Kaydediliyor…" : modalMode === "edit" ? "Güncelle" : "Kaydet"}
                    </button>
                }
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────
          MAIL MODAL
      ───────────────────────────────────────────────────── */}
      {mailTarget && (
        <div style={overlay} onClick={e => { if (e.target === e.currentTarget) setMailTarget(null); }}>
          <div style={{ background: "#fff", borderRadius: 18, width: "min(92vw, 560px)", padding: "28px", boxShadow: "0 24px 80px rgba(0,0,0,.18)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700 }}>Teklif Gönder — {mailTarget.TeklifNo}</h2>
              <button onClick={() => setMailTarget(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#515154" }}>✕</button>
            </div>

            {mailOk ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <p style={{ fontSize: 15, fontWeight: 600, color: "#30d158" }}>Teklif başarıyla gönderildi!</p>
                <button onClick={() => setMailTarget(null)}
                  style={{ marginTop: 20, background: "#f5f5f7", border: "1px solid #e5e5ea", borderRadius: 8, padding: "8px 20px", cursor: "pointer" }}>Kapat</button>
              </div>
            ) : (
              <>
                <label style={labelStyle}>
                  Konu
                  <input style={inputStyle} value={mailKonu} onChange={e => setMailKonu(e.target.value)} />
                </label>

                <label style={labelStyle}>
                  Alıcılar (To)
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, border: "1px solid #d2d2d7", borderRadius: 8, padding: 8, minHeight: 40 }}>
                    {mailTo.map(e => (
                      <span key={e} style={{ background: "#e8f4fd", color: "#0071e3", borderRadius: 20, padding: "2px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                        {e} <button onClick={() => setMailTo(p => p.filter(x => x !== e))} style={{ background: "none", border: "none", cursor: "pointer", color: "#0071e3", padding: 0, lineHeight: 1 }}>×</button>
                      </span>
                    ))}
                    <input value={mailToInput} onChange={e => setMailToInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addMailTag("to", mailToInput); } }}
                      placeholder="Enter ile ekle" style={{ border: "none", outline: "none", fontSize: 13, minWidth: 160, flex: 1 }} />
                  </div>
                </label>

                <label style={labelStyle}>
                  CC
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, border: "1px solid #d2d2d7", borderRadius: 8, padding: 8, minHeight: 40 }}>
                    {mailCC.map(e => (
                      <span key={e} style={{ background: "#f5f5f7", color: "#515154", borderRadius: 20, padding: "2px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                        {e} <button onClick={() => setMailCC(p => p.filter(x => x !== e))} style={{ background: "none", border: "none", cursor: "pointer", color: "#515154", padding: 0 }}>×</button>
                      </span>
                    ))}
                    <input value={mailCCInput} onChange={e => setMailCCInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addMailTag("cc", mailCCInput); } }}
                      placeholder="Enter ile ekle" style={{ border: "none", outline: "none", fontSize: 13, minWidth: 160, flex: 1 }} />
                  </div>
                </label>

                {mailErr && <p style={{ color: "#e53935", fontSize: 13, margin: "8px 0" }}>{mailErr}</p>}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
                  <button onClick={() => setMailTarget(null)}
                    style={{ background: "#f5f5f7", border: "1px solid #e5e5ea", borderRadius: 8, padding: "8px 18px", cursor: "pointer" }}>İptal</button>
                  <button onClick={sendMail} disabled={mailSending || !mailTo.length}
                    style={{ background: "#0071e3", color: "#fff", border: "none", borderRadius: 8, padding: "8px 22px", fontWeight: 600, cursor: (mailSending || !mailTo.length) ? "not-allowed" : "pointer", opacity: (mailSending || !mailTo.length) ? .7 : 1 }}>
                    {mailSending ? "Gönderiliyor…" : "Gönder"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Silme onayı ── */}
      {deleteTarget && (
        <div style={overlay}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: "min(90vw, 380px)", boxShadow: "0 20px 60px rgba(0,0,0,.18)" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Teklifi Sil</h3>
            <p style={{ fontSize: 14, color: "#515154", marginBottom: 20 }}>Bu teklif silinecek. Bu işlem geri alınamaz.</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setDeleteTarget(null)}
                style={{ background: "#f5f5f7", border: "1px solid #e5e5ea", borderRadius: 8, padding: "8px 18px", cursor: "pointer" }}>İptal</button>
              <button onClick={handleDelete}
                style={{ background: "#ff3b30", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 600, cursor: "pointer" }}>Sil</button>
            </div>
          </div>
        </div>
      )}

      {/* Durum dropdown kapatma */}
      {durumMenuId !== null && (
        <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setDurumMenuId(null)} />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Style constants
// ──────────────────────────────────────────────────────────────
const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", backdropFilter: "blur(4px)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
};
const labelStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 5, fontSize: 13, fontWeight: 500, color: "#1d1d1f",
};
const inputStyle: React.CSSProperties = {
  border: "1px solid #d2d2d7", borderRadius: 8, padding: "8px 12px", fontSize: 14,
  outline: "none", fontFamily: "inherit", marginTop: 2, background: "#fff",
};
const cellInputStyle: React.CSSProperties = {
  border: "1px solid #e5e5ea", borderRadius: 6, padding: "4px 6px", fontSize: 12,
  outline: "none", fontFamily: "inherit", background: "#fff",
};
const thStyle: React.CSSProperties = {
  padding: "9px 12px", fontSize: 11, fontWeight: 700, color: "#515154",
  textTransform: "uppercase", letterSpacing: ".4px", textAlign: "left", borderBottom: "1px solid #e5e5ea",
};
const tdStyle: React.CSSProperties = {
  padding: "7px 12px", fontSize: 12, borderBottom: "1px solid #f2f2f7", verticalAlign: "middle",
};
