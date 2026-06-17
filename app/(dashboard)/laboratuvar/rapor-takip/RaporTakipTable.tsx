"use client";

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import type { BilesenSonuc } from "@/lib/altParametre";
import { useRouter } from "next/navigation";
import styles from "@/app/styles/table.module.css";

// ── Tipler ──────────────────────────────────────────────────────────────────

interface RaporRow {
  NkrID: number;
  Tarih: string | null;
  Evrak_No: string;
  RaporNo: string;
  Barkod?: string | null;
  Numune_Adi: string;
  FirmaAd: string | null;
  ProjeAd: string | null;
  RaporFormati: string;
  RaporDurumu: "Bekliyor" | "Analiz Devam Ediyor" | "Onay Bekleniyor" | "Onaylandı" | "Yayınlandı" | "Geri Gönderildi";
  MaxTermin: string | null;
  HizmetSayisi: number;
  SonucluSayisi: number;
  /** Geri Gönderildi durumdaysa: onaylayan kullanıcının yazdığı not */
  GeriGonderNotu?: string | null;
}

interface HizmetDetay {
  X1ID: number;
  AnalizID: number;
  Kod: string | null;
  Ad: string | null;
  Akreditasyon: string | null;
  Metot: string | null;
  Birim: string | null;
  BirimEn: string;
  LimitDeger: string | null;
  LimitEn: string;
  Sonuc: string | null;
  SonucEn: string;
  Degerlendirme: string | null;
  Termin: string | null;
  /** NULL ise kullanıcı henüz Kaydet basmadı (Sonuc auto-fill ile dolu olabilir) */
  SonucKayitTarihi: string | null;
  altParametreler?: BilesenSonuc[];
}

interface LocalEdit {
  sonuc: string;
  sonucEn: string;
  degerlendirme: string;
}

// Accordion için benzersiz anahtar
const rowKey = (r: RaporRow) => `${r.NkrID}__${r.RaporFormati}`;
const isUgdrFormat = (format: string) => ["ÜGDR", "UGDR", "ÜGD", "UGD"].includes(format.toLocaleUpperCase("tr-TR"));

// ── Küçük bileşenler ─────────────────────────────────────────────────────────

function DurumBadge({
  durum,
  done,
  total,
}: {
  durum: RaporRow["RaporDurumu"];
  done?: number;
  total?: number;
}) {
  const map: Record<string, { bg: string; fg: string }> = {
    "Bekliyor":            { bg: "#8e8e9318", fg: "#636366" },
    "Analiz Devam Ediyor": { bg: "#ff950018", fg: "#c06800" },
    "Onay Bekleniyor":     { bg: "#0071e318", fg: "#0055a8" },
    "Onaylandı":           { bg: "#34c75918", fg: "#248a3d" },
    "Yayınlandı":          { bg: "#bf5af218", fg: "#8944ab" },
    "Geri Gönderildi":     { bg: "#ff3b3018", fg: "#c00" },
  };
  const c = map[durum] ?? map["Bekliyor"];
  // İlerleme sayısı yalnız "Analiz Devam Ediyor"da anlamlı
  const showCount = durum === "Analiz Devam Ediyor" && typeof total === "number" && total > 0;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "2px 9px", borderRadius: 10,
      fontSize: "0.72rem", fontWeight: 600, background: c.bg, color: c.fg,
      whiteSpace: "nowrap",
    }}>
      {durum}
      {showCount && (
        <span style={{
          padding: "1px 6px", borderRadius: 8,
          background: "rgba(0,0,0,0.08)", fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
        }}>{done ?? 0}/{total}</span>
      )}
    </span>
  );
}

// Dermatoloji eski adı → Claim olarak göster (geri uyumluluk)
function displayFormat(format: string): string {
  return format === "Dermatoloji" ? "Claim" : format;
}

function FormatBadge({ format }: { format: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    "Genel":     { bg: "#0071e318", fg: "#0055a8" },
    "Challenge": { bg: "#bf5af218", fg: "#8944ab" },
    "Mikrobiyoloji": { bg: "#34c75918", fg: "#248a3d" },
    "Kimya":     { bg: "#ff950018", fg: "#c06800" },
    "Stabilite": { bg: "#ff950018", fg: "#c06800" },
    "Claim":       { bg: "#34c75918", fg: "#248a3d" },
    "Dermatoloji": { bg: "#34c75918", fg: "#248a3d" },
    "Diğer":     { bg: "#8e8e9318", fg: "#636366" },
    "ÜGDR": { bg: "#1f478818", fg: "#1f4788" },
    "UGDR": { bg: "#1f478818", fg: "#1f4788" },
  };
  const label = displayFormat(format);
  const c = colors[format] ?? colors[label] ?? { bg: "#8e8e9318", fg: "#636366" };
  return (
    <span style={{
      display: "inline-block", padding: "2px 9px", borderRadius: 10,
      fontSize: "0.72rem", fontWeight: 600, background: c.bg, color: c.fg,
    }}>{label}</span>
  );
}

