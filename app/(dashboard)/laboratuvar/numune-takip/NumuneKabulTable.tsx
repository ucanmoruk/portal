"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import styles from "@/app/styles/table.module.css";
import { printBarcodes, type BarcodeNumune } from "../yeni-numune/printBarcode";
import EvrakDetayModal from "./EvrakDetayModal";

const upperTr = (value?: string | null) => value ? value.toLocaleUpperCase("tr-TR") : "";

// ── Tipler ──────────────────────────────────────────────────────
interface NumuneItem {
  ID: number;
  Evrak_No: string;
  RaporNo: string;
  DisRaporKodu?: string | null;  // ÜGAM/RR26/XXXX (birden fazla varsa virgülle)
  Numune_Adi: string;
  Grup: string | null;
  Tur: string | null;
  Asama?: string;          // Numune Takip aşaması (Kabul Bekliyor / Sonuç Girişi / Onay Bekliyor / Onaylandı)
}

// Aşama → rozet rengi (Numune Takip sekmeleriyle aynı semantik)
const ASAMA_STYLE: Record<string, { bg: string; color: string }> = {
  "Kabul Bekliyor":    { bg: "#fff3cd",   color: "#9a6700" },
  "Analiz Aşamasında": { bg: "#e8f0fe",   color: "#0071e3" },
  "Onay Bekliyor":     { bg: "#ffeed6",   color: "#c06800" },
  "Onaylandı":         { bg: "#e6f6ee",   color: "#1a7f4b" },
};

interface EvrakGroup {
  evrakNo: string;
  tarih: string | null;
  firmaAd: string | null;
  projeAd: string | null;
  numuneSayisi: number;
  raporDurumu: string | null;
  odemeDurumu: string | null;
  proformaId?: number | null;
  proformaNo?: string | null;
  hasEslestirme: boolean;
  numuneler: NumuneItem[];
}

interface TeklifOpt {
  ID: number;
  TeklifNo: number | null;
  RevNo: number;
  MusteriAd: string;
}

// Fatura kesilmiş = ödeme aşamasına geçmiş durumlar; diğerleri (null dahil) → Faturalandır aktif
const isFaturali = (d: string | null) =>
  d === "Ödendi" || d === "Bekliyor" || d === "Ödeme Bekliyor" || d === "Kısmen Ödendi";

// Sayfa ilk acildiginda tarih filtresi varsayilani: son 4 ay (bugun - 4 ay → bugun).
function lastFourMonthsRange(): { tarihBas: string; tarihBit: string } {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() - 4, today.getDate());
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { tarihBas: fmt(start), tarihBit: fmt(today) };
}

// ── Yardımcı bileşenler ──────────────────────────────────────────
function OdemeBadge({ durum }: { durum: string | null }) {
  if (!durum) return (
    <span style={{
      display: "inline-block", padding: "2px 9px", borderRadius: 10,
      fontSize: "0.72rem", fontWeight: 600, background: "#8e8e9318", color: "#636366",
    }}>Fatura Kesilmedi</span>
  );
  const map: Record<string, { bg: string; fg: string }> = {
    "Ödendi":         { bg: "#34c75918", fg: "#248a3d" },
    "Proforma": { bg: "#007aff18", fg: "#0055a8" },
    "Proforma Onaylandı": { bg: "#34c75918", fg: "#248a3d" },
    "Proforma Reddedildi": { bg: "#ff3b3018", fg: "#c72216" },
    "Bekliyor":       { bg: "#ff950018", fg: "#c06800" },
    "Ödeme Bekliyor": { bg: "#ff950018", fg: "#c06800" },
    "Kısmen Ödendi":  { bg: "#007aff18", fg: "#0055a8" },
  };
  const c = map[durum] ?? { bg: "#8e8e9318", fg: "#636366" };
  return (
    <span style={{
      display: "inline-block", padding: "2px 9px", borderRadius: 10,
      fontSize: "0.72rem", fontWeight: 600, background: c.bg, color: c.fg,
    }}>{durum}</span>
  );
}

function NumuneBadge({ count }: { count: number }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "2px 8px", borderRadius: 10, fontSize: "0.72rem", fontWeight: 600,
      background: "var(--color-accent-light)", color: "var(--color-accent)",
    }}>
      {count}
    </span>
  );
}

const RAPOR_DURUM_MANUEL_OPTS = ["Analiz Aşamasında", "Bekletiliyor", "Gönderildi"];

const RAPOR_DURUM_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  "Analiz Aşamasında": { bg: "#e8f0fe", color: "#0071e3", border: "#0071e333" },
  "Gönderildi": { bg: "#e6f6ee", color: "#1a7f4b", border: "#34c75940" },
  "Bekletiliyor": { bg: "#fff3cd", color: "#9a6700", border: "#ffcc0044" },
  "Mixed": { bg: "#f5f5f7", color: "#6e6e73", border: "#d1d1d6" },
};

