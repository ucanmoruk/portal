"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import styles from "@/app/styles/table.module.css";
import { baseReportFormat, expandReportFormats, type ReportLanguageChoice } from "@/lib/raporFormatLanguage";

const upperTr = (value?: string | null) => value ? value.toLocaleUpperCase("tr-TR") : "";
const englishPreviewFormat = (format: string): string | null => {
  const normalized = format.toLocaleUpperCase("tr-TR");
  if (normalized === "GENEL") return "GenelEn";
  if (normalized === "CHALLENGE") return "ChallengeEn";
  return null;
};

// ── Tipler ──────────────────────────────────────────────────────────────────

interface RaporRow {
  NkrID: number;
  Tarih: string | null;
  KabulTarihi: string | null;
  Evrak_No: string;
  RaporNo: string;
  Revno?: string | null;
  DisRaporKodu?: string | null;
  Barkod?: string | null;
  Numune_Adi: string;
  FirmaAd: string | null;
  ProjeAd: string | null;
  RaporFormati: string;
  RaporDurumu: "Onaylandı" | "Yayınlandı" | string;
  MaxTermin: string | null;
  YayinUrl?: string | null;
  TrYayinlandi?: number | null;
  EnYayinlandi?: number | null;
}

// Sunucu Onaylandı/Yayınlandı/Arşiv döner. UI: Onaylandı | Gönderildi | Arşiv.
function durumLabel(d: string): "Onaylandı" | "Gönderildi" | "Arşiv" | string {
  if (d === "Yayınlandı") return "Gönderildi";
  return d;
}