function IconBtn({
  title, onClick, color, children,
}: {
  title: string;
  onClick: (e: React.MouseEvent) => void;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      className={styles.editBtn}
      title={title}
      onClick={onClick}
      style={color ? { color } : undefined}
    >
      {children}
    </button>
  );
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────

export default function RaporTakipTable({
  fixedRaporTuru,
  acceptedOnly = false,
  phase,
  hideRaporTuruTabs = false,
  onRefresh,
}: {
  fixedRaporTuru?: string;
  /** true → sadece NKR_LabKabul'da kayıtlı (laboratuvar tarafından kabul edilmiş) raporları göster */
  acceptedOnly?: boolean;
  /** "lab"      = Sonuç Girişi (Bekliyor + Analiz Devam Ediyor + Onay Bekleniyor)
      "approval" = Rapor Takip onay bekleyenler (Onay Bekleniyor)
      "returned" = Geri Gelenler (Geri Gönderildi)
      "approved" = Onaylananlar (Onaylandı + Yayınlandı) */
  phase?: "lab" | "approval" | "returned" | "approved";
  /** true → üstteki rapor türü tab'larını gizle (Numune Takip alt sayfaları için) */
  hideRaporTuruTabs?: boolean;
  /** Bir state-değiştirici aksiyon (Onaya Gönder, Geri Al, Kaydet) sonrası çağrılır.
      Dış sayfa tab sayıları gibi türevleri tazelemek için kullanır. */
  onRefresh?: () => void;
} = {}) {
  const router = useRouter();
  const [rows, setRows]           = useState<RaporRow[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [limit, setLimit]         = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch]       = useState("");
  const [year, setYear]           = useState("2026");
  // phase=approval → default "Onay Bekleniyor" (sadece bekleyenler görünür; Onaylandı'lar filter ile)
  const [raporDurumu, setRaporDurumu] = useState(phase === "approval" ? "Onay Bekleniyor" : "");
  const [raporTuru, setRaporTuru] = useState(fixedRaporTuru ?? "");
  const raporTurleri = ["Genel", "Challenge", "Stabilite", "Dermatoloji", "ÜGDR"];
  const raporTabs = ["", ...raporTurleri];
  const [loading, setLoading]     = useState(true);
  const [transitioning, setTrans] = useState(false);
  const [error, setError]         = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Accordion
  const [openKeys, setOpenKeys]   = useState<Set<string>>(new Set());
  // Hizmet verileri: key → HizmetDetay[]
  const [hizmetMap, setHizmetMap] = useState<Record<string, HizmetDetay[]>>({});
  // Hizmet yükleme durumu
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  // Yerel düzenlemeler: key → { x1Id → LocalEdit }
  const [editMap, setEditMap]     = useState<Record<string, Record<number, LocalEdit>>>({});
  // Bileşen (alt parametre) sonuç düzenlemeleri — key → x1Id → BilesenSonuc[]
  const [bilesenMap, setBilesenMap] = useState<Record<string, Record<number, BilesenSonuc[]>>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<Record<string, string>>({});

  // Gönder modal
  const [gonderRow,    setGonderRow]    = useState<RaporRow | null>(null);
  const [gonderTo,     setGonderTo]     = useState("");
  const [gonderCc,     setGonderCc]     = useState("");
  const [gonderKonu,   setGonderKonu]   = useState("");
  const [gonderMesaj,  setGonderMesaj]  = useState("");
  const [gonderLoading, setGonderLoading] = useState(false);
  const [gonderError,  setGonderError]  = useState("");
  const [gonderDone,   setGonderDone]   = useState(false);

  const searchTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef     = useRef<AbortController | null>(null);
  const latestReqId  = useRef(0);
  const didMount     = useRef(false);

  // ── Veri çekme ────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (
    p: number, s: string, l: number, y: string, d: string, t: string,
    opts: { clearFirst?: boolean } = {},
  ) => {
    const reqId = ++latestReqId.current;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    if (opts.clearFirst) {
      setRows([]); setLoading(true); setTrans(false);
    } else {
      setTrans(true); setLoading(false);
    }
    setError("");

    try {
      const params = new URLSearchParams({
        page: p.toString(), limit: l.toString(),
        search: s, year: y, raporDurumu: d, raporTuru: t,
      });
      if (acceptedOnly) params.set("acceptedOnly", "1");
      if (phase) params.set("phase", phase);
      const res = await fetch(
        `/api/rapor-takip?${params}`,
        { signal: ctrl.signal, cache: "no-store" },
      );
      if (reqId !== latestReqId.current) return;
      if (!res.ok) throw new Error((await res.json()).error || "Hata");
      const json = await res.json();
      setRows(json.data);
      setTotal(json.total);
      setTotalPages(json.totalPages);
    } catch (e: any) {
      if (e.name === "AbortError" || reqId !== latestReqId.current) return;
      setError(e.message);
    } finally {
      if (reqId === latestReqId.current) {
        setLoading(false); setTrans(false);
      }
    }
  }, [acceptedOnly, phase]);

  // İlk yükleme
  useEffect(() => {
    fetchData(1, "", limit, year, raporDurumu, raporTuru, { clearFirst: true });
  }, []);

  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    fetchData(page, search, limit, year, raporDurumu, raporTuru, { clearFirst: false });
  }, [page, limit, year, raporDurumu, raporTuru]);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      fetchData(1, val, limit, year, raporDurumu, raporTuru, { clearFirst: true });
    }, 250);
  };

  // ── Accordion ──────────────────────────────────────────────────────────────
  const toggleRow = async (row: RaporRow) => {
    if (isUgdrFormat(row.RaporFormati)) {
      router.push(`/laboratuvar/rapor-takip/ugdr/${row.RaporNo || row.NkrID}`);
      return;
    }

    const key = rowKey(row);
    const wasOpen = openKeys.has(key);

    setOpenKeys(prev => {
      const next = new Set(prev);
      wasOpen ? next.delete(key) : next.add(key);
      return next;
    });

    // Açılıyorsa ve hizmetler henüz yüklenmediyse yükle
    if (!wasOpen && !hizmetMap[key]) {
      setLoadingKey(key);
      try {
        const res = await fetch(
          `/api/rapor-takip/${row.NkrID}/hizmetler?raporFormati=${encodeURIComponent(row.RaporFormati)}`,
        );
        if (!res.ok) throw new Error((await res.json()).error || "Hizmetler yüklenemedi");
        const data: HizmetDetay[] = await res.json();
        setHizmetMap(prev => ({ ...prev, [key]: data }));

        // Başlangıç editMap'ini doldur
        const initial: Record<number, LocalEdit> = {};
        const bilesenInitial: Record<number, BilesenSonuc[]> = {};
        data.forEach(h => {
          initial[h.X1ID] = {
            sonuc:         h.Sonuc         ?? "",
            sonucEn:       h.SonucEn       ?? "",
            degerlendirme: h.Degerlendirme ?? "",
          };
          if (h.altParametreler && h.altParametreler.length > 0) {
            bilesenInitial[h.X1ID] = h.altParametreler.map(b => ({ ...b }));
          }
        });
        setEditMap(prev => ({ ...prev, [key]: initial }));
        setBilesenMap(prev => ({ ...prev, [key]: bilesenInitial }));
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoadingKey(null);
      }
    }
  };

  const setFieldValue = (key: string, x1Id: number, field: keyof LocalEdit, value: string) => {
    setEditMap(prev => ({
      ...prev,
      [key]: { ...prev[key], [x1Id]: { ...prev[key]?.[x1Id], [field]: value } },
    }));
  };

  // Bileşen (alt parametre) alanı düzenle
  const setBilesenValue = (
    key: string, x1Id: number, base: BilesenSonuc[], idx: number,
    field: "Sonuc" | "SonucEn" | "Degerlendirme", value: string,
  ) => {
    setBilesenMap(prev => {
      const cur = prev[key]?.[x1Id] ?? base.map(b => ({ ...b }));
      const next = cur.map((b, i) => (i === idx ? { ...b, [field]: value } : b));
      return { ...prev, [key]: { ...prev[key], [x1Id]: next } };
    });
  };

  // Per-row Kaydet için ayrı state — savingRowId (X1ID)
  const [savingRowId, setSavingRowId] = useState<number | null>(null);
  // Bu oturumda kullanıcının Kaydet'e bastığı satırlar (X1ID).
  // Sayfa refresh'ten sonra server'daki h.Sonuc'a düşer.
  const [savedRowIds, setSavedRowIds] = useState<Set<number>>(new Set());
  // Kalem ikonuna basılıp düzenleme moduna alınmış satırlar — kilidi açılır.
  const [editingRowIds, setEditingRowIds] = useState<Set<number>>(new Set());

  const markSaved = (x1Id: number) => {
    setSavedRowIds(prev => { const n = new Set(prev); n.add(x1Id); return n; });
    setEditingRowIds(prev => { const n = new Set(prev); n.delete(x1Id); return n; });
  };
  const enterEditing = (x1Id: number) => {
    setEditingRowIds(prev => { const n = new Set(prev); n.add(x1Id); return n; });
  };

  // ── Kaydet (tek satır) ────────────────────────────────────────────────────
  const saveSingleRow = async (row: RaporRow, x1Id: number) => {
    const key = rowKey(row);
    const edit = editMap[key]?.[x1Id] ?? { sonuc: "", sonucEn: "", degerlendirme: "" };

    setSavingRowId(x1Id);
    setSaveError(prev => ({ ...prev, [key]: "" }));

    try {
      const res = await fetch(`/api/rapor-takip/${row.NkrID}/hizmetler`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: [{ x1Id, sonuc: edit.sonuc, sonucEn: edit.sonucEn, degerlendirme: edit.degerlendirme, altParametreler: bilesenMap[key]?.[x1Id] }],
          raporFormati: row.RaporFormati,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Kaydedilemedi");

      // Bu satırın hizmet listesindeki değerini güncelle (SonucKayitTarihi de set edilir)
      const now = new Date().toISOString();
      setHizmetMap(prev => {
        const current = prev[key] || [];
        const updated = current.map(h =>
          h.X1ID === x1Id
            ? { ...h, Sonuc: edit.sonuc, SonucEn: edit.sonucEn, Degerlendirme: edit.degerlendirme, SonucKayitTarihi: now }
            : h
        );
        return { ...prev, [key]: updated };
      });

      // Kullanıcı bu satırı bu oturumda kaydetti — kilitle, düzenleme modunu kapat
      markSaved(x1Id);

      // Ana listeyi refresh — durum "Analiz Devam Ediyor" olabilir
      fetchData(page, search, limit, year, raporDurumu, raporTuru, { clearFirst: false });
      onRefresh?.();
    } catch (e: any) {
      setSaveError(prev => ({ ...prev, [key]: e.message }));
    } finally {
      setSavingRowId(null);
    }
  };

  // ── Kaydet (tümü) — Tüm Sonuçları Kaydet butonu için ─────────────────────
  const saveHizmetler = async (row: RaporRow) => {
    const key = rowKey(row);
    const edits = editMap[key] || {};

    const updates = Object.entries(edits).map(([x1Id, vals]) => ({
      x1Id: Number(x1Id),
      sonuc: vals.sonuc,
      sonucEn: vals.sonucEn,
      degerlendirme: vals.degerlendirme,
      altParametreler: bilesenMap[key]?.[Number(x1Id)],
    }));

    setSavingKey(key);
    setSaveError(prev => ({ ...prev, [key]: "" }));

    try {
      const res = await fetch(`/api/rapor-takip/${row.NkrID}/hizmetler`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates, raporFormati: row.RaporFormati }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Kaydedilemedi");

      const now = new Date().toISOString();
      setHizmetMap(prev => {
        const current = prev[key] || [];
        const updated = current.map(h => ({
          ...h,
          Sonuc:         edits[h.X1ID]?.sonuc         ?? h.Sonuc,
          SonucEn:       edits[h.X1ID]?.sonucEn       ?? h.SonucEn,
          Degerlendirme: edits[h.X1ID]?.degerlendirme ?? h.Degerlendirme,
          // Bu satır kaydedildiyse SonucKayitTarihi'yi şimdi yap → isLocked true olur, kalem görünür
          SonucKayitTarihi: edits[h.X1ID] !== undefined ? now : h.SonucKayitTarihi,
        }));
        return { ...prev, [key]: updated };
      });

      // Tüm güncellenen satırları savedSet'e ekle (kalem ikonu görünsün)
      // ve editing modunu kapat
      setSavedRowIds(prev => {
        const n = new Set(prev);
        for (const u of updates) n.add(u.x1Id);
        return n;
      });
      setEditingRowIds(prev => {
        const n = new Set(prev);
        for (const u of updates) n.delete(u.x1Id);
        return n;
      });

      fetchData(page, search, limit, year, raporDurumu, raporTuru, { clearFirst: false });
      onRefresh?.();
    } catch (e: any) {
      setSaveError(prev => ({ ...prev, [key]: e.message }));
    } finally {
      setSavingKey(null);
    }
  };

  // ── Gönder modal ──────────────────────────────────────────────────────────
  const openGonder = (row: RaporRow) => {
    setGonderRow(row);
    setGonderTo("");
    setGonderCc("");
    setGonderKonu("");
    setGonderMesaj("");
    setGonderError("");
    setGonderDone(false);
  };

  const doGonder = async () => {
    if (!gonderRow) return;
    setGonderLoading(true);
    setGonderError("");
    try {
      const res = await fetch(`/api/rapor-gonder/${gonderRow.NkrID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: gonderRow.RaporFormati,
          to:     gonderTo.split(",").map(s => s.trim()).filter(Boolean),
          cc:     gonderCc ? gonderCc.split(",").map(s => s.trim()).filter(Boolean) : [],
          konu:   gonderKonu,
          mesaj:  gonderMesaj,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Gönderilemedi");
      setGonderDone(true);
    } catch (e: any) {
      setGonderError(e.message);
    } finally {
      setGonderLoading(false);
    }
  };

  // ── Sayfalama ─────────────────────────────────────────────────────────────
  const goTo = (p: number) => { if (p >= 1 && p <= totalPages) setPage(p); };
  const pageNums = (): (number | "…")[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const nums: (number | "…")[] = [1];
    if (page > 3) nums.push("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) nums.push(i);
    if (page < totalPages - 2) nums.push("…");
    nums.push(totalPages);
    return nums;
  };

  const formatTarih = (t: string | null) => {
    if (!t) return "—";
    const [y, m, d] = t.split("-");
    return `${d}.${m}.${y}`;
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map(r => rowKey(r))));
    }
  };

  const toggleSelectRow = (key: string) => {
    const next = new Set(selectedIds);
    next.has(key) ? next.delete(key) : next.add(key);
    setSelectedIds(next);
  };

  const batchPrint = () => {
    const nkrIds = rows
      .filter(r => selectedIds.has(rowKey(r)))
      .map(r => r.NkrID);
    if (nkrIds.length === 0) return;
    const ids = nkrIds.join(",");
    window.open(`/api/rapor-takip/yazdir?ids=${ids}`, "_blank");
  };

  const toggleCompletion = async (row: RaporRow) => {
    // Onay Bekleniyor durumdayken "Geri Al" → /geri-gonder (Geri Gönderildi state)
    // Bekliyor/Analiz Devam Ediyor iken "Onaya Gönder" → /tamamla (Onay Bekleniyor)
    try {
      if (row.RaporDurumu === "Onay Bekleniyor") {
        const res = await fetch(`/api/rapor-takip/${row.NkrID}/geri-gonder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ format: row.RaporFormati }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Geri gönderilemedi");
        // Liste yenilensin — bu satır artık Geri Gönderildi durumunda, mevcut tab'tan düşer
      } else {
        const res = await fetch(`/api/rapor-takip/${row.NkrID}/tamamla`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ format: row.RaporFormati, durum: "Onay Bekleniyor" }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Durum güncellenemedi");
      }
      fetchData(page, search, limit, year, raporDurumu, raporTuru, { clearFirst: false });
      onRefresh?.();
    } catch (e: any) {
      setError(e.message || "Durum güncellenemedi");
    }
  };

  const downloadUgdrReport = async (row: RaporRow, mode: "preview" | "pdf") => {
    const previewWindow = mode === "preview" ? window.open("", "_blank") : null;
    if (previewWindow) {
      previewWindow.document.write("<!doctype html><title>Rapor hazirlaniyor</title><body style=\"font-family:system-ui;padding:32px\">UGDR raporu hazirlaniyor...</body>");
      previewWindow.document.close();
    }

    try {
      const [formRes, formulRes] = await Promise.all([
        fetch(`/api/laboratuvar/ugdr/${row.NkrID}`),
        fetch(`/api/laboratuvar/ugdr/${row.NkrID}/formul`),
      ]);
      if (!formRes.ok) throw new Error("UGDR detay verisi alinamadi");
      if (!formulRes.ok) throw new Error("UGDR formul verisi alinamadi");

      const form = await formRes.json();
      const formulResults = await formulRes.json();
      const firmaAd = form?.FirmaAd || row.FirmaAd || "";
      const endpointFormat = "pdf";

      const reportRes = await fetch(`/api/urunler/rapor-sablon?format=${endpointFormat}&language=tr&profile=lab`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form, formulResults, firmaAd, language: "tr", profile: "lab" }),
      });
      if (!reportRes.ok) {
        const errData = await reportRes.json().catch(() => ({}));
        throw new Error(errData.error || `Rapor olusturulamadi (HTTP ${reportRes.status})`);
      }

      const blob = await reportRes.blob();
      const url = URL.createObjectURL(blob);

      if (mode === "preview") {
        if (previewWindow) previewWindow.location.href = url;
        else window.open(url, "_blank", "noopener,noreferrer");
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
      }

      const a = document.createElement("a");
      a.href = url;
      // Dosya adi: "BarkodNo - UrunAdi.pdf" (yoksa RaporNo/NkrID fallback)
      const sanitize = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
      const idPart = sanitize(String(row.Barkod || row.RaporNo || row.NkrID));
      const namePart = sanitize(String(row.Numune_Adi || ""));
      a.download = namePart ? `${idPart} - ${namePart}.pdf` : `${idPart}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      if (previewWindow && !previewWindow.closed) {
        previewWindow.document.open();
        previewWindow.document.write(`<!doctype html><title>Rapor hatasi</title><body style="font-family:system-ui;padding:32px;color:#991b1b">Rapor olusturulamadi: ${String(e.message || e)}</body>`);
        previewWindow.document.close();
      }
      setError(e.message || "Rapor olusturulamadi");
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {!fixedRaporTuru && !hideRaporTuruTabs && (
        <div style={{
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
        }}>
          {raporTabs.map((tab) => {
            const active = raporTuru === tab;
            return (
              <button
                key={tab || "all"}
                type="button"
                onClick={() => {
                  setRaporTuru(tab);
                  setPage(1);
                  setSelectedIds(new Set());
                  setOpenKeys(new Set());
                }}
                style={{
                  border: "none",
                  borderRadius: 7,
                  padding: "8px 14px",
                  background: active ? "var(--color-accent)" : "transparent",
                  color: active ? "#fff" : "var(--color-text-secondary)",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {tab || "Tümü"}
              </button>
            );
          })}
        </div>
      )}

      {/* Toolbar - Search + Filtreler + Seçili Yazdır */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchBox} style={{ width: 360 }}>
            <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
            </svg>
            <input
              className={styles.searchInput}
              placeholder="Evrak no, rapor no, firma, numune adı…"
              value={search}
              onChange={e => handleSearch(e.target.value)}
            />
            {search && (
              <button className={styles.searchClear} onClick={() => handleSearch("")}>
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            )}
          </div>
          <span className={styles.totalCount}>{total} rapor</span>
        </div>
        <div className={styles.toolbarRight} style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* Yıl Filtresi */}
          <select value={year} onChange={e => { setYear(e.target.value); setPage(1); }}
            style={{
              padding: "6px 8px", borderRadius: 6, border: "1px solid var(--color-border)",
              background: "var(--color-bg)", fontSize: "0.75rem", cursor: "pointer",
            }}>
            <option value="">Tüm Yıllar</option>
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          {/* Rapor Durumu Filtresi — phase'e göre seçenekler değişir */}
          <select value={raporDurumu} onChange={e => { setRaporDurumu(e.target.value); setPage(1); }}
            style={{
              padding: "6px 8px", borderRadius: 6, border: "1px solid var(--color-border)",
              background: "var(--color-bg)", fontSize: "0.75rem", cursor: "pointer",
            }}>
            {phase !== "approval" && <option value="">Tüm Durumlar</option>}
            {phase === "approval" ? (
              <>
                <option value="Onay Bekleniyor">Onay Bekleniyor</option>
                <option value="Onaylandı">Onaylandı</option>
              </>
            ) : phase === "returned" ? (
              <option value="Geri Gönderildi">Geri Gönderildi</option>
            ) : phase === "approved" ? (
              <>
                <option value="Onaylandı">Onaylandı</option>
                <option value="Yayınlandı">Yayınlandı</option>
              </>
            ) : phase === "lab" ? (
              <>
                <option value="Bekliyor">Bekliyor</option>
                <option value="Analiz Devam Ediyor">Analiz Devam Ediyor</option>
                <option value="Onay Bekleniyor">Onay Bekleniyor</option>
              </>
            ) : (
              <>
                <option value="Bekliyor">Bekliyor</option>
                <option value="Analiz Devam Ediyor">Analiz Devam Ediyor</option>
                <option value="Onay Bekleniyor">Onay Bekleniyor</option>
                <option value="Geri Gönderildi">Geri Gönderildi</option>
              </>
            )}
          </select>

          {/* Seçili Yazdır */}
          {selectedIds.size > 0 && (
            <button
              onClick={batchPrint}
              title={`${selectedIds.size} rapor yazdır`}
              style={{
                padding: "6px 10px", borderRadius: 6, border: "none",
                background: "var(--color-accent)", color: "#fff",
                fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
              }}>
              <svg viewBox="0 0 20 20" fill="currentColor" width="11" height="11">
                <path fillRule="evenodd" d="M5 4v3H4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h1v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-1V4a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1Zm2 0h6v3H7V4Zm-1 9v-2h8v2H6Zm8 2H6v-1h8v1Z" clipRule="evenodd" />
              </svg>
              Yazdır ({selectedIds.size})
            </button>
          )}

          {/* Sayfa Boyutu */}
          <select className={styles.pageSizeSelect} value={limit}
            onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
            {[10, 20, 50].map(n => <option key={n} value={n}>{n} / sayfa</option>)}
          </select>
        </div>
      </div>

      {/* Tablo */}
      <div
        className={styles.tableCard}
        style={{ position: "relative", opacity: transitioning ? 0.55 : 1, transition: "opacity 0.15s", overflowX: "auto", marginTop: 12 }}
      >
        {error && <div className={styles.errorBar}>{error}</div>}

        {/* Başlık satırı */}
        <div style={{
          display: "grid",
          gridTemplateColumns: `${phase ? "0" : "32px"} 24px 80px 108px 108px 1fr ${phase === "lab" ? "0" : "108px"} 170px 100px ${phase === "approval" ? "0" : phase === "returned" ? "180px" : phase === "lab" ? "140px" : "110px"} ${(phase === "returned" || phase === "lab") ? "0 0 0" : "36px 36px 36px"}`,
          alignItems: "center",
          padding: "8px 16px",
          borderBottom: "1px solid var(--color-border-light)",
          background: "var(--color-surface)",
          minWidth: 1140,
        }}>
          {phase ? <div /> : (
            <input type="checkbox" checked={selectedIds.size === rows.length && rows.length > 0}
              onChange={toggleSelectAll} style={{ cursor: "pointer", width: 16, height: 16 }} />
          )}
          <div />
          {["Tarih", "Evrak No", "Rapor No", phase === "approval" ? "Firma / Proje · Numune" : "Numune Adı", phase === "lab" ? "" : "Rapor Türü", "Durum", "Termin", "", "", "", ""].map((h, i) => (
            <div key={i} style={{
              fontSize: "0.69rem", fontWeight: 600, textTransform: "uppercase",
              letterSpacing: "0.06em", color: "var(--color-text-tertiary)",
              // phase=lab → Durum (i=5) başlığı sağa hizalı, padding'le hücre içinde sağa kayar.
              textAlign: i >= 6 ? "center" : (phase === "lab" && i === 5) ? "right" : "left",
              paddingRight: (phase === "lab" && i === 5) ? 8 : 0,
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}>{h}</div>
          ))}
        </div>

        {/* Skeleton */}
        {loading && (
          <div style={{ padding: "6px 0", minWidth: 900 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 20px", borderBottom: "1px solid var(--color-border-light)",
              }}>
                <span className={styles.skeleton} style={{ width: 14, height: 14, borderRadius: 3 }} />
                <span className={styles.skeleton} style={{ width: 72 }} />
                <span className={styles.skeleton} style={{ width: 90 }} />
                <span className={styles.skeleton} style={{ width: 90 }} />
                <span className={styles.skeleton} style={{ flex: 1 }} />
                <span className={styles.skeleton} style={{ width: 80 }} />
                <span className={styles.skeleton} style={{ width: 90 }} />
                <span className={styles.skeleton} style={{ width: 56 }} />
              </div>
            ))}
          </div>
        )}

        {/* Boş */}
        {!loading && rows.length === 0 && (
          <div className={styles.empty}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="36" height="36">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            Kayıt bulunamadı
          </div>
        )}

        {/* Satırlar */}
        {!loading && rows.map((row, gi) => {
          const key    = rowKey(row);
          const isOpen = openKeys.has(key);
          const hizmetler = hizmetMap[key] ?? [];
          const edits     = editMap[key] ?? {};
          const isSaving  = savingKey === key;
          const isLoading = loadingKey === key;

          return (
            <div
              key={key}
              style={{ borderBottom: gi < rows.length - 1 ? "1px solid var(--color-border-light)" : "none" }}
            >
              {/* ── Ana satır ── */}
              <div
                onClick={() => toggleRow(row)}
                style={{
                  display: "grid",
                  gridTemplateColumns: `${phase ? "0" : "32px"} 24px 80px 108px 108px 1fr ${phase === "lab" ? "0" : "108px"} 170px 100px ${phase === "approval" ? "0" : phase === "returned" ? "180px" : phase === "lab" ? "140px" : "110px"} ${(phase === "returned" || phase === "lab") ? "0 0 0" : "36px 36px 36px"}`,
                  alignItems: "center",
                  padding: "12px 16px",
                  cursor: "pointer",
                  background: isOpen ? "var(--color-surface-2)" : selectedIds.has(key) ? "var(--color-accent-light)" : "transparent",
                  transition: "background 0.12s",
                  userSelect: "none",
                  minWidth: 1140,
                }}
              >
                {/* Checkbox — sadece default (Rapor Takip) modunda; Numune Takip alt tablarında gizli */}
                {phase ? <span /> : (
                  <input type="checkbox" checked={selectedIds.has(key)}
                    onChange={() => toggleSelectRow(key)} onClick={e => e.stopPropagation()}
                    style={{ cursor: "pointer", width: 16, height: 16, accentColor: "var(--color-accent)" }} />
                )}

                {/* Chevron */}
                <svg
                  viewBox="0 0 20 20" fill="currentColor" width="14" height="14"
                  style={{
                    color: "var(--color-text-tertiary)", flexShrink: 0,
                    transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform 0.18s ease",
                  }}
                >
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
                </svg>

                {/* Tarih */}
                <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                  {formatTarih(row.Tarih)}
                </div>

                {/* Evrak No */}
                <div style={{ fontWeight: 600, fontSize: "0.82rem", color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums" }}>
                  {row.Evrak_No}
                </div>

                {/* Rapor No */}
                <div
                  style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--color-accent)", fontVariantNumeric: "tabular-nums" }}
                  onClick={e => e.stopPropagation()}
                >
                  {isUgdrFormat(row.RaporFormati) ? (
                    <button
                      type="button"
                      onClick={() => window.open(`/laboratuvar/rapor-takip/ugdr/${row.RaporNo || row.NkrID}`, "_blank", "noopener,noreferrer")}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "var(--color-accent)",
                        fontWeight: 700,
                        padding: 0,
                        cursor: "pointer",
                        textDecoration: "underline",
                        fontSize: "0.82rem",
                      }}
                      title="ÜGDR detayını yeni sekmede aç"
                    >
                      {row.RaporNo}
                    </button>
                  ) : (
                    row.RaporNo
                  )}
                </div>

                {/* Firma / Numune — phase=lab ve phase=returned'da firma + proje gizli */}
                <div style={{ minWidth: 0 }}>
                  {(phase !== "lab" && phase !== "returned") && (
                    <div style={{
                      fontWeight: 500, fontSize: "0.845rem", color: "var(--color-text-primary)",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {row.FirmaAd ?? "—"}
                      {row.ProjeAd && <span style={{ color: "var(--color-text-tertiary)" }}> · {row.ProjeAd}</span>}
                    </div>
                  )}
                  <div style={{
                    fontSize: "0.845rem",
                    color: (phase === "lab" || phase === "returned") ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                    fontWeight: (phase === "lab" || phase === "returned") ? 600 : 400,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {row.Numune_Adi}
                    {row.Barkod ? ` · Barkod: ${row.Barkod}` : ""}
                  </div>
                </div>

                {/* Rapor Türü — phase=lab'da grid hücresi var ama içerik gizli (width=0).
                    NOT: display:none KULLANMA — grid item'i tamamen kaldırır, sonraki tüm hücreler sola kayar. */}
                <div style={{ display: "flex", justifyContent: "flex-start", overflow: "hidden" }}>
                  {phase !== "lab" && <FormatBadge format={row.RaporFormati} />}
                </div>

                {/* Durum — phase=lab'da hücrede sağa hizalı */}
                <div style={{ display: "flex", justifyContent: phase === "lab" ? "flex-end" : "flex-start", paddingRight: phase === "lab" ? 8 : 0 }}>
                  <DurumBadge durum={row.RaporDurumu} done={row.SonucluSayisi} total={row.HizmetSayisi} />
                </div>

                {/* Termin */}
                <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums", textAlign: "center" }}>
                  {row.MaxTermin ? `${row.MaxTermin.split("-").reverse().join(".")}` : "—"}
                </div>

                {/* Onaya Gönder / Geri Al / Tekrar Onaya Gönder
                    - phase=approval → buton yok (PDF Önizleme yeterli)
                    - phase=returned → "Tekrar Onaya Gönder" (geniş, mavi)
                    - Bekliyor → buton yok
                    - Analiz Devam Ediyor (N<M) → gizli
                    - Analiz Devam Ediyor N/N → "Onaya Gönder"
                    - Onay Bekleniyor → "Geri Al"
                    - Onaylandı/Yayınlandı → disabled bilgi */}
                <div style={{ display: phase === "approval" ? "none" : "flex", justifyContent: "center" }} onClick={e => e.stopPropagation()}>
                  {(() => {
                    if (phase === "approval") return null;

                    // Geri Gelenler tabı → tek bir geniş "Tekrar Onaya Gönder" butonu
                    if (phase === "returned") {
                      return (
                        <button
                          type="button"
                          title="Bu raporu tekrar onaya gönder (Onay Bekleniyor)"
                          onClick={() => toggleCompletion(row)}
                          style={{
                            border: "none",
                            borderRadius: 8,
                            background: "var(--color-accent)",
                            color: "#fff",
                            fontSize: "0.78rem",
                            fontWeight: 700,
                            padding: "8px 14px",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                            width: "100%",
                            maxWidth: 170,
                          }}
                        >
                          ↗ Tekrar Onaya Gönder
                        </button>
                      );
                    }

                    const allSaved = row.HizmetSayisi > 0 && row.SonucluSayisi >= row.HizmetSayisi;
                    // phase=lab → "Onaya Gönder" DAİMA görünür; allSaved değilse pasif.
                    // Diğer phase'larda eski kural: Onay Bekleniyor / Onaylandı / Yayınlandı / allSaved.
                    const showButton = phase === "lab"
                      ? true
                      : (row.RaporDurumu === "Onay Bekleniyor"
                          || row.RaporDurumu === "Onaylandı"
                          || row.RaporDurumu === "Yayınlandı"
                          || (row.RaporDurumu === "Analiz Devam Ediyor" && allSaved));
                    if (!showButton) return null;
                    const isLabPasif = phase === "lab" && !allSaved;
                    return (
                    <button
                      type="button"
                      title={
                        isLabPasif
                          ? "Önce tüm analizlerin sonuçları girilmeli"
                          : row.RaporDurumu === "Onaylandı" || row.RaporDurumu === "Yayınlandı"
                          ? "Rapor onaylanmış — durum değiştirilemez"
                          : row.RaporDurumu === "Onay Bekleniyor"
                          ? "Raporu laboratuvara geri gönder (Geri Gönderildi)"
                          : "Onaya gönder (Onay Bekleniyor)"
                      }
                      disabled={isLabPasif || row.RaporDurumu === "Onaylandı" || row.RaporDurumu === "Yayınlandı"}
                      onClick={() => toggleCompletion(row)}
                      style={{
                        border: isLabPasif ? "1px solid var(--color-border)" : "1px solid #0b5c8e30",
                        borderRadius: 7,
                        background: isLabPasif ? "var(--color-surface-2)" : "#0b5c8e14",
                        color: isLabPasif ? "var(--color-text-tertiary)" : "#0b5c8e",
                        fontSize: "0.68rem",
                        fontWeight: 700,
                        padding: "5px 8px",
                        cursor: isLabPasif ? "not-allowed" : "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {phase === "lab"
                        ? "Onaya Gönder"
                        : row.RaporDurumu === "Onay Bekleniyor" ? "Geri Al" : "Onaya Gönder"}
                    </button>
                    );
                  })()}
                </div>

                {/* 1. Slot:
                    - phase=lab → Hamveri (PDF) sayfası
                    - phase=returned → boş (yer Tekrar Onaya Gönder'e gitti)
                    - phase=approval → boş (PDF Önizleme 2. slot'ta zaten)
                    - default → Word/PDF indir */}
                <div style={{ display: "flex", justifyContent: "center" }} onClick={e => e.stopPropagation()}>
                  {/* phase=lab → ikonlar kaldırıldı, ana CTA üstteki "Onaya Gönder" butonu */}
                  {!phase && !acceptedOnly && (
                    <IconBtn
                      title="PDF indir"
                      color="var(--color-accent)"
                      onClick={() => isUgdrFormat(row.RaporFormati)
                        ? downloadUgdrReport(row, "pdf")
                        : window.open(
                            `/api/rapor-takip/yazdir/${row.NkrID}?format=${encodeURIComponent(row.RaporFormati)}&output=html`,
                            "_blank",
                          )}
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                        <path fillRule="evenodd" d="M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Zm2 6a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 0 1.5h-.5A.75.75 0 0 1 6 10Zm0 2.5a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 6 12.5Zm0 2.5a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 6 15Z" clipRule="evenodd" />
                      </svg>
                    </IconBtn>
                  )}
                </div>

                {/* 2. Slot: PDF Önizleme (göz) — onay sayfasını yeni sekmede aç.
                    Sadece Approval'da görünür. Lab + Returned'da gizli. */}
                <div style={{ display: "flex", justifyContent: "center" }} onClick={e => e.stopPropagation()}>
                  {phase === "approval" ? (
                    <IconBtn
                      title="PDF Önizleme — rapor formatı (yeni sekmede)"
                      color="#bf5af2"
                      onClick={() => window.open(
                        `/rapor-onay-print/${row.NkrID}?format=${encodeURIComponent(row.RaporFormati)}`,
                        "_blank", "noopener,noreferrer",
                      )}
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                        <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                        <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
                      </svg>
                    </IconBtn>
                  ) : (
                    !acceptedOnly && (
                      <IconBtn
                        title="Online Goster"
                        color="#bf5af2"
                        onClick={() => isUgdrFormat(row.RaporFormati)
                          ? downloadUgdrReport(row, "preview")
                          : window.open(
                              `/api/rapor-takip/yazdir/${row.NkrID}?format=${encodeURIComponent(row.RaporFormati)}&output=html`,
                              "_blank",
                            )}
                      >
                        <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                          <path fillRule="evenodd" d="M5 4v3H4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h1v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-1V4a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1Zm2 0h6v3H7V4Zm-1 9v-2h8v2H6Zm8 2H6v-1h8v1Z" clipRule="evenodd" />
                        </svg>
                      </IconBtn>
                    )
                  )}
                </div>

                {/* 3. Slot: Mail Gönder — sadece phase yoksa (default Rapor Takip eski moddaysa) */}
                <div style={{ display: "flex", justifyContent: "center" }} onClick={e => e.stopPropagation()}>
                  {!phase && !acceptedOnly && (
                    <IconBtn
                      title="Müşteriye mail gönder"
                      color="#248a3d"
                      onClick={() => openGonder(row)}
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                        <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.254 4.94H9.75a.75.75 0 0 1 0 1.5H3.533l-1.254 4.94a.75.75 0 0 0 .826.95 28.896 28.896 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.288Z" />
                      </svg>
                    </IconBtn>
                  )}
                </div>
              </div>

              {/* ── Açılır detay: hizmetler ── */}
              {/* Geri Gönderme Notu — sadece phase=returned ve not varsa */}
              {phase === "returned" && row.GeriGonderNotu && row.GeriGonderNotu.trim() && (
                <div style={{
                  margin: "0 16px 8px 56px",
                  padding: "8px 12px",
                  background: "#ff3b3010",
                  borderLeft: "3px solid #ff453a",
                  borderRadius: 6,
                  fontSize: "0.78rem",
                  color: "#c00",
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                }}>
                  <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>↩ Geri Gönderme Notu:</span>
                  <span style={{ color: "#1d1d1f", whiteSpace: "pre-wrap" }}>{row.GeriGonderNotu}</span>
                </div>
              )}

              {isOpen && (
                <div style={{
                  background: "var(--color-surface-2)",
                  borderTop: "1px solid var(--color-border-light)",
                  padding: "0 0 12px",
                }}>
                  {isLoading && (
                    <div style={{ padding: "16px 48px", display: "flex", gap: 12 }}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span key={i} className={styles.skeleton} style={{ flex: 1, height: 16 }} />
                      ))}
                    </div>
                  )}

                  {!isLoading && hizmetler.length === 0 && (
                    <div style={{ padding: "14px 48px", fontSize: "0.82rem", color: "var(--color-text-tertiary)" }}>
                      Bu rapor formatına ait hizmet bulunamadı.
                    </div>
                  )}

                  {!isLoading && hizmetler.length > 0 && (
                    <>
                      <table style={{
                        width: "100%", borderCollapse: "collapse",
                        fontSize: "0.82rem", tableLayout: "fixed",
                      }}>
                        <colgroup>
                          <col style={{ width: 48 }} />
                          <col style={{ width: 80 }} />
                          <col />
                          <col style={{ width: 130 }} />
                          <col style={{ width: 88 }} />
                          <col style={{ width: 130 }} />
                          <col style={{ width: 110 }} />
                          <col style={{ width: 108 }} />
                          <col style={{ width: 88 }} />
                          <col style={{ width: 84 }} />
                        </colgroup>
                        <thead>
                          <tr style={{ background: "var(--color-surface)", borderBottom: "1px solid var(--color-border)" }}>
                            <th />
                            {["Kod", "Hizmet Adı", "Metot", "Birim", "Sonuç", "Limit", "Değerlendirme", "Termin", ""].map(h => (
                              <th key={h} style={{
                                padding: "6px 10px", textAlign: "left",
                                fontSize: "0.67rem", fontWeight: 700,
                                textTransform: "uppercase", letterSpacing: "0.07em",
                                color: "var(--color-text-secondary)", whiteSpace: "nowrap",
                              }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {hizmetler.map((h, hi) => {
                            const edit = edits[h.X1ID] ?? { sonuc: h.Sonuc ?? "", sonucEn: h.SonucEn ?? "", degerlendirme: h.Degerlendirme ?? "" };
                            const bilesenler = bilesenMap[key]?.[h.X1ID] ?? (h.altParametreler || []);
                            // "Kayıtlı" = kullanıcı Kaydet bastı.
                            // Bunun göstergesi: NumuneX1.SonucKayitTarihi NULL değil.
                            // Sonuc kolonu auto-fill (LOQ) ile dolu gelebilir, bu yüzden
                            // Sonuc dolu olmak "kayıtlı" anlamına gelmez.
                            const hasServerResult = h.SonucKayitTarihi != null;
                            const userSavedThisSession = savedRowIds.has(h.X1ID);
                            const isExplicitlyEditing = editingRowIds.has(h.X1ID);
                            // Onaylandı / Yayınlandı → tüm satırlar kalıcı kilit, kalem yok
                            const isApproved = row.RaporDurumu === "Onaylandı" || row.RaporDurumu === "Yayınlandı";
                            // Satır kilitli = sonuç var/savedSet'te VE editing değil  (onaylandıysa her zaman)
                            const isLocked = isApproved || ((hasServerResult || userSavedThisSession) && !isExplicitlyEditing);
                            const inputBase: React.CSSProperties = {
                              width: "100%", padding: "4px 7px",
                              // border shorthand yerine longhand — borderColor'u
                              // onFocus/onBlur'da güvenle değiştirebilelim, React
                              // shorthand-longhand uyarısı vermesin diye.
                              borderWidth: 1,
                              borderStyle: "solid",
                              borderColor: "var(--color-border)",
                              borderRadius: 6, fontSize: "0.8rem",
                              background: "var(--color-bg)",
                              color: "var(--color-text-primary)",
                              outline: "none",
                            };
                            const lockedInputStyle: React.CSSProperties = {
                              background: "transparent",
                              borderColor: "#34c75940",
                              color: "var(--color-text-secondary)",
                              cursor: "not-allowed",
                            };
                            return (
                              <Fragment key={h.X1ID}>
                              <tr
                                style={{
                                  borderBottom: (hi < hizmetler.length - 1 || bilesenler.length > 0)
                                    ? "1px solid var(--color-border-light)" : "none",
                                  // Kilitli (kaydedilmiş) satır: hafif yeşil zemin + sol kenar şeridi
                                  background: isLocked ? "#34c75908" : "transparent",
                                  borderLeft: isLocked
                                    ? "3px solid #34c759"
                                    : "3px solid transparent",
                                  transition: "background 0.15s",
                                }}
                              >
                                <td />
                                <td style={{ padding: "8px 10px", color: "var(--color-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                                  {h.Kod ?? "—"}
                                </td>
                                <td style={{ padding: "8px 10px", color: "var(--color-text-primary)", fontWeight: 500 }}>
                                  <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {h.Akreditasyon ? `* ${h.Ad}` : (h.Ad ?? "—")}
                                  </div>
                                </td>
                                <td style={{ padding: "8px 10px", color: "var(--color-text-secondary)" }}>
                                  <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {h.Metot ?? "—"}
                                  </div>
                                </td>
                                {/* Birim + EN */}
                                <td style={{ padding: "8px 10px" }}>
                                  <div style={{ color: "var(--color-text-secondary)" }}>{h.Birim ?? "—"}</div>
                                  {h.BirimEn && (
                                    <div style={{ fontSize: "0.72rem", color: "#0071e3", marginTop: 2 }}>{h.BirimEn}</div>
                                  )}
                                </td>
                                {/* Sonuç — düzenlenebilir, TR + EN */}
                                <td style={{ padding: "6px 8px" }}>
                                  <input
                                    type="text"
                                    value={edit.sonuc}
                                    onChange={e => setFieldValue(key, h.X1ID, "sonuc", e.target.value)}
                                    placeholder="değer"
                                    disabled={isLocked}
                                    readOnly={isLocked}
                                    style={isLocked ? { ...inputBase, ...lockedInputStyle } : inputBase}
                                    onFocus={e => { if (!isLocked) e.currentTarget.style.borderColor = "var(--color-accent)"; }}
                                    onBlur={e  => { if (!isLocked) e.currentTarget.style.borderColor = "var(--color-border)"; }}
                                  />
                                  <div style={{ position: "relative", marginTop: 3 }}>
                                    <span style={{
                                      position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)",
                                      fontSize: "0.58rem", fontWeight: 700, color: isLocked ? "#888" : "#0071e3",
                                      pointerEvents: "none", userSelect: "none",
                                    }}>EN</span>
                                    <input
                                      type="text"
                                      value={edit.sonucEn}
                                      onChange={e => setFieldValue(key, h.X1ID, "sonucEn", e.target.value)}
                                      placeholder="result"
                                      disabled={isLocked}
                                      readOnly={isLocked}
                                      style={isLocked
                                        ? { ...inputBase, ...lockedInputStyle, fontSize: "0.74rem", paddingLeft: 24, background: "transparent" }
                                        : {
                                            ...inputBase, fontSize: "0.74rem", paddingLeft: 24,
                                            color: "#005bb5", borderColor: "#0071e340",
                                            background: "#f0f6ff",
                                          }}
                                      onFocus={e => { if (!isLocked) e.currentTarget.style.borderColor = "#0071e3"; }}
                                      onBlur={e  => { if (!isLocked) e.currentTarget.style.borderColor = "#0071e340"; }}
                                    />
                                  </div>
                                </td>
                                {/* Limit + EN */}
                                <td style={{ padding: "8px 10px" }}>
                                  <div style={{ color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                                    {h.LimitDeger ?? "—"}
                                  </div>
                                  {h.LimitEn && (
                                    <div style={{ fontSize: "0.72rem", color: "#0071e3", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{h.LimitEn}</div>
                                  )}
                                </td>
                                {/* Değerlendirme — düzenlenebilir */}
                                <td style={{ padding: "6px 8px" }}>
                                  <select
                                    value={edit.degerlendirme}
                                    onChange={e => setFieldValue(key, h.X1ID, "degerlendirme", e.target.value)}
                                    disabled={isLocked}
                                    style={{
                                      width: "100%", padding: "4px 7px",
                                      border: "1px solid " + (isLocked ? "#34c75940" : "var(--color-border)"),
                                      borderRadius: 6, fontSize: "0.8rem",
                                      background: isLocked ? "transparent" : "var(--color-bg)",
                                      color: isLocked
                                        ? "var(--color-text-secondary)"
                                        : edit.degerlendirme === "Uygun"
                                          ? "#248a3d"
                                          : edit.degerlendirme === "Uygun Değil"
                                            ? "#c00" : "var(--color-text-primary)",
                                      outline: "none", cursor: isLocked ? "not-allowed" : "pointer",
                                    }}
                                  >
                                    <option value="">—</option>
                                    <option value="Uygun">Uygun</option>
                                    <option value="Uygun Değil">Uygun Değil</option>
                                    <option value="Değerlendirilemez">Değerlendirilemez</option>
                                  </select>
                                </td>
                                {/* Termin */}
                                <td style={{ padding: "8px 10px", color: "var(--color-text-secondary)", fontSize: "0.8rem", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                                  {h.Termin ? `${h.Termin.split("-").reverse().join(".")}` : "—"}
                                </td>
                                {/* Per-row Kaydet (düzenleme modu) / Kalem ikonu (kilitli)
                                    Onaylandı/Yayınlandı → hiç buton yok, satır kalıcı kilitli */}
                                <td style={{ padding: "6px 8px", textAlign: "center" }}>
                                  {isApproved ? (
                                    <span title="Rapor onaylandı — değişikliğe kapalı"
                                      style={{ fontSize: "0.66rem", color: "var(--color-text-tertiary)" }}>
                                      🔒
                                    </span>
                                  ) : isLocked ? (
                                    // Kilitli → küçük kalem ikon (düzenlemek için tıkla)
                                    <button
                                      type="button"
                                      onClick={() => enterEditing(h.X1ID)}
                                      disabled={savingRowId === h.X1ID || isSaving}
                                      title="Sonuç kaydedildi — düzenlemek için tıklayın"
                                      style={{
                                        width: 30, height: 28, padding: 0,
                                        borderRadius: 7, border: "1px solid #34c75940",
                                        background: "#34c75912", color: "#248a3d",
                                        cursor: "pointer",
                                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                                      }}
                                    >
                                      <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                                        <path d="M5.433 13.917l1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z"/>
                                        <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z"/>
                                      </svg>
                                    </button>
                                  ) : (
                                    // Düzenleme modunda (ilk kez veya kalem ile açılmış) → Kaydet
                                    <button
                                      type="button"
                                      onClick={() => void saveSingleRow(row, h.X1ID)}
                                      disabled={savingRowId === h.X1ID || isSaving}
                                      title="Sonucu kaydet"
                                      style={{
                                        padding: "5px 10px", borderRadius: 6, border: "none",
                                        background: "var(--color-accent)", color: "#fff",
                                        fontSize: "0.72rem", fontWeight: 700,
                                        cursor: (savingRowId === h.X1ID || isSaving) ? "wait" : "pointer",
                                        opacity: (savingRowId === h.X1ID || isSaving) ? 0.6 : 1,
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {savingRowId === h.X1ID ? "…" : "Kaydet"}
                                    </button>
                                  )}
                                </td>
                              </tr>

                              {/* Alt parametreler (bileşenler) — Sonuç + Değerlendirme girişi */}
                              {bilesenler.length > 0 && (
                                <tr style={{
                                  background: isLocked ? "#34c75906" : "rgba(0,0,0,0.012)",
                                  borderLeft: isLocked ? "3px solid #34c759" : "3px solid transparent",
                                  borderBottom: hi < hizmetler.length - 1 ? "1px solid var(--color-border-light)" : "none",
                                }}>
                                  <td />
                                  <td colSpan={9} style={{ padding: "2px 12px 12px 30px" }}>
                                    <div style={{ fontSize: "0.66rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-tertiary)", margin: "4px 0 6px" }}>
                                      Alt Parametreler
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "minmax(120px,1.4fr) 130px 66px 66px 90px 140px", gap: 8, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-tertiary)", paddingBottom: 3 }}>
                                      <span>Bileşen</span><span>Sonuç</span>
                                      <span style={{ textAlign: "center" }}>Birim</span>
                                      <span style={{ textAlign: "center" }}>LOQ</span>
                                      <span style={{ textAlign: "center" }}>Limit</span>
                                      <span>Değerlendirme</span>
                                    </div>
                                    {bilesenler.map((bp, bi) => (
                                      <div key={bi} style={{ display: "grid", gridTemplateColumns: "minmax(120px,1.4fr) 130px 66px 66px 90px 140px", gap: 8, alignItems: "center", padding: "3px 0" }}>
                                        <span style={{ fontSize: "0.8rem", color: "var(--color-text-primary)", fontWeight: 500 }}>{bp.BilesenAdi || "—"}</span>
                                        <input
                                          value={bp.Sonuc || ""}
                                          disabled={isLocked}
                                          placeholder="sonuç"
                                          onChange={e => setBilesenValue(key, h.X1ID, bilesenler, bi, "Sonuc", e.target.value)}
                                          style={{ width: "100%", padding: "4px 7px", borderWidth: 1, borderStyle: "solid", borderColor: "var(--color-border)", borderRadius: 6, fontSize: "0.8rem", outline: "none", background: isLocked ? "transparent" : "var(--color-bg)", color: "var(--color-text-primary)" }}
                                        />
                                        <span style={{ fontSize: "0.74rem", color: "var(--color-text-secondary)", textAlign: "center" }}>{bp.Birim || "—"}</span>
                                        <span style={{ fontSize: "0.74rem", color: "var(--color-text-secondary)", textAlign: "center" }}>{bp.LOQ || "—"}</span>
                                        <span style={{ fontSize: "0.74rem", color: "var(--color-text-secondary)", textAlign: "center" }}>{bp.Limit || "—"}</span>
                                        <select
                                          value={bp.Degerlendirme || ""}
                                          disabled={isLocked}
                                          onChange={e => setBilesenValue(key, h.X1ID, bilesenler, bi, "Degerlendirme", e.target.value)}
                                          style={{
                                            width: "100%", padding: "4px 6px", borderWidth: 1, borderStyle: "solid", borderColor: "var(--color-border)", borderRadius: 6,
                                            fontSize: "0.78rem", outline: "none", cursor: isLocked ? "not-allowed" : "pointer",
                                            background: bp.Degerlendirme === "Uygun" ? "#34c75914" : bp.Degerlendirme === "Uygun Değil" ? "#ff2d5514" : "var(--color-bg)",
                                            color: bp.Degerlendirme === "Uygun" ? "#248a3d" : bp.Degerlendirme === "Uygun Değil" ? "#c1001a" : "var(--color-text-secondary)",
                                            fontWeight: bp.Degerlendirme ? 600 : 400,
                                          }}
                                        >
                                          <option value="">—</option>
                                          <option value="Uygun">Uygun</option>
                                          <option value="Uygun Değil">Uygun Değil</option>
                                          <option value="D.Y.">D.Y.</option>
                                        </select>
                                      </div>
                                    ))}
                                  </td>
                                </tr>
                              )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>

                      {/* Tümünü kaydet satırı (opsiyonel — tek tek kaydetmek isteyene gerek yok) */}
                      <div style={{
                        display: "flex", alignItems: "center", justifyContent: "flex-end",
                        gap: 10, padding: "10px 16px 2px",
                      }}>
                        {saveError[key] && (
                          <span style={{ fontSize: "0.78rem", color: "#c00" }}>{saveError[key]}</span>
                        )}
                        <button
                          onClick={() => saveHizmetler(row)}
                          disabled={isSaving}
                          style={{
                            padding: "6px 16px", borderRadius: 8, border: "1px solid var(--color-border)",
                            background: "var(--color-surface)", color: "var(--color-text-primary)",
                            fontSize: "0.78rem", fontWeight: 500, cursor: isSaving ? "wait" : "pointer",
                            opacity: isSaving ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6,
                          }}
                          title="Tüm sonuçları toplu kaydet"
                        >
                          {isSaving && <span className={styles.loader} />}
                          {isSaving ? "Kaydediliyor…" : "Tümünü Kaydet"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Sayfalama */}
        {!loading && totalPages > 1 && (
          <div className={styles.pagination}>
            <button className={styles.pageBtn} onClick={() => goTo(page - 1)} disabled={page === 1 || transitioning}>‹</button>
            {pageNums().map((n, i) =>
              n === "…"
                ? <span key={`d${i}`} className={styles.pageDots}>…</span>
                : <button key={n}
                    className={`${styles.pageBtn} ${page === n ? styles.pageBtnActive : ""}`}
                    disabled={transitioning}
                    onClick={() => goTo(n as number)}
                  >{n}</button>
            )}
            <button className={styles.pageBtn} onClick={() => goTo(page + 1)} disabled={page === totalPages || transitioning}>›</button>
            <span className={styles.pageInfo}>{total} rapor</span>
          </div>
        )}
      </div>

      {/* ── Gönder Modalı ─────────────────────────────────────────────────── */}
      {gonderRow && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.45)", display: "flex",
            alignItems: "center", justifyContent: "center", padding: 20,
          }}
          onClick={() => setGonderRow(null)}
        >
          <div
            style={{
              background: "var(--color-bg)", borderRadius: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,.25)",
              width: "min(900px, 100%)", maxHeight: "92vh",
              display: "flex", flexDirection: "column", overflow: "hidden",
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal başlık */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 24px", borderBottom: "1px solid var(--color-border-light)",
              flexShrink: 0,
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: "1rem" }}>Raporu Gönder</div>
                <div style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", marginTop: 2 }}>
                  {gonderRow.RaporNo} · {gonderRow.RaporFormati} · {gonderRow.FirmaAd ?? "—"}
                </div>
              </div>
              <button
                onClick={() => setGonderRow(null)}
                style={{ background: "none", border: "none", cursor: "pointer",
                         color: "var(--color-text-tertiary)", fontSize: "1.3rem", lineHeight: 1 }}
              >✕</button>
            </div>

            {/* İçerik: önizleme + form */}
            <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

              {/* PDF önizleme */}
              <div style={{ flex: 1, borderRight: "1px solid var(--color-border-light)", overflow: "hidden" }}>
                <iframe
                  src={`/api/rapor-takip/yazdir/${gonderRow.NkrID}?format=${encodeURIComponent(gonderRow.RaporFormati)}&output=html`}
                  style={{ width: "100%", height: "100%", border: "none" }}
                  title="Rapor Önizleme"
                />
              </div>

              {/* Email formu */}
              <div style={{
                width: 300, flexShrink: 0, display: "flex", flexDirection: "column",
                padding: "20px 20px 0",
              }}>
                {gonderDone ? (
                  <div style={{
                    flex: 1, display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center",
                  }}>
                    <div style={{ fontSize: "2.5rem" }}>✅</div>
                    <div style={{ fontWeight: 700, fontSize: "1rem" }}>Gönderildi!</div>
                    <div style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
                      Rapor {gonderTo} adresine iletildi.
                    </div>
                    <button
                      onClick={() => setGonderRow(null)}
                      style={{
                        marginTop: 8, padding: "8px 20px", borderRadius: 8,
                        border: "1px solid var(--color-border)", background: "none",
                        cursor: "pointer", fontSize: "0.85rem",
                      }}
                    >Kapat</button>
                  </div>
                ) : (
                  <>
                    <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
                      {/* Alıcı */}
                      <div>
                        <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--color-text-secondary)",
                                        textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          Alıcı (To) *
                        </label>
                        <input
                          type="text"
                          value={gonderTo}
                          onChange={e => setGonderTo(e.target.value)}
                          placeholder="ornek@firma.com"
                          style={{
                            marginTop: 4, width: "100%", padding: "7px 10px",
                            border: "1px solid var(--color-border)", borderRadius: 7,
                            fontSize: "0.82rem", background: "var(--color-bg)",
                            color: "var(--color-text-primary)", outline: "none",
                          }}
                        />
                        <div style={{ fontSize: "0.7rem", color: "var(--color-text-tertiary)", marginTop: 3 }}>
                          Virgülle ayırarak birden fazla ekleyebilirsiniz.
                        </div>
                      </div>

                      {/* CC */}
                      <div>
                        <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--color-text-secondary)",
                                        textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          CC (opsiyonel)
                        </label>
                        <input
                          type="text"
                          value={gonderCc}
                          onChange={e => setGonderCc(e.target.value)}
                          placeholder="cc@firma.com"
                          style={{
                            marginTop: 4, width: "100%", padding: "7px 10px",
                            border: "1px solid var(--color-border)", borderRadius: 7,
                            fontSize: "0.82rem", background: "var(--color-bg)",
                            color: "var(--color-text-primary)", outline: "none",
                          }}
                        />
                      </div>

                      {/* Konu */}
                      <div>
                        <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--color-text-secondary)",
                                        textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          Konu
                        </label>
                        <input
                          type="text"
                          value={gonderKonu}
                          onChange={e => setGonderKonu(e.target.value)}
                          placeholder={`Analiz Raporu — ${gonderRow.RaporNo}`}
                          style={{
                            marginTop: 4, width: "100%", padding: "7px 10px",
                            border: "1px solid var(--color-border)", borderRadius: 7,
                            fontSize: "0.82rem", background: "var(--color-bg)",
                            color: "var(--color-text-primary)", outline: "none",
                          }}
                        />
                      </div>

                      {/* Mesaj */}
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--color-text-secondary)",
                                        textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          Ek Mesaj
                        </label>
                        <textarea
                          value={gonderMesaj}
                          onChange={e => setGonderMesaj(e.target.value)}
                          placeholder="Sayın yetkili, raporunuz ektedir…"
                          rows={4}
                          style={{
                            marginTop: 4, width: "100%", padding: "7px 10px",
                            border: "1px solid var(--color-border)", borderRadius: 7,
                            fontSize: "0.82rem", background: "var(--color-bg)",
                            color: "var(--color-text-primary)", outline: "none",
                            resize: "vertical",
                          }}
                        />
                      </div>

                      <div style={{ fontSize: "0.72rem", color: "var(--color-text-tertiary)" }}>
                        Rapor Word (.docx) olarak ek gönderilir.
                      </div>

                      {gonderError && (
                        <div style={{ fontSize: "0.78rem", color: "#c00", background: "#fff0f0",
                                      padding: "8px 10px", borderRadius: 7 }}>
                          {gonderError}
                        </div>
                      )}
                    </div>

                    {/* Gönder butonu */}
                    <div style={{ padding: "14px 0", flexShrink: 0 }}>
                      <button
                        onClick={doGonder}
                        disabled={gonderLoading || !gonderTo.trim()}
                        style={{
                          width: "100%", padding: "10px 0", borderRadius: 9,
                          border: "none", background: "var(--color-accent)", color: "#fff",
                          fontSize: "0.9rem", fontWeight: 700, cursor: gonderLoading || !gonderTo.trim() ? "not-allowed" : "pointer",
                          opacity: gonderLoading || !gonderTo.trim() ? 0.6 : 1,
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        }}
                      >
                        {gonderLoading && <span className={styles.loader} />}
                        {gonderLoading ? "Gönderiliyor…" : "Gönder"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