// ── Ana bileşen ─────────────────────────────────────────────────
export default function NumuneKabulTable() {
  const router = useRouter();
  const [groups, setGroups]         = useState<EvrakGroup[]>([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [limit, setLimit]           = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch]         = useState("");
  // ── Filtreler ──
  // Varsayilan: son 4 ay. Kullanici "Temizle" yaparsa tum tarihlere doner.
  const defaultRange = lastFourMonthsRange();
  const [tarihBas, setTarihBas]           = useState(defaultRange.tarihBas);
  const [tarihBit, setTarihBit]           = useState(defaultRange.tarihBit);
  const [odemeFilter, setOdemeFilter]     = useState("");
  const [raporDurumFilter, setRaporDurumFilter] = useState("");
  const filtersRef = useRef({ tarihBas: defaultRange.tarihBas, tarihBit: defaultRange.tarihBit, odeme: "", raporDurumu: "" });
  const [loading, setLoading]       = useState(true);
  const [transitioning, setTransitioning] = useState(false); // sayfa geçişi (skeleton değil, overlay)
  const [error, setError]           = useState("");

  // Accordion
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  const [deleteId, setDeleteId]   = useState<number | null>(null);
  const [deleting, setDeleting]   = useState(false);

  const [selectedIds, setSelectedIds]       = useState<Set<number>>(new Set());
  const [printMenuEvrak, setPrintMenuEvrak] = useState<string | null>(null);
  const [invoiceGroup, setInvoiceGroup] = useState<EvrakGroup | null>(null);
  const [invoiceNkrIds, setInvoiceNkrIds] = useState<number[]>([]);
  const [detayEvrak, setDetayEvrak] = useState<string | null>(null);
  const [invoiceTeklifId, setInvoiceTeklifId] = useState("");
  const [invoiceOffers, setInvoiceOffers] = useState<TeklifOpt[]>([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [durumSaving, setDurumSaving] = useState<Record<string, boolean>>({});

  const toggleSelect = (id: number) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const groupSelectedIds = (numuneler: NumuneItem[]) =>
    numuneler.filter(n => selectedIds.has(n.ID)).map(n => n.ID);

  const toggleGroupSelection = (numuneler: NumuneItem[]) =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allSelected = numuneler.length > 0 && numuneler.every(n => next.has(n.ID));
      for (const n of numuneler) {
        if (allSelected) next.delete(n.ID);
        else next.add(n.ID);
      }
      return next;
    });

  const handlePrint = (ids: number[], lang: "tr" | "en") => {
    window.open(`/laboratuvar/rapor-yazdir?ids=${ids.join(",")}&lang=${lang}`, "_blank", "noopener,noreferrer");
    setPrintMenuEvrak(null);
  };

  const [barcodeBusy, setBarcodeBusy] = useState(false);

  const handlePrintBarcodes = async (ids: number[]) => {
    if (ids.length === 0 || barcodeBusy) return;
    setBarcodeBusy(true);
    try {
      const res = await fetch(`/api/numune-form/barcode-data?ids=${ids.join(",")}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Barkod verisi alınamadı");
      const data: BarcodeNumune[] = (json.data || []).map((d: any) => ({
        RaporNo: d.RaporNo,
        NumuneAd: d.NumuneAd,
        FirmaAd: d.FirmaAd,
        Tarih: d.Tarih,
        hizmetler: d.hizmetler || [],
      }));
      if (data.length === 0) {
        alert("Seçili numune bulunamadı.");
        return;
      }
      printBarcodes(data);
      setPrintMenuEvrak(null);
    } catch (e: any) {
      alert(e.message || "Barkod yazdırılamadı");
    } finally {
      setBarcodeBusy(false);
    }
  };

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef    = useRef<AbortController | null>(null);
  const latestReqId = useRef(0); // monotone artan — yalnızca son istek geçerli
  const didMount    = useRef(false); // sayfa/limit effect'i mount'ta çalışmasın

  // ── Veri çekme ──────────────────────────────────────────────
  const fetchData = useCallback(async (
    p: number, s: string, l: number,
    opts: { clearFirst?: boolean } = {}
  ) => {
    // Her çağrıya benzersiz ID ver; yalnızca en son ID'li yanıt işlenir
    const reqId = ++latestReqId.current;

    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    if (opts.clearFirst) {
      // Arama: eski grupları temizle + skeleton göster
      setGroups([]);
      setLoading(true);
      setTransitioning(false);
    } else {
      // Sayfa/limit geçişi: eski grupları koru, hafif overlay
      setTransitioning(true);
      setLoading(false);
    }
    setError("");

    try {
      const fr = filtersRef.current;
      const filterQs =
        (fr.tarihBas    ? `&tarihBas=${fr.tarihBas}` : "") +
        (fr.tarihBit    ? `&tarihBit=${fr.tarihBit}` : "") +
        (fr.odeme       ? `&odeme=${encodeURIComponent(fr.odeme)}` : "") +
        (fr.raporDurumu ? `&raporDurumu=${encodeURIComponent(fr.raporDurumu)}` : "");
      const res = await fetch(
        `/api/numune-kabul?page=${p}&limit=${l}&search=${encodeURIComponent(s)}${filterQs}`,
        { signal: ctrl.signal }
      );

      // Eski istek tamamlandıysa yoksay
      if (reqId !== latestReqId.current) return;

      if (!res.ok) throw new Error((await res.json()).error || "Hata");
      const json = await res.json();

      setGroups(json.data);
      setTotal(json.total);
      setTotalPages(json.totalPages);
    } catch (e: any) {
      if (e.name === "AbortError" || reqId !== latestReqId.current) return;
      setError(e.message);
    } finally {
      if (reqId === latestReqId.current) {
        setLoading(false);
        setTransitioning(false);
      }
    }
  }, []);

  // İlk yükleme — bir kez çalışır
  useEffect(() => {
    fetchData(1, "", limit, { clearFirst: true });
  }, []);

  // Sayfa / limit değişimi — mount sonrası her değişimde çalışır
  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    fetchData(page, search, limit, { clearFirst: false });
  }, [page, limit]);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      fetchData(1, val, limit, { clearFirst: true });
    }, 200);
  };

  // ── Filtre uygula / temizle ──
  const applyFilters = (patch: Partial<{ tarihBas: string; tarihBit: string; odeme: string; raporDurumu: string }>) => {
    const next = { ...filtersRef.current, ...patch };
    filtersRef.current = next;
    setTarihBas(next.tarihBas);
    setTarihBit(next.tarihBit);
    setOdemeFilter(next.odeme);
    setRaporDurumFilter(next.raporDurumu);
    setPage(1);
    fetchData(1, search, limit, { clearFirst: true });
  };

  const clearFilters = () => {
    filtersRef.current = { tarihBas: "", tarihBit: "", odeme: "", raporDurumu: "" };
    setTarihBas(""); setTarihBit(""); setOdemeFilter(""); setRaporDurumFilter("");
    setPage(1);
    fetchData(1, search, limit, { clearFirst: true });
  };

  const hasActiveFilter = !!(tarihBas || tarihBit || odemeFilter || raporDurumFilter);

  const ODEME_OPTS = ["Ödendi", "Fatura Kesilmedi", "Ödeme Bekliyor", "Proforma Onaylandı", "Proforma Reddedildi", "Kısmen Ödendi", "İptal"];
  const RAPOR_DURUM_OPTS = RAPOR_DURUM_MANUEL_OPTS;

  const handleRaporDurumuChange = async (group: EvrakGroup, raporDurumu: string) => {
    const prevDurum = group.raporDurumu || "Analiz Aşamasında";
    setGroups(prev => prev.map(g => g.evrakNo === group.evrakNo ? { ...g, raporDurumu } : g));
    setDurumSaving(prev => ({ ...prev, [group.evrakNo]: true }));
    try {
      const res = await fetch("/api/numune-kabul", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evrakNo: group.evrakNo, raporDurumu }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Rapor durumu güncellenemedi");
    } catch (e: any) {
      setGroups(prev => prev.map(g => g.evrakNo === group.evrakNo ? { ...g, raporDurumu: prevDurum } : g));
      setError(e.message || "Rapor durumu güncellenemedi");
    } finally {
      setDurumSaving(prev => {
        const next = { ...prev };
        delete next[group.evrakNo];
        return next;
      });
    }
  };

  // ── Accordion ───────────────────────────────────────────────
  const toggleGroup = (evrakNo: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      next.has(evrakNo) ? next.delete(evrakNo) : next.add(evrakNo);
      return next;
    });
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/numune-kabul/${deleteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Silinemedi");
      setDeleteId(null);
      fetchData(page, search, limit, { clearFirst: false });
    } catch (e: any) { setError(e.message); }
    finally { setDeleting(false); }
  };

  const openNew = () => { router.push("/laboratuvar/numune-form"); };
  const openEdit = (n: NumuneItem) => {
    window.open(`/laboratuvar/numune-form/${n.ID}`, "_blank", "noopener,noreferrer");
  };
  const openProforma = (id: number) => {
    window.open(`/musteriler/proforma-listesi/${id}/duzenle`, "_blank", "noopener,noreferrer");
  };

  const loadInvoiceOffers = async () => {
    setInvoiceOffers([]);
    setInvoiceLoading(true);
    try {
      const res = await fetch("/api/teklifler?page=1&limit=100");
      const json = await res.json();
      setInvoiceOffers(json.data || []);
    } finally {
      setInvoiceLoading(false);
    }
  };

  const openInvoice = async (group: EvrakGroup, nkrIds: number[] = []) => {
    setInvoiceGroup(group);
    setInvoiceNkrIds(nkrIds);
    setInvoiceTeklifId("");
    await loadInvoiceOffers();
  };

  const openSelectedInvoice = async () => {
    const selectedRows: { group: EvrakGroup; numune: NumuneItem }[] = [];
    groups.forEach(group => {
      group.numuneler.forEach(numune => {
        if (selectedIds.has(numune.ID)) selectedRows.push({ group, numune });
      });
    });
    if (selectedRows.length === 0) {
      alert("Proforma oluşturmak için listeden en az bir numune seç.");
      return;
    }

    const firmaNames = Array.from(new Set(
      selectedRows.map(x => upperTr(x.group.firmaAd || "").trim()).filter(Boolean)
    ));
    if (firmaNames.length > 1) {
      alert("Tek proforma için aynı firmaya ait numuneleri seçmelisin.");
      return;
    }

    const evrakNos = Array.from(new Set(selectedRows.map(x => x.group.evrakNo).filter(Boolean)));
    const firstGroup = selectedRows[0].group;
    await openInvoice({
      ...firstGroup,
      evrakNo: evrakNos.length === 1 ? evrakNos[0] : `Çoklu (${evrakNos.length} evrak)`,
      numuneSayisi: selectedRows.length,
      numuneler: selectedRows.map(x => x.numune),
    }, selectedRows.map(x => x.numune.ID));
  };

  const continueInvoice = () => {
    if (!invoiceGroup) return;
    const qs = new URLSearchParams({ evrakNo: invoiceGroup.evrakNo });
    if (invoiceNkrIds.length > 0) qs.set("nkrIds", invoiceNkrIds.join(","));
    if (invoiceTeklifId) qs.set("teklifId", invoiceTeklifId);
    // Yeni sekmede aç — numune takip listesi açık kalsın.
    window.open(`/musteriler/proforma-listesi/yeni?${qs.toString()}`, "_blank", "noopener,noreferrer");
    setInvoiceGroup(null);
    setInvoiceNkrIds([]);
  };

  const teklifLabel = (t: TeklifOpt) =>
    `${t.TeklifNo ? `ROT${t.TeklifNo}${t.RevNo > 0 ? `/${t.RevNo}` : ""}` : `Teklif #${t.ID}`} - ${t.MusteriAd || "Firma yok"}`;

  // ── Sayfalama ────────────────────────────────────────────────
  const goTo = (p: number) => { if (p >= 1 && p <= totalPages) setPage(p); };
  const pageNums = () => {
    const nums: (number | "…")[] = [];
    if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) nums.push(i); }
    else {
      nums.push(1);
      if (page > 3) nums.push("…");
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) nums.push(i);
      if (page < totalPages - 2) nums.push("…");
      nums.push(totalPages);
    }
    return nums;
  };

  const formatTarih = (t: string | null) => {
    if (!t) return "—";
    const [y, m, d] = t.split("-");
    return `${d}.${m}.${y}`;
  };

  const raporFilterStyle = raporDurumFilter ? RAPOR_DURUM_STYLE[raporDurumFilter] : null;
  const selectedVisibleCount = groups.reduce(
    (sum, group) => sum + group.numuneler.filter(n => selectedIds.has(n.ID)).length,
    0
  );

  // ── Render ───────────────────────────────────────────────────
  return (
    <>
      {/* ── Toolbar ── */}
      <div className={styles.toolbar} style={{ width: "100%" }}>
        <div className={styles.toolbarLeft} style={{ minWidth: 0, flexWrap: "wrap" }}>
          <div className={styles.searchBox} style={{ width: "min(340px, 100%)", minWidth: 220 }}>
            <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
            </svg>
            <input
              className={styles.searchInput}
              placeholder="Evrak no, rapor no, firma, numune adı, proje…"
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
          <span className={styles.totalCount}>{total} evrak</span>
          {selectedVisibleCount > 0 && (
            <button
              className={styles.addBtn}
              onClick={openSelectedInvoice}
              style={{ padding: "7px 12px", fontSize: 12 }}
              title="Seçili numunelerden tek proforma oluştur"
            >
              Seçili Proforma ({selectedVisibleCount})
            </button>
          )}
        </div>
        <div className={styles.toolbarRight} style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
          <select className={styles.pageSizeSelect} value={limit}
            onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
            {[10, 20, 50].map(n => <option key={n} value={n}>{n} / sayfa</option>)}
          </select>
          <button className={styles.addBtn}
            onClick={() => router.push("/laboratuvar/yeni-numune")} >
            Çoklu Giriş
          </button>
          <button className={styles.addBtn} onClick={openNew}>
            <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
            Yeni Numune
          </button>

        </div>
      </div>

      {/* ── Filtre çubuğu ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "0 0 12px" }}>
        <span style={{ fontSize: 12, color: "var(--color-text-tertiary)", fontWeight: 600 }}>Filtreler:</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-secondary)" }}>
          <span>Tarih</span>
          <input type="date" value={tarihBas} max={tarihBit || undefined}
            onChange={e => applyFilters({ tarihBas: e.target.value })}
            style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 12, background: "var(--color-bg-elevated, #fff)", color: "inherit" }} />
          <span>—</span>
          <input type="date" value={tarihBit} min={tarihBas || undefined}
            onChange={e => applyFilters({ tarihBit: e.target.value })}
            style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 12, background: "var(--color-bg-elevated, #fff)", color: "inherit" }} />
        </div>
        <select value={odemeFilter} onChange={e => applyFilters({ odeme: e.target.value })}
          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 12, background: "var(--color-bg-elevated, #fff)", color: "inherit", cursor: "pointer" }}>
          <option value="">Ödeme: Tümü</option>
          {ODEME_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={raporDurumFilter} onChange={e => applyFilters({ raporDurumu: e.target.value })}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: `1px solid ${raporFilterStyle?.border || "var(--color-border)"}`,
            fontSize: 12,
            background: raporFilterStyle?.bg || "var(--color-bg-elevated, #fff)",
            color: raporFilterStyle?.color || "inherit",
            cursor: "pointer",
            fontWeight: raporFilterStyle ? 700 : 400,
          }}>
          <option value="">Rapor Durumu: Tümü</option>
          {RAPOR_DURUM_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        {hasActiveFilter && (
          <button onClick={clearFilters}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--color-border)", background: "transparent", fontSize: 12, color: "var(--color-accent)", cursor: "pointer", fontWeight: 600 }}>
            Filtreleri temizle ✕
          </button>
        )}
      </div>

      {/* ── Accordion listesi ── */}
      <div
        className={styles.tableCard}
        style={{ position: "relative", opacity: transitioning ? 0.55 : 1, transition: "opacity 0.15s" }}
      >
        {error && <div className={styles.errorBar}>{error}</div>}

        {/* ── Kolon başlıkları ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 0,
          padding: "8px 16px",
          borderBottom: "1px solid var(--color-border-light)",
          background: "var(--color-surface)",
        }}>
          <div style={{ width: 24 }} /> {/* chevron */}
          <div style={{ width: 78,  fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-tertiary)" }}>Tarih</div>
          <div style={{ width: 104, fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-tertiary)" }}>Evrak No</div>
          <div style={{ flex: 1,    fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-tertiary)" }}>Firma / Proje</div>
          <div style={{ width: 54,  fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-tertiary)", textAlign: "center" }}>Numune</div>
          <div style={{ width: 132,  fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-tertiary)", textAlign: "center" }}>Rapor Durumu</div>
          <div style={{ width: 118,  fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-tertiary)", textAlign: "center" }}>Ödeme</div>
          <div style={{ width: 70,  fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-tertiary)", textAlign: "center" }}>İşlem</div>
        </div>

        {/* Skeleton */}
        {loading && (
          <div style={{ padding: "6px 0" }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 20px",
                borderBottom: "1px solid var(--color-border-light)",
              }}>
                <span className={styles.skeleton} style={{ width: 14, height: 14, borderRadius: 3 }} />
                <span className={styles.skeleton} style={{ width: 80 }} />
                <span className={styles.skeleton} style={{ width: 96 }} />
                <span className={styles.skeleton} style={{ flex: 1 }} />
                <span className={styles.skeleton} style={{ width: 52 }} />
                <span className={styles.skeleton} style={{ width: 124 }} />
                <span className={styles.skeleton} style={{ width: 100 }} />
                <span className={styles.skeleton} style={{ width: 68, height: 28, borderRadius: 6 }} />
              </div>
            ))}
          </div>
        )}

        {/* Boş */}
        {!loading && groups.length === 0 && (
          <div className={styles.empty}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="36" height="36">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            Kayıt bulunamadı
          </div>
        )}

        {/* Accordion grupları */}
        {!loading && groups.map((group, gi) => {
          const isOpen = openGroups.has(group.evrakNo);
          const selectedInGroup = groupSelectedIds(group.numuneler).length;
          const allGroupSelected = group.numuneler.length > 0 && selectedInGroup === group.numuneler.length;
          const someGroupSelected = selectedInGroup > 0 && !allGroupSelected;
          const invoiceButtonTitle = isFaturali(group.odemeDurumu)
            ? "Fatura kesilmiş"
            : (group.proformaId ? `Proformaya git${group.proformaNo ? `: ${group.proformaNo}` : ""}` : "Faturalandır");
          return (
            <div
              key={group.evrakNo}
              style={{ borderBottom: gi < groups.length - 1 ? "1px solid var(--color-border-light)" : "none" }}
            >
              {/* ── Grup başlık satırı ── */}
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 0,
                  padding: "12px 16px",
                  cursor: "pointer",
                  background: isOpen ? "var(--color-surface-2)" : "transparent",
                  transition: "background 0.12s",
                  userSelect: "none",
                }}
                onClick={() => toggleGroup(group.evrakNo)}
              >
                {/* Chevron */}
                <div style={{ width: 24, flexShrink: 0, display: "flex", alignItems: "center" }}>
                  <svg
                    viewBox="0 0 20 20" fill="currentColor" width="14" height="14"
                    style={{
                      color: "var(--color-text-tertiary)",
                      transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                      transition: "transform 0.18s ease",
                    }}
                  >
                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
                  </svg>
                </div>

                {/* Tarih */}
                <div style={{ width: 78, flexShrink: 0, fontSize: "0.78rem", color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                  {formatTarih(group.tarih)}
                </div>

                {/* Evrak No */}
                <div style={{ width: 104, flexShrink: 0, fontWeight: 700, fontSize: "0.82rem", color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums" }}>
                  {group.evrakNo}
                </div>

                {/* Firma / Proje */}
                <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                  <div style={{
                    fontWeight: 500, fontSize: "0.845rem", color: "var(--color-text-primary)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{upperTr(group.firmaAd) || "—"}</div>
                  {group.projeAd && (
                    <div style={{
                      fontSize: "0.77rem", color: "var(--color-text-tertiary)",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>{group.projeAd}</div>
                  )}
                </div>

                {/* Numune sayısı */}
                <div style={{ width: 54, display: "flex", justifyContent: "center" }}>
                  <NumuneBadge count={group.numuneSayisi} />
                </div>

                {/* Rapor durumu */}
                <div style={{ width: 132, display: "flex", justifyContent: "center" }} onClick={e => e.stopPropagation()}>
                  {(() => {
                    const rawCurrent = group.raporDurumu || "Analiz Aşamasında";
                    const current = rawCurrent === "Mixed" || RAPOR_DURUM_MANUEL_OPTS.includes(rawCurrent)
                      ? rawCurrent
                      : "Analiz Aşamasında";
                    const st = RAPOR_DURUM_STYLE[current] ?? { bg: "#8e8e9318", color: "#636366", border: "#8e8e9340" };
                    return (
                      <select
                        value={current}
                        disabled={!!durumSaving[group.evrakNo] || current === "Mixed"}
                        onChange={e => void handleRaporDurumuChange(group, e.target.value)}
                        title={current === "Mixed" ? "Evraktaki numunelerde farklı rapor durumları var" : "Rapor durumunu değiştir"}
                        style={{
                          width: 124,
                          padding: "5px 6px",
                          borderRadius: 10,
                          border: `1px solid ${st.border}`,
                          background: st.bg,
                          color: st.color,
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          cursor: durumSaving[group.evrakNo] || current === "Mixed" ? "not-allowed" : "pointer",
                          opacity: durumSaving[group.evrakNo] ? 0.65 : 1,
                        }}
                      >
                        {current === "Mixed" && <option value="Mixed">Mixed</option>}
                        {RAPOR_DURUM_MANUEL_OPTS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    );
                  })()}
                </div>

                {/* Ödeme */}
                <div style={{ width: 118, display: "flex", justifyContent: "center" }}>
                  <OdemeBadge durum={group.odemeDurumu} />
                </div>

                {/* Yazdır (seçili varsa) + Faturalandır */}
                <div
                  style={{ width: 70, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, flexShrink: 0 }}
                  onClick={e => e.stopPropagation()}
                >
                  {isOpen && groupSelectedIds(group.numuneler).length > 0 && (
                    <div style={{ position: "relative" }}>
                      <button
                        className={styles.editBtn}
                        style={{ color: "var(--color-accent)", border: "1px solid var(--color-accent)" }}
                        title="Rapor Yazdır"
                        onClick={() => setPrintMenuEvrak(prev => prev === group.evrakNo ? null : group.evrakNo)}
                      >
                        <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                          <path fillRule="evenodd" d="M5 4v3H4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h1v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-1V4a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1Zm2 0h6v3H7V4Zm-1 9v-2h8v2H6Zm8 2H6v-1h8v1Z" clipRule="evenodd" />
                        </svg>
                      </button>
                      {printMenuEvrak === group.evrakNo && (
                        <div style={{
                          position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 400,
                          background: "var(--color-surface)", border: "1px solid var(--color-border)",
                          borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                          minWidth: 180, overflow: "hidden",
                        }}>
                          <div style={{
                            padding: "6px 14px", fontSize: "0.68rem", textTransform: "uppercase",
                            letterSpacing: "0.06em", color: "var(--color-text-tertiary)",
                            background: "var(--color-surface-2)", fontWeight: 600,
                          }}>Rapor</div>
                          {([["tr", "Türkçe"], ["en", "İngilizce"]] as const).map(([lang, label]) => (
                            <button
                              key={lang}
                              type="button"
                              onClick={() => handlePrint(groupSelectedIds(group.numuneler), lang)}
                              style={{
                                display: "block", width: "100%", textAlign: "left",
                                padding: "9px 14px", border: "none", background: "transparent",
                                fontSize: "0.8125rem", cursor: "pointer", color: "var(--color-text-primary)",
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = "var(--color-surface-2)")}
                              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                            >
                              {label}
                            </button>
                          ))}
                          <div style={{
                            padding: "6px 14px", fontSize: "0.68rem", textTransform: "uppercase",
                            letterSpacing: "0.06em", color: "var(--color-text-tertiary)",
                            background: "var(--color-surface-2)", fontWeight: 600,
                            borderTop: "1px solid var(--color-border-light)",
                          }}>Etiket</div>
                          <button
                            type="button"
                            disabled={barcodeBusy}
                            onClick={() => void handlePrintBarcodes(groupSelectedIds(group.numuneler))}
                            style={{
                              display: "block", width: "100%", textAlign: "left",
                              padding: "9px 14px", border: "none", background: "transparent",
                              fontSize: "0.8125rem", cursor: barcodeBusy ? "not-allowed" : "pointer",
                              color: "var(--color-text-primary)",
                              opacity: barcodeBusy ? 0.5 : 1,
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = "var(--color-surface-2)")}
                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                          >
                            🏷  Barkod (bölüme göre)
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  <button
                    className={styles.editBtn}
                    disabled={isFaturali(group.odemeDurumu)}
                    aria-label={invoiceButtonTitle}
                    title={invoiceButtonTitle}
                    onClick={() => {
                      if (group.proformaId) openProforma(group.proformaId);
                      else openInvoice(group);
                    }}
                    style={isFaturali(group.odemeDurumu)
                      ? { opacity: 0.25, cursor: "not-allowed" }
                      : group.proformaId
                        ? { color: "#0055a8", border: "1px solid #007aff40", background: "#007aff10" }
                        : { color: "#248a3d", border: "1px solid #34c75940" }
                    }
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                      <path fillRule="evenodd" d="M4 4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H4Zm0 2h12v8H4V6Zm3 5a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1Zm1-3a1 1 0 0 0 0 2h2a1 1 0 0 0 0-2H8Z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {/* Eşleştirmeler / Detay popup — Teklif veya Dosya eşlenmişse yeşil, aksi mavi */}
                  <button
                    className={styles.editBtn}
                    title={group.hasEslestirme ? "Detay (eşleştirme var)" : "Detay (eşleştirmeler)"}
                    onClick={() => setDetayEvrak(group.evrakNo)}
                    style={group.hasEslestirme
                      ? { color: "#248a3d", border: "1px solid #34c75940" }
                      : { color: "var(--color-accent)", border: "1px solid var(--color-accent)" }}
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                      <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                      <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* ── Açılır numune listesi ── */}
              {isOpen && (
                <div style={{ background: "var(--color-surface-2)", borderTop: "1px solid var(--color-border-light)" }}>
                  {group.numuneler.length === 0 ? (
                    <div style={{ padding: "12px 20px 12px 52px", fontSize: "0.8rem", color: "var(--color-text-tertiary)" }}>
                      Numune bulunamadı.
                    </div>
                  ) : (
                    <table style={{ width: "100%", maxWidth: "100%", borderCollapse: "collapse", fontSize: "0.8rem", tableLayout: "fixed" }}>
                      <colgroup>
                        <col style={{ width: 40 }} />
                        <col style={{ width: 128 }} />
                        <col />
                        <col style={{ width: 112 }} />
                        <col style={{ width: 128 }} />
                        <col style={{ width: 44 }} />
                      </colgroup>
                      <thead>
                        <tr style={{
                          background: "var(--color-surface)",
                          borderBottom: "2px solid var(--color-border)",
                        }}>
                          <th style={{ padding: "6px 6px 6px 16px" }}>
                            <input
                              type="checkbox"
                              checked={allGroupSelected}
                              ref={el => {
                                if (el) el.indeterminate = someGroupSelected;
                              }}
                              onChange={() => toggleGroupSelection(group.numuneler)}
                              title={allGroupSelected ? "Tümünü kaldır" : "Tümünü seç"}
                              aria-label={allGroupSelected ? "Tüm numunelerin seçimini kaldır" : "Tüm numuneleri seç"}
                              style={{ cursor: "pointer", width: 14, height: 14, accentColor: "var(--color-accent)" }}
                            />
                          </th>
                          {([
                            { h: "Rapor No",     w: undefined },
                            { h: "Numune Adı",   w: undefined },
                            { h: "Rapor Durumu", w: 128 },
                            { h: "Grup / Tür",   w: undefined },
                            { h: "",             w: undefined },
                          ] as const).map((c, i) => (
                            <th key={i} style={{
                              padding: "6px 12px",
                              textAlign: "left", fontWeight: 700,
                              fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.07em",
                              color: "var(--color-text-secondary)",
                              whiteSpace: "nowrap",
                              width: c.w,
                            }}>{c.h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {group.numuneler.map((n, ni) => (
                          <tr
                            key={n.ID}
                            style={{
                              borderBottom: ni < group.numuneler.length - 1
                                ? "1px solid var(--color-border-light)"
                                : "none",
                              background: selectedIds.has(n.ID) ? "var(--color-accent-light)" : "transparent",
                            }}
                          >
                            <td style={{ padding: "9px 6px 9px 16px", verticalAlign: "middle" }}>
                              <input
                                type="checkbox"
                                checked={selectedIds.has(n.ID)}
                                onChange={() => toggleSelect(n.ID)}
                                style={{ cursor: "pointer", width: 14, height: 14, accentColor: "var(--color-accent)" }}
                              />
                            </td>
                            <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>
                              <a
                                href={`/laboratuvar/numune-form/${n.ID}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontWeight: 600, color: "var(--color-accent)",
                                  fontVariantNumeric: "tabular-nums",
                                  textDecoration: "none",
                                }}
                                onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                                onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
                              >
                                {n.RaporNo}
                              </a>
                              {n.DisRaporKodu && (
                                <div style={{
                                  fontWeight: 500, fontSize: "0.7rem",
                                  color: "var(--color-text-tertiary)",
                                  fontVariantNumeric: "tabular-nums",
                                  marginTop: 1,
                                }}>
                                  {n.DisRaporKodu}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: "9px 12px", color: "var(--color-text-primary)", fontWeight: 500 }}>
                              {n.Numune_Adi}
                            </td>
                            <td style={{ padding: "9px 12px" }}>
                              {(() => {
                                const asama = n.Asama || "Kabul Bekliyor";
                                const st = ASAMA_STYLE[asama] ?? { bg: "#f5f5f7", color: "#6e6e73" };
                                return (
                                  <span style={{
                                    display: "inline-block", padding: "2px 9px", borderRadius: 10,
                                    fontSize: "0.72rem", fontWeight: 600,
                                    background: st.bg, color: st.color,
                                    whiteSpace: "nowrap",
                                  }}>{asama}</span>
                                );
                              })()}
                            </td>
                            <td style={{ padding: "9px 12px", color: "var(--color-text-secondary)" }}>
                              {[n.Grup, n.Tur].filter(Boolean).join(" / ") || "—"}
                            </td>
                            <td style={{ padding: "9px 8px", display: "flex", gap: 4, alignItems: "center", justifyContent: "flex-end" }}>
                              <button
                                className={styles.editBtn} title="Barkod yazdır (bölüme göre)"
                                style={{ color: "var(--color-accent)" }}
                                disabled={barcodeBusy}
                                onClick={() => void handlePrintBarcodes([n.ID])}
                              >
                                <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                                  <path d="M2 4h1v12H2V4Zm2 0h2v12H4V4Zm3 0h1v12H7V4Zm2 0h2v12H9V4Zm3 0h1v12h-1V4Zm2 0h2v12h-2V4Zm3 0h1v12h-1V4Z" />
                                </svg>
                              </button>
                              <button
                                className={styles.editBtn} title="Pasife Al"
                                style={{ color: "#ff3b30" }}
                                onClick={() => setDeleteId(n.ID)}
                              >
                                <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                                  <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                                </svg>
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
          );
        })}

        {/* ── Sayfalama ── */}
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
            <span className={styles.pageInfo}>{total} evrak</span>
          </div>
        )}
      </div>

      {/* ── PASİFE AL ONAY ── */}
      {deleteId !== null && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Pasife Al</h2>
              <button className={styles.modalClose} onClick={() => setDeleteId(null)}>
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.deleteWarning}>
                Bu numune pasife alınacak ve aktif listeden kaldırılacak. Devam etmek istiyor musunuz?
              </p>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setDeleteId(null)} disabled={deleting}>İptal</button>
              <button className={styles.deleteBtnPrimary} onClick={handleDelete} disabled={deleting}>
                {deleting ? <span className={styles.loader} /> : "Pasife Al"}
              </button>
            </div>
          </div>
        </div>
      )}

      {invoiceGroup && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Faturalandır / Proforma Oluştur</h2>
              <button className={styles.modalClose} onClick={() => { setInvoiceGroup(null); setInvoiceNkrIds([]); }}>
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>
            <div className={styles.modalBody}>
              <p style={{ marginTop: 0, color: "var(--color-text-secondary)" }}>
                Evrak No <strong>{invoiceGroup.evrakNo}</strong> için proforma hazırlanacak. İstersen mevcut bir fiyat teklifini seçebilir veya manuel fiyat girişiyle devam edebilirsin.
              </p>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600 }}>
                Fiyat teklifi
                <select
                  className={styles.pageSizeSelect}
                  value={invoiceTeklifId}
                  onChange={e => setInvoiceTeklifId(e.target.value)}
                  disabled={invoiceLoading}
                  style={{ width: "100%", height: 38 }}
                >
                  <option value="">{invoiceLoading ? "Teklifler yükleniyor..." : "Manuel fiyat gireceğim"}</option>
                  {invoiceOffers.map(t => (
                    <option key={t.ID} value={t.ID}>{teklifLabel(t)}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => { setInvoiceGroup(null); setInvoiceNkrIds([]); }}>Vazgeç</button>
              <button className={styles.addBtn} onClick={continueInvoice}>Devam Et</button>
            </div>
          </div>
        </div>
      )}

      {/* Evrak Detayları / Eşleştirmeler Modal */}
      {detayEvrak && (
        <EvrakDetayModal evrakNo={detayEvrak} onClose={() => setDetayEvrak(null)} />
      )}
    </>
  );
}