function DurumBadge({ durum }: { durum: string }) {
  const label = durumLabel(durum);
  const map: Record<string, { bg: string; fg: string }> = {
    "Onaylandı":  { bg: "#34c75918", fg: "#248a3d" },
    "Gönderildi": { bg: "#bf5af218", fg: "#8944ab" },
    "Arşiv":      { bg: "#8e8e9322", fg: "#3a3a3c" },
  };
  const c = map[label] ?? { bg: "#8e8e9318", fg: "#636366" };
  return (
    <span style={{
      display: "inline-block", padding: "2px 9px", borderRadius: 10,
      fontSize: "0.72rem", fontWeight: 600, background: c.bg, color: c.fg, whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

// Rapor formatı badge — Dermatoloji → Claim
function displayFormat(format: string): string {
  if (format === "GenelEn") return "Genel EN";
  if (format === "ChallengeEn") return "Challenge EN";
  return format === "Dermatoloji" ? "Claim" : format;
}

function FormatBadge({ format }: { format: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    "Genel":         { bg: "#0071e318", fg: "#0055a8" },
    "GenelEn":       { bg: "#0071e318", fg: "#0055a8" },
    "Challenge":     { bg: "#bf5af218", fg: "#8944ab" },
    "ChallengeEn":   { bg: "#bf5af218", fg: "#8944ab" },
    "Mikrobiyoloji": { bg: "#34c75918", fg: "#248a3d" },
    "Kimya":         { bg: "#ff950018", fg: "#c06800" },
    "Stabilite":     { bg: "#ff950018", fg: "#c06800" },
    "Claim":         { bg: "#34c75918", fg: "#248a3d" },
    "Dermatoloji":   { bg: "#34c75918", fg: "#248a3d" },
    "Diğer":         { bg: "#8e8e9318", fg: "#636366" },
    "ÜGDR":          { bg: "#1f478818", fg: "#1f4788" },
    "UGDR":          { bg: "#1f478818", fg: "#1f4788" },
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

// Fatura durumu — şu an statik placeholder. İleride Evrak_No → fatura tablosu eşlemesi ile gelecek.
function FaturaBadge({ durum }: { durum: "Fatura kesilmedi" | "Ödeme bekliyor" | "Ödendi" }) {
  const map: Record<string, { bg: string; fg: string }> = {
    "Fatura kesilmedi": { bg: "#8e8e9318", fg: "#636366" },
    "Ödeme bekliyor":   { bg: "#ff950018", fg: "#c06800" },
    "Ödendi":           { bg: "#34c75918", fg: "#248a3d" },
  };
  const c = map[durum];
  return (
    <span style={{
      display: "inline-block", padding: "2px 9px", borderRadius: 10,
      fontSize: "0.72rem", fontWeight: 600, background: c.bg, color: c.fg, whiteSpace: "nowrap",
    }}>{durum}</span>
  );
}

const formatTarih = (t: string | null) => {
  if (!t) return "—";
  const [y, m, d] = t.split("-");
  return `${d}.${m}.${y}`;
};

// Revno metin ("0","1",…) → sayı (boş/geçersiz → 0)
const parseRev = (v?: string | null): number => {
  const n = parseInt(String(v ?? "0").trim(), 10);
  return Number.isFinite(n) ? n : 0;
};

// Revize açıklama cümlesi — dış takip kodu (ÜGAM/…) kullanılır, iç RaporNo değil.
// Kod SABİT kalır, revizyon /NN suffix'iyle gösterilir (disRaporLabel biçimi):
// [DışKod]/[EskiRev] ... revize edilmiştir. … Geçerli rapor numarası [DışKod]/[YeniRev].
const revLabel = (kod: string, rev: number): string => `${kod}-${String(rev).padStart(2, "0")}`;
const buildRevizeCumle = (kod: string, eskiRev: number, sebep: string): string => {
  const s = sebep.trim() || "……";
  return `${revLabel(kod, eskiRev)} numaralı rapor ${s} sebebi ile revize edilmiştir. ` +
    `${revLabel(kod, eskiRev)} numaralı rapor geçersizdir. Geçerli rapor numarası ${revLabel(kod, eskiRev + 1)}.`;
};

// Revize cümlesinde kullanılacak takip kodu: dış kod (ÜGAM/…) varsa o, yoksa RaporNo.
const revizeTakipKodu = (r: RaporRow): string => (r.DisRaporKodu?.trim() || r.RaporNo);

const isEnglishFormat = (format: string) => baseReportFormat(format) !== String(format || "").trim();

function isPublishedForFormat(row: RaporRow | undefined, format: string) {
  if (!row) return false;
  const english = isEnglishFormat(format);
  const flag = english ? row.EnYayinlandi : row.TrYayinlandi;
  if (flag != null) return Number(flag) > 0;
  return row.RaporDurumu === "Yayınlandı";
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────

export default function OnayliRaporTable() {
  const [rows, setRows]       = useState<RaporRow[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [limit, setLimit]     = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch]   = useState("");
  const [year, setYear]       = useState("2026");
  // İlk girişte sadece "Onaylandı" görünür. Tüm / Gönderildi / Arşiv kullanıcı seçimiyle açılır.
  const [durum, setDurum]     = useState<"" | "Onaylandı" | "Yayınlandı" | "Arşiv">("Onaylandı");
  const [raporTuru, setRaporTuru] = useState("");
  const [faturaDurumu, setFaturaDurumu] = useState<"" | "Fatura kesilmedi" | "Ödeme bekliyor" | "Ödendi">("");
  const [loading, setLoading] = useState(true);
  const [transitioning, setTrans] = useState(false);
  const [error, setError]     = useState("");
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [publishingKey, setPublishingKey] = useState<string | null>(null);

  // Çoklu seçim — key = `${NkrID}__${RaporFormati}`
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<"arsivle" | "mail" | "yayinla" | "indir" | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [reportLanguage, setReportLanguage] = useState<ReportLanguageChoice>("tr");

  // Revize modal
  const [revizeRow, setRevizeRow] = useState<RaporRow | null>(null);
  const [revizeSebep, setRevizeSebep] = useState("");
  const [revizeBusy, setRevizeBusy] = useState(false);
  const [revizeError, setRevizeError] = useState("");

  // Mail modal
  const [mailOpen, setMailOpen] = useState(false);
  const [mailTo, setMailTo] = useState("");
  const [mailCc, setMailCc] = useState("");
  const [mailKonu, setMailKonu] = useState("");
  const [mailMesaj, setMailMesaj] = useState("");
  const [mailError, setMailError] = useState("");

  const searchTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef     = useRef<AbortController | null>(null);
  const latestReqId  = useRef(0);
  const didMount     = useRef(false);

  const fetchData = useCallback(async (
    p: number, s: string, l: number, y: string, d: string, t: string,
    opts: { clearFirst?: boolean } = {},
  ) => {
    const reqId = ++latestReqId.current;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    if (opts.clearFirst) { setRows([]); setLoading(true); setTrans(false); }
    else { setTrans(true); setLoading(false); }
    setError("");

    try {
      const params = new URLSearchParams({
        page: p.toString(), limit: l.toString(),
        search: s, year: y, raporDurumu: d, raporTuru: t,
        phase: "approved",   // sadece Onaylandı + Yayınlandı
        acceptedOnly: "1",   // KabulTarihi join
      });
      const res = await fetch(`/api/rapor-takip?${params}`, { signal: ctrl.signal, cache: "no-store" });
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
      if (reqId === latestReqId.current) { setLoading(false); setTrans(false); }
    }
  }, []);

  useEffect(() => {
    fetchData(1, "", limit, year, durum, raporTuru, { clearFirst: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    fetchData(page, search, limit, year, durum, raporTuru, { clearFirst: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, year, durum, raporTuru]);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      fetchData(1, val, limit, year, durum, raporTuru, { clearFirst: true });
    }, 250);
  };

  // Dosya adi sanitize: Windows/macOS uyumsuz karakterleri temizle.
  const sanitizeFileName = (s: string) =>
    s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

  const downloadImzaliPdf = async (row: RaporRow) => {
    const key = `${row.NkrID}__${row.RaporFormati}`;
    setDownloadingKey(key);
    setError("");
    try {
      const url = `/api/rapor-takip/${row.NkrID}/imzali-pdf?format=${encodeURIComponent(row.RaporFormati)}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "İmzalı PDF indirilemedi");
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      // Dosya adi: "ÜGAM-RR26-XXXX - UrunAdi.pdf" — dış kod öncelikli.
      // DisRaporKodu yoksa Barkod / RaporNo / NkrID sırasıyla fallback.
      const idSource = row.DisRaporKodu || row.Barkod || row.RaporNo || String(row.NkrID);
      const idPart = sanitizeFileName(String(idSource).replace(/\//g, "-"));
      const namePart = sanitizeFileName(String(row.Numune_Adi || ""));
      a.download = namePart
        ? `${idPart} - ${namePart}.pdf`
        : `${idPart}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 30_000);
    } catch (e: any) {
      setError(e.message || "İmzalı PDF indirilemedi");
    } finally {
      setDownloadingKey(null);
    }
  };

  // Portala Gönder — imzalı PDF üret, FTP'ye yükle, Durum='Yayınlandı' yap.
  const handlePublish = async (row: RaporRow) => {
    const key = `${row.NkrID}__${row.RaporFormati}`;
    if (publishingKey) return;
    setPublishingKey(key);
    setError("");
    try {
      let publishedUrl: string | null = null;
      let sentTr = false;
      let sentEn = false;
      for (const raporFormati of expandReportFormats(row.RaporFormati, reportLanguage)) {
        const res = await fetch(`/api/rapor-takip/${row.NkrID}/yayinla`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ format: raporFormati }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Portala gönderilemedi");
        publishedUrl = json.yayinUrl ?? publishedUrl;
        if (isEnglishFormat(raporFormati)) sentEn = true;
        else sentTr = true;
      }
      setRows(prev => prev.map(r =>
        r.NkrID === row.NkrID && r.RaporFormati === row.RaporFormati
          ? {
              ...r,
              RaporDurumu: "Yayınlandı",
              YayinUrl: publishedUrl ?? r.YayinUrl,
              TrYayinlandi: sentTr ? 1 : r.TrYayinlandi,
              EnYayinlandi: sentEn ? 1 : r.EnYayinlandi,
            }
          : r
      ));
    } catch (e: any) {
      setError(e.message || "Portala gönderilemedi");
    } finally {
      setPublishingKey(null);
    }
  };

  // Revize modalını aç
  const openRevize = (row: RaporRow) => {
    setRevizeRow(row);
    setRevizeSebep("");
    setRevizeError("");
  };

  // Revize onayla. Açıklama boşsa Revno artmadan düzenlemeye açılır.
  const handleRevizeSubmit = async () => {
    if (!revizeRow) return;
    const sebep = revizeSebep.trim();
    const row = revizeRow;
    const eskiRev = parseRev(row.Revno);
    const aciklama = sebep ? buildRevizeCumle(revizeTakipKodu(row), eskiRev, sebep) : "";
    setRevizeBusy(true);
    setRevizeError("");
    try {
      const res = await fetch(`/api/rapor-takip/${row.NkrID}/revize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: row.RaporFormati, aciklama }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Revize başarısız");
      // Rapor artık onaylılar listesinden çıktı → bu listeden çıkar.
      setRows(prev => prev.filter(r => !(r.NkrID === row.NkrID && r.RaporFormati === row.RaporFormati)));
      setTotal(t => Math.max(0, t - 1));
      setRevizeRow(null);
    } catch (e: any) {
      setRevizeError(e.message || "Revize başarısız");
    } finally {
      setRevizeBusy(false);
    }
  };

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

  // Fatura durumu client-side filtre (server'da kolon yok)
  const visibleRows = faturaDurumu
    ? rows.filter(() => faturaDurumu === "Fatura kesilmedi") // placeholder: hepsi "Fatura kesilmedi" şu an
    : rows;

  // Grid: [✓] [Kabul] [Termin] [Evrak] [Rapor No] [Firma/Proje·Numune — geniş] [Rapor Türü] [Durum] [Fatura] [PDF ikon] [Mail ikon]
  // Sol blok sıkışık, orta blok geniş, sağ blok sıkışık ve sona ikon butonlar
  const gridCols = "28px 86px 86px 86px 110px 1fr 90px 100px 110px 38px 38px 38px 38px";

  const allSelected = visibleRows.length > 0 && visibleRows.every(r => selectedKeys.has(`${r.NkrID}__${r.RaporFormati}`));
  const someSelected = selectedKeys.size > 0;
  const toggleAll = () => {
    if (allSelected) setSelectedKeys(new Set());
    else setSelectedKeys(new Set(visibleRows.map(r => `${r.NkrID}__${r.RaporFormati}`)));
  };
  const toggleOne = (k: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  };
  const selectedItems = (): Array<{ nkrId: number; raporFormati: string; row?: RaporRow }> => {
    const m = new Map(visibleRows.map(r => [`${r.NkrID}__${r.RaporFormati}`, r]));
    return Array.from(selectedKeys).map(k => {
      const r = m.get(k);
      if (!r) {
        const [n, f] = k.split("__");
        return { nkrId: Number(n), raporFormati: f };
      }
      return { nkrId: r.NkrID, raporFormati: r.RaporFormati, row: r };
    });
  };
  const expandItemsByLanguage = (
    items: Array<{ nkrId: number; raporFormati: string; row?: RaporRow }>,
    language = reportLanguage,
  ): Array<{ nkrId: number; raporFormati: string; row?: RaporRow }> => {
    const seen = new Set<string>();
    const expanded: Array<{ nkrId: number; raporFormati: string; row?: RaporRow }> = [];
    for (const item of items) {
      for (const raporFormati of expandReportFormats(item.raporFormati, language)) {
        const key = `${item.nkrId}__${raporFormati}`;
        if (seen.has(key)) continue;
        seen.add(key);
        expanded.push({ ...item, raporFormati });
      }
    }
    return expanded;
  };

  const downloadPdfItem = async (item: { nkrId: number; raporFormati: string; row?: RaporRow }) => {
    const res = await fetch(
      `/api/rapor-takip/${item.nkrId}/imzali-pdf?format=${encodeURIComponent(item.raporFormati)}`,
      { cache: "no-store" },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "İmzalı PDF indirilemedi");
    }
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    const row = item.row;
    const idSource = row?.DisRaporKodu || row?.Barkod || row?.RaporNo || String(item.nkrId);
    const idPart = sanitizeFileName(String(idSource).replace(/\//g, "-"));
    const namePart = sanitizeFileName(String(row?.Numune_Adi || ""));
    const prefix = item.raporFormati.endsWith("En") ? "Eng_" : "";
    a.download = namePart
      ? `${prefix}${idPart} - ${namePart}.pdf`
      : `${prefix}${idPart}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 30_000);
  };

  const handleBulkDownload = async () => {
    const targets = expandItemsByLanguage(selectedItems());
    if (targets.length === 0) return;
    setBulkBusy("indir");
    setError("");
    setBulkProgress({ done: 0, total: targets.length });
    const basarisiz: string[] = [];
    try {
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        try {
          await downloadPdfItem(t);
          await new Promise(resolve => setTimeout(resolve, 250));
        } catch (e: any) {
          basarisiz.push(`${t.row?.RaporNo ?? t.nkrId} (${t.raporFormati}): ${e.message || "hata"}`);
        }
        setBulkProgress({ done: i + 1, total: targets.length });
      }
      if (basarisiz.length > 0) {
        setError(`${basarisiz.length}/${targets.length} PDF indirilemedi:\n${basarisiz.slice(0, 5).join("\n")}`);
      }
    } finally {
      setBulkBusy(null);
      setBulkProgress(null);
    }
  };

  // Toplu Portala Gönder — seçili her rapor için /yayinla'yı sırayla çağırır.
  // Her biri ayrı Chromium PDF + FTP yükleme yaptığı için seri (paralel değil)
  // çalışır; ilerleme gösterilir. Zaten Yayınlanmış olanlar atlanır.
  const handleBulkPublish = async () => {
    const sel = expandItemsByLanguage(selectedItems());
    const targets = sel.filter(s => !isPublishedForFormat(s.row, s.raporFormati));
    if (targets.length === 0) {
      setError("Seçili raporların tümü zaten gönderilmiş.");
      return;
    }
    const dilLabel = reportLanguage === "both" ? "TR + EN" : reportLanguage.toUpperCase();
    if (!confirm(`${targets.length} PDF (${dilLabel}) müşteri portalına gönderilecek. Onaylıyor musun?`)) return;
    setBulkBusy("yayinla");
    setError("");
    setBulkProgress({ done: 0, total: targets.length });
    const basarisiz: string[] = [];
    try {
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        try {
          const res = await fetch(`/api/rapor-takip/${t.nkrId}/yayinla`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ format: t.raporFormati }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error || "hata");
          // Satırı yerinde güncelle
          const baseFormat = t.row?.RaporFormati ?? baseReportFormat(t.raporFormati);
          const sentEn = isEnglishFormat(t.raporFormati);
          setRows(prev => prev.map(r =>
            r.NkrID === t.nkrId && r.RaporFormati === baseFormat
              ? {
                  ...r,
                  RaporDurumu: "Yayınlandı",
                  YayinUrl: json.yayinUrl ?? r.YayinUrl,
                  TrYayinlandi: sentEn ? r.TrYayinlandi : 1,
                  EnYayinlandi: sentEn ? 1 : r.EnYayinlandi,
                }
              : r
          ));
        } catch (e: any) {
          basarisiz.push(`${t.row?.RaporNo ?? t.nkrId} (${t.raporFormati}): ${e.message || "hata"}`);
        }
        setBulkProgress({ done: i + 1, total: targets.length });
      }
      setSelectedKeys(new Set());
      if (basarisiz.length > 0) {
        setError(`${basarisiz.length}/${targets.length} gönderilemedi:\n${basarisiz.slice(0, 5).join("\n")}`);
      }
      fetchData(page, search, limit, year, durum, raporTuru, { clearFirst: false });
    } finally {
      setBulkBusy(null);
      setBulkProgress(null);
    }
  };

  const handleArsivle = async () => {
    const items = selectedItems().map(({ nkrId, raporFormati }) => ({ nkrId, raporFormati }));
    if (items.length === 0) return;
    if (!confirm(`${items.length} rapor arşivlenecek. Onaylıyor musun?`)) return;
    setBulkBusy("arsivle");
    setError("");
    try {
      const res = await fetch("/api/rapor-takip/arsivle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Arşivleme başarısız");
      setSelectedKeys(new Set());
      fetchData(page, search, limit, year, durum, raporTuru, { clearFirst: false });
    } catch (e: any) {
      setError(e.message || "Arşivleme başarısız");
    } finally {
      setBulkBusy(null);
    }
  };

  const openMailModal = () => {
    const sel = selectedItems();
    if (sel.length === 0) return;
    // Varsayılan konu — ilk raporun firmasından isim
    const firstFirma = sel[0]?.row?.FirmaAd ?? "";
    setMailKonu(`Analiz Raporu${firstFirma ? " — " + firstFirma : ""}`);
    setMailTo(""); setMailCc(""); setMailMesaj(""); setMailError("");
    setMailOpen(true);
  };

  const handleMailGonder = async () => {
    const items = expandItemsByLanguage(selectedItems()).map(({ nkrId, raporFormati }) => ({ nkrId, raporFormati }));
    const to = mailTo.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
    const cc = mailCc.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
    if (items.length === 0) { setMailError("Rapor seçilmedi."); return; }
    if (to.length === 0) { setMailError("En az bir alıcı (To) girilmeli."); return; }
    setBulkBusy("mail");
    setMailError("");
    try {
      const res = await fetch("/api/rapor-takip/mail-gonder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, to, cc, konu: mailKonu, mesaj: mailMesaj }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Mail gönderilemedi");
      setMailOpen(false);
      setSelectedKeys(new Set());
    } catch (e: any) {
      setMailError(e.message || "Mail gönderilemedi");
    } finally {
      setBulkBusy(null);
    }
  };

  return (
    <>
      {/* Toolbar */}
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
          {someSelected && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: 8 }}>
              <span style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", padding: "0 6px" }}>
                {bulkBusy === "yayinla" && bulkProgress
                  ? `Gönderiliyor ${bulkProgress.done}/${bulkProgress.total}…`
                  : bulkBusy === "indir" && bulkProgress
                  ? `İndiriliyor ${bulkProgress.done}/${bulkProgress.total}…`
                  : `${selectedKeys.size} seçili`}
              </span>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.74rem", color: "var(--color-text-secondary)", fontWeight: 700 }}>
                Dil
                <select
                  value={reportLanguage}
                  onChange={e => setReportLanguage(e.target.value as ReportLanguageChoice)}
                  disabled={!!bulkBusy}
                  style={{ padding: "5px 7px", borderRadius: 7, border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.75rem", cursor: bulkBusy ? "wait" : "pointer" }}
                >
                  <option value="tr">TR</option>
                  <option value="en">EN</option>
                  <option value="both">TR + EN</option>
                </select>
              </label>
              <button
                type="button"
                onClick={handleBulkDownload}
                disabled={!!bulkBusy}
                title="Seçili raporların imzalı PDF'lerini seçilen dilde indir"
                style={{
                  padding: "6px 12px", borderRadius: 7,
                  border: "1px solid var(--color-border)",
                  background: bulkBusy === "indir" ? "var(--color-surface-2)" : "transparent",
                  color: "var(--color-accent)",
                  fontSize: "0.78rem", fontWeight: 700,
                  cursor: bulkBusy ? "wait" : "pointer",
                  display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
                }}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12">
                  <path fillRule="evenodd" d="M10 3a.75.75 0 0 1 .75.75v6.59l1.95-2.1a.75.75 0 1 1 1.1 1.02l-3.25 3.5a.75.75 0 0 1-1.1 0L6.2 9.26a.75.75 0 0 1 1.1-1.02l1.95 2.1V3.75A.75.75 0 0 1 10 3Z" clipRule="evenodd"/>
                  <path d="M3.5 13.75a.75.75 0 0 1 1.5 0v1.75a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-1.75a.75.75 0 0 1 1.5 0v1.75A2 2 0 0 1 14.5 17.5h-9A2 2 0 0 1 3.5 15.5v-1.75Z"/>
                </svg>
                PDF İndir
              </button>
              <button
                type="button"
                onClick={handleBulkPublish}
                disabled={!!bulkBusy}
                title="Seçili raporları müşteri portalına gönder (imzalı PDF yayınla)"
                style={{
                  padding: "6px 12px", borderRadius: 7,
                  border: "1px solid #34c759",
                  background: bulkBusy === "yayinla" ? "var(--color-surface-2)" : "#34c75918",
                  color: "#248a3d",
                  fontSize: "0.78rem", fontWeight: 700,
                  cursor: bulkBusy ? "wait" : "pointer",
                  display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
                }}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12">
                  <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.254 4.94H9.75a.75.75 0 0 1 0 1.5H3.533l-1.254 4.94a.75.75 0 0 0 .826.95 28.896 28.896 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.288Z"/>
                </svg>
                Portala Gönder
              </button>
              <button
                type="button"
                onClick={handleArsivle}
                disabled={!!bulkBusy}
                style={{
                  padding: "6px 12px", borderRadius: 7,
                  border: "1px solid var(--color-border)",
                  background: bulkBusy === "arsivle" ? "var(--color-surface-2)" : "#ff950018",
                  color: "#c06800",
                  fontSize: "0.78rem", fontWeight: 700,
                  cursor: bulkBusy ? "wait" : "pointer",
                  display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
                }}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12">
                  <path d="M2 3a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3Zm2 5h12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Zm4 3a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5A.75.75 0 0 1 8 11Z"/>
                </svg>
                Arşivle
              </button>
              <button
                type="button"
                onClick={openMailModal}
                disabled={!!bulkBusy}
                style={{
                  padding: "6px 12px", borderRadius: 7,
                  border: "1px solid var(--color-accent)",
                  background: bulkBusy === "mail" ? "var(--color-surface-2)" : "var(--color-accent)",
                  color: "#fff",
                  fontSize: "0.78rem", fontWeight: 700,
                  cursor: bulkBusy ? "wait" : "pointer",
                  display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
                }}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12">
                  <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.254 4.94H9.75a.75.75 0 0 1 0 1.5H3.533l-1.254 4.94a.75.75 0 0 0 .826.95 28.896 28.896 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.288Z"/>
                </svg>
                Mail Gönder
              </button>
            </div>
          )}
        </div>
        <div className={styles.toolbarRight} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {/* Gönderim dili */}
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.74rem", color: "var(--color-text-secondary)", fontWeight: 700 }}>
            Gönderim dili
            <select value={reportLanguage} onChange={e => setReportLanguage(e.target.value as ReportLanguageChoice)}
              style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.75rem", cursor: "pointer" }}>
              <option value="tr">TR</option>
              <option value="en">EN</option>
              <option value="both">TR + EN</option>
            </select>
          </label>

          {/* Yıl */}
          <select value={year} onChange={e => { setYear(e.target.value); setPage(1); }}
            style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.75rem", cursor: "pointer" }}>
            <option value="">Tüm Yıllar</option>
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          {/* Rapor Türü */}
          <select value={raporTuru} onChange={e => { setRaporTuru(e.target.value); setPage(1); }}
            style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.75rem", cursor: "pointer" }}>
            <option value="">Tüm Türler</option>
            <option value="Genel">Genel</option>
            <option value="Challenge">Challenge</option>
            <option value="Stabilite">Stabilite</option>
            <option value="Dermatoloji">Claim</option>
            <option value="ÜGDR">ÜGDR</option>
          </select>

          {/* Durum */}
          <select value={durum} onChange={e => { setDurum(e.target.value as any); setPage(1); }}
            style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.75rem", cursor: "pointer" }}>
            <option value="">Tüm Durumlar</option>
            <option value="Onaylandı">Onaylandı</option>
            <option value="Yayınlandı">Gönderildi</option>
            <option value="Arşiv">Arşiv</option>
          </select>

          {/* Fatura */}
          <select value={faturaDurumu} onChange={e => setFaturaDurumu(e.target.value as any)}
            style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.75rem", cursor: "pointer" }}>
            <option value="">Tüm Fatura Durumları</option>
            <option value="Fatura kesilmedi">Fatura kesilmedi</option>
            <option value="Ödeme bekliyor">Ödeme bekliyor</option>
            <option value="Ödendi">Ödendi</option>
          </select>

          {/* Sayfa boyutu */}
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

        {/* Başlık */}
        <div style={{
          display: "grid",
          gridTemplateColumns: gridCols,
          gap: 8,
          alignItems: "center",
          padding: "10px 14px",
          borderBottom: "1px solid var(--color-border-light)",
          background: "var(--color-surface)",
          minWidth: 1200,
        }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              style={{ cursor: "pointer", width: 14, height: 14, accentColor: "var(--color-accent)" }}
              title={allSelected ? "Hiçbirini seçme" : "Tümünü seç"}
            />
          </div>
          {[
            "Kabul Tarihi", "Termin Tarihi", "Evrak No", "Rapor No",
            "Firma / Proje · Numune", "Rapor Türü", "Durum", "Fatura", "", "", "", "",
          ].map((h, i) => (
            <div key={i} style={{
              fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase",
              letterSpacing: "0.06em", color: "var(--color-text-tertiary)",
              // Rapor Türü(5), Durum(6), Fatura(7) → sağa hizalı + sağa padding (Rapor Türü/Durum/Fatura sağa yaklaşsın)
              textAlign: i >= 5 && i <= 7 ? "right" : "left",
              paddingRight: i >= 5 && i <= 7 ? 6 : 0,
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}>{h}</div>
          ))}
        </div>

        {/* Skeleton */}
        {loading && (
          <div style={{ padding: "6px 0", minWidth: 1200 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 20px", borderBottom: "1px solid var(--color-border-light)",
              }}>
                <span className={styles.skeleton} style={{ width: 80 }} />
                <span className={styles.skeleton} style={{ width: 80 }} />
                <span className={styles.skeleton} style={{ width: 80 }} />
                <span className={styles.skeleton} style={{ width: 100 }} />
                <span className={styles.skeleton} style={{ flex: 1 }} />
                <span className={styles.skeleton} style={{ width: 80 }} />
                <span className={styles.skeleton} style={{ width: 90 }} />
                <span className={styles.skeleton} style={{ width: 110 }} />
              </div>
            ))}
          </div>
        )}

        {/* Boş */}
        {!loading && visibleRows.length === 0 && (
          <div className={styles.empty}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="36" height="36">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            Onaylı rapor bulunamadı
          </div>
        )}

        {/* Satırlar */}
        {!loading && visibleRows.map((row, gi) => {
          const key = `${row.NkrID}__${row.RaporFormati}`;
          const isDownloading = downloadingKey === key;
          const isPublishing = publishingKey === key;
          const isPublished = row.RaporDurumu === "Yayınlandı";
          const isSelected = selectedKeys.has(key);
          return (
            <div
              key={key}
              style={{
                display: "grid",
                gridTemplateColumns: gridCols,
                gap: 8,
                alignItems: "center",
                padding: "10px 14px",
                borderBottom: gi < visibleRows.length - 1 ? "1px solid var(--color-border-light)" : "none",
                background: isSelected ? "var(--color-accent-light, #0071e30a)" : "transparent",
                minWidth: 1200,
              }}
            >
              {/* Checkbox */}
              <div style={{ display: "flex", justifyContent: "center" }}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleOne(key)}
                  style={{ cursor: "pointer", width: 14, height: 14, accentColor: "var(--color-accent)" }}
                />
              </div>
              {/* Kabul Tarihi */}
              <div style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                {formatTarih(row.KabulTarihi)}
              </div>
              {/* Termin Tarihi */}
              <div style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                {formatTarih(row.MaxTermin)}
              </div>
              {/* Evrak No */}
              <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums" }}>
                {row.Evrak_No}
              </div>
              {/* Rapor No (üstte iç, varsa altta dış ÜGAM kodu) */}
              <div style={{ fontVariantNumeric: "tabular-nums" }}>
                <div style={{ fontWeight: 700, fontSize: "0.8rem", color: "var(--color-accent)" }}>
                  {row.RaporNo}
                </div>
                {row.DisRaporKodu && (
                  <div style={{ fontWeight: 500, fontSize: "0.68rem", color: "var(--color-text-tertiary)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {row.DisRaporKodu}
                  </div>
                )}
              </div>
              {/* Firma / Proje · Numune — geniş */}
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontWeight: 500, fontSize: "0.845rem", color: "var(--color-text-primary)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {upperTr(row.FirmaAd) || "—"}
                  {row.ProjeAd && <span style={{ color: "var(--color-text-tertiary)" }}> · {upperTr(row.ProjeAd)}</span>}
                </div>
                <div style={{
                  fontSize: "0.77rem", color: "var(--color-text-secondary)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {row.Numune_Adi}
                  {row.Barkod ? ` · Barkod: ${row.Barkod}` : ""}
                </div>
              </div>
              {/* Rapor Türü — sağa hizalı */}
              <div style={{ display: "flex", justifyContent: "flex-end", paddingRight: 6 }}>
                <FormatBadge format={row.RaporFormati} />
              </div>
              {/* Durum — sağa hizalı */}
              <div style={{ display: "flex", justifyContent: "flex-end", paddingRight: 6 }}>
                <DurumBadge durum={row.RaporDurumu} />
              </div>
              {/* Fatura — sağa hizalı */}
              <div style={{ display: "flex", justifyContent: "flex-end", paddingRight: 6 }}>
                <FaturaBadge durum="Fatura kesilmedi" />
              </div>
              {/* PDF İndir — ikon buton */}
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button
                  type="button"
                  title="İmzalı PDF indir"
                  disabled={isDownloading}
                  onClick={() => downloadImzaliPdf(row)}
                  style={{
                    width: 30, height: 30,
                    border: "1px solid var(--color-border)",
                    borderRadius: 7,
                    background: isDownloading ? "var(--color-surface-2)" : "transparent",
                    color: "var(--color-accent)",
                    cursor: isDownloading ? "wait" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: 0,
                  }}
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                    <path fillRule="evenodd" d="M10 3a.75.75 0 0 1 .75.75v6.59l1.95-2.1a.75.75 0 1 1 1.1 1.02l-3.25 3.5a.75.75 0 0 1-1.1 0L6.2 9.26a.75.75 0 0 1 1.1-1.02l1.95 2.1V3.75A.75.75 0 0 1 10 3Z" clipRule="evenodd"/>
                    <path d="M3.5 13.75a.75.75 0 0 1 1.5 0v1.75a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-1.75a.75.75 0 0 1 1.5 0v1.75A2 2 0 0 1 14.5 17.5h-9A2 2 0 0 1 3.5 15.5v-1.75Z"/>
                  </svg>
                </button>
              </div>
              {/* Portala Gönder — ikon buton */}
              <div style={{ display: "flex", justifyContent: "center" }}>
                {isPublished ? (
                  <a
                    href={row.YayinUrl || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={row.YayinUrl ? "Yayınlanan PDF'i aç (gönderildi)" : "Gönderildi"}
                    onClick={e => { if (!row.YayinUrl) e.preventDefault(); }}
                    style={{
                      width: 30, height: 30,
                      border: "1px solid #34c75955",
                      borderRadius: 7,
                      background: "#34c75918",
                      color: "#248a3d",
                      textDecoration: "none",
                      cursor: row.YayinUrl ? "pointer" : "default",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd"/>
                    </svg>
                  </a>
                ) : (
                  <button
                    type="button"
                    title="Müşteri portalına gönder (imzalı PDF'i yayınla)"
                    disabled={isPublishing}
                    onClick={() => handlePublish(row)}
                    style={{
                      width: 30, height: 30,
                      border: "1px solid var(--color-border)",
                      borderRadius: 7,
                      background: isPublishing ? "var(--color-surface-2)" : "transparent",
                      color: "var(--color-accent)",
                      cursor: isPublishing ? "wait" : "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      padding: 0,
                    }}
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                      <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.254 4.94H9.75a.75.75 0 0 1 0 1.5H3.533l-1.254 4.94a.75.75 0 0 0 .826.95 28.896 28.896 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.288Z"/>
                    </svg>
                  </button>
                )}
              </div>
              {/* Revize — ikon buton */}
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button
                  type="button"
                  title="Raporu revize et (Rev. No artar, dış kod sabit, numune Kabul Bekleyenler'e döner)"
                  onClick={() => openRevize(row)}
                  style={{
                    width: 30, height: 30,
                    border: "1px solid #ff950055",
                    borderRadius: 7,
                    background: "transparent",
                    color: "#c06800",
                    cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: 0,
                  }}
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                    <path d="M15.312 6.687a5.5 5.5 0 0 0-9.2 2.06.75.75 0 0 1-1.42-.48 7 7 0 0 1 11.68-2.64l.63-.63A.6.6 0 0 1 18 5.42V8.6a.6.6 0 0 1-.6.6h-3.18a.6.6 0 0 1-.42-1.02l.9-.9ZM4.688 13.313a5.5 5.5 0 0 0 9.2-2.06.75.75 0 0 1 1.42.48 7 7 0 0 1-11.68 2.64l-.63.63A.6.6 0 0 1 2 14.58V11.4a.6.6 0 0 1 .6-.6h3.18a.6.6 0 0 1 .42 1.02l-.9.9Z"/>
                  </svg>
                </button>
              </div>
              {/* Önizleme — ikon buton (rapor render sayfasını yeni sekmede açar) */}
              <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
                <a
                  href={`/rapor-onay-print/${row.NkrID}?format=${encodeURIComponent(row.RaporFormati)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Raporu önizle (yeni sekmede aç)"
                  style={{
                    width: 30, height: 30,
                    border: "1px solid var(--color-border)",
                    borderRadius: 7,
                    background: "transparent",
                    color: "var(--color-accent)",
                    textDecoration: "none",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
                    <path d="M10 4c-3.7 0-6.9 2.2-8.3 5.4a1 1 0 0 0 0 .8C3.1 13.4 6.3 15.6 10 15.6s6.9-2.2 8.3-5.4a1 1 0 0 0 0-.8C16.9 6.2 13.7 4 10 4Zm0 9.1a3.1 3.1 0 1 1 0-6.2 3.1 3.1 0 0 1 0 6.2Zm0-1.8a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6Z"/>
                  </svg>
                </a>
                {englishPreviewFormat(row.RaporFormati) && (
                  <a
                    href={`/rapor-onay-print/${row.NkrID}?format=${englishPreviewFormat(row.RaporFormati)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="İngilizce raporu önizle"
                    style={{
                      width: 30, height: 30,
                      border: "1px solid #0071e355",
                      borderRadius: 7,
                      background: "transparent",
                      color: "#0071e3",
                      textDecoration: "none",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 800,
                    }}
                  >
                    EN
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mail Gönder Modal */}
      {mailOpen && (
        <div
          onClick={() => !bulkBusy && setMailOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000, padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "var(--color-bg)", borderRadius: 14, width: "100%", maxWidth: 560,
              padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
              maxHeight: "90vh", overflow: "auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "var(--color-text-primary)" }}>
                Mail Gönder · {expandItemsByLanguage(selectedItems()).length} PDF
              </h3>
              <button
                type="button"
                onClick={() => !bulkBusy && setMailOpen(false)}
                disabled={!!bulkBusy}
                style={{ border: "none", background: "transparent", cursor: bulkBusy ? "wait" : "pointer", color: "var(--color-text-tertiary)", fontSize: 24, lineHeight: 1, padding: 0 }}
              >×</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 4 }}>
                  Rapor dili
                </label>
                <select
                  value={reportLanguage}
                  onChange={e => setReportLanguage(e.target.value as ReportLanguageChoice)}
                  disabled={!!bulkBusy}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid var(--color-border)", fontSize: "0.85rem", background: "var(--color-surface)" }}
                >
                  <option value="tr">Sadece Türkçe</option>
                  <option value="en">Sadece İngilizce</option>
                  <option value="both">Türkçe + İngilizce</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 4 }}>
                  Alıcı (To) · virgülle çoklu
                </label>
                <input
                  type="text"
                  value={mailTo}
                  onChange={e => setMailTo(e.target.value)}
                  placeholder="musteri@firma.com"
                  disabled={!!bulkBusy}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid var(--color-border)", fontSize: "0.85rem", background: "var(--color-surface)" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 4 }}>
                  CC (opsiyonel)
                </label>
                <input
                  type="text"
                  value={mailCc}
                  onChange={e => setMailCc(e.target.value)}
                  placeholder="ek@firma.com"
                  disabled={!!bulkBusy}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid var(--color-border)", fontSize: "0.85rem", background: "var(--color-surface)" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 4 }}>
                  Konu
                </label>
                <input
                  type="text"
                  value={mailKonu}
                  onChange={e => setMailKonu(e.target.value)}
                  disabled={!!bulkBusy}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid var(--color-border)", fontSize: "0.85rem", background: "var(--color-surface)" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 4 }}>
                  Mesaj (opsiyonel)
                </label>
                <textarea
                  value={mailMesaj}
                  onChange={e => setMailMesaj(e.target.value)}
                  disabled={!!bulkBusy}
                  rows={4}
                  placeholder="Müşteriye yazılacak ek not…"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid var(--color-border)", fontSize: "0.85rem", background: "var(--color-surface)", resize: "vertical", fontFamily: "inherit" }}
                />
              </div>
              <div style={{ fontSize: "0.74rem", color: "var(--color-text-tertiary)", padding: "8px 10px", background: "var(--color-surface-2)", borderRadius: 7 }}>
                Seçili raporlar için {expandItemsByLanguage(selectedItems()).length} imzalı PDF mail ekinde gönderilecek. İlk PDF üretimi sunucu tarafında 5-15 saniye sürebilir.
              </div>
              {mailError && (
                <div style={{ color: "#c00", fontSize: "0.8rem", padding: "8px 10px", background: "#ff3b3010", borderRadius: 7 }}>
                  {mailError}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button
                type="button"
                onClick={() => setMailOpen(false)}
                disabled={!!bulkBusy}
                style={{
                  padding: "8px 14px", borderRadius: 7, border: "1px solid var(--color-border)",
                  background: "transparent", color: "var(--color-text-secondary)",
                  fontSize: "0.85rem", fontWeight: 600, cursor: bulkBusy ? "wait" : "pointer",
                }}
              >Vazgeç</button>
              <button
                type="button"
                onClick={handleMailGonder}
                disabled={!!bulkBusy}
                style={{
                  padding: "8px 14px", borderRadius: 7, border: "none",
                  background: "var(--color-accent)", color: "#fff",
                  fontSize: "0.85rem", fontWeight: 700, cursor: bulkBusy ? "wait" : "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                {bulkBusy === "mail" ? "Gönderiliyor…" : "Gönder"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revize Modal */}
      {revizeRow && (
        <div
          onClick={() => !revizeBusy && setRevizeRow(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000, padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "var(--color-surface)", borderRadius: 14, padding: 22,
              width: "100%", maxWidth: 560, boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>Raporu Revize Et</h3>
              <button
                type="button"
                onClick={() => !revizeBusy && setRevizeRow(null)}
                style={{ border: "none", background: "transparent", fontSize: "1.3rem", cursor: revizeBusy ? "wait" : "pointer", color: "var(--color-text-secondary)", lineHeight: 1 }}
              >×</button>
            </div>
            <p style={{ margin: "0 0 14px", fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
              Rapor <strong>{revizeTakipKodu(revizeRow)}</strong>
              {revizeRow.DisRaporKodu?.trim() && <span style={{ color: "var(--color-text-tertiary)" }}> (No {revizeRow.RaporNo})</span>}
              {" "}· {displayFormat(revizeRow.RaporFormati)} —
              {revizeSebep.trim()
                ? <>{" "}Rev.{parseRev(revizeRow.Revno)} → <strong>Rev.{parseRev(revizeRow.Revno) + 1}</strong>. Dış kod sabit kalır; numune "Kabul Bekleyenler"e döner ve tekrar yayınlanınca güncel revizyon geçerli olur.</>
                : <>{" "}Açıklama boş bırakılırsa Rev.{parseRev(revizeRow.Revno)} korunur; rapor onay alanına geri döner ve numune formu düzenlemeye açılır.</>}
            </p>

            <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: 6 }}>
              Revize Sebebi <span style={{ color: "var(--color-text-tertiary)", fontWeight: 500 }}>(boş bırakılırsa sadece düzenlemeye açılır)</span>
            </label>
            <textarea
              value={revizeSebep}
              onChange={e => setRevizeSebep(e.target.value)}
              disabled={revizeBusy}
              rows={2}
              placeholder="ör. numune adının hatalı girilmesi"
              style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid var(--color-border)", fontSize: "0.85rem", background: "var(--color-surface)", resize: "vertical", fontFamily: "inherit" }}
            />

            <div style={{ marginTop: 12, fontSize: "0.72rem", fontWeight: 600, color: "var(--color-text-tertiary)", marginBottom: 4 }}>
              Açıklama (otomatik):
            </div>
            <div style={{ fontSize: "0.82rem", lineHeight: 1.5, padding: "10px 12px", background: "var(--color-surface-2)", borderRadius: 8, color: "var(--color-text-primary)" }}>
              {revizeSebep.trim()
                ? buildRevizeCumle(revizeTakipKodu(revizeRow), parseRev(revizeRow.Revno), revizeSebep)
                : "Revizyon numarası ve revizyon açıklaması değişmeden, rapor onay alanına geri alınacak."}
            </div>

            {revizeError && (
              <div style={{ marginTop: 12, color: "#c00", fontSize: "0.8rem", padding: "8px 10px", background: "#ff3b3010", borderRadius: 7 }}>
                {revizeError}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button
                type="button"
                onClick={() => setRevizeRow(null)}
                disabled={revizeBusy}
                style={{
                  padding: "8px 14px", borderRadius: 7, border: "1px solid var(--color-border)",
                  background: "transparent", color: "var(--color-text-secondary)",
                  fontSize: "0.85rem", fontWeight: 600, cursor: revizeBusy ? "wait" : "pointer",
                }}
              >Vazgeç</button>
              <button
                type="button"
                onClick={handleRevizeSubmit}
                disabled={revizeBusy}
                style={{
                  padding: "8px 14px", borderRadius: 7, border: "none",
                  background: "#c06800", color: "#fff",
                  fontSize: "0.85rem", fontWeight: 700,
                  cursor: revizeBusy ? "wait" : "pointer",
                  opacity: 1,
                }}
              >
                {revizeBusy ? "İşleniyor…" : (revizeSebep.trim() ? "Revize Et" : "Düzenlemeye Aç")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sayfalama */}
      {!loading && totalPages > 1 && (
        <div className={styles.pagination}>
          <button className={styles.pageBtn} disabled={page === 1} onClick={() => goTo(page - 1)}>‹</button>
          {pageNums().map((n, i) =>
            n === "…" ? (
              <span key={i} className={styles.pageDots}>…</span>
            ) : (
              <button
                key={i}
                className={`${styles.pageBtn} ${page === n ? styles.pageBtnActive : ""}`}
                onClick={() => goTo(n as number)}
              >{n}</button>
            )
          )}
          <button className={styles.pageBtn} disabled={page === totalPages} onClick={() => goTo(page + 1)}>›</button>
        </div>
      )}
    </>
  );
}
