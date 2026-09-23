"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "@/app/styles/table.module.css";
import localStyles from "./fatura.module.css";
import { FATURA_KAYNAKLARI, ODEME_DURUMLARI } from "@/lib/faturaConstants";

interface FaturaRow {
  ID: number;
  ProformaNo: string | null;
  FaturaNo: string;
  Tarih: string | null;
  VadeTarihi: string | null;
  Kaynak: string | null;
  FirmaAd: string;
  Toplam: number | string;
  Tutar: number | string | null;
  KDV: number | string | null;
  OdenenTutar: number | string | null;
  FaturaFirmaID: number | null;
  FirmaAdManuel: string | null;
  Aciklama: string | null;
  OdemeDurumu: string | null;
}

interface Summary { adet: number; toplam: number; odenen: number; }
interface FirmaOpt { ID: number; Ad: string; }

const AYLAR = [
  ["01", "Ocak"],
  ["02", "Şubat"],
  ["03", "Mart"],
  ["04", "Nisan"],
  ["05", "Mayıs"],
  ["06", "Haziran"],
  ["07", "Temmuz"],
  ["08", "Ağustos"],
  ["09", "Eylül"],
  ["10", "Ekim"],
  ["11", "Kasım"],
  ["12", "Aralık"],
] as const;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(value: string, days: number) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function fmtMoney(value: number | string | null | undefined) {
  const n = Number(value || 0);
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function upperTr(value?: string | null) {
  return value ? value.toLocaleUpperCase("tr-TR") : "";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

// Efektif tarih 'YYYY-MM-DD HH:MM:SS' (veya null) gelir → dd.MM.yyyy. Geçersizse "-".
function fmtTarih(value?: string | null) {
  if (!value) return "-";
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m || m[1] === "0000") return "-";
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function dateInput(value?: string | null) {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : todayIso();
}

function kdvRateOf(row: FaturaRow) {
  const toplam = Number(row.Toplam || 0);
  const kdv = Number(row.KDV || 0);
  const net = Math.max(toplam - kdv, 0);
  if (net <= 0 || kdv <= 0) return "20";
  return String(Number(((kdv / net) * 100).toFixed(2)));
}

function odemeStyle(durum: string | null): React.CSSProperties {
  const byStatus: Record<string, React.CSSProperties> = {
    "Ödeme Bekliyor": { background: "#fff7e6", color: "#a86400", borderColor: "#f5d99b" },
    "Kısmen Ödendi": { background: "#e8f1ff", color: "#0055a8", borderColor: "#b8d7ff" },
    "Ödendi": { background: "#e6f6ee", color: "#1a7f4b", borderColor: "#b8e6ce" },
    "İptal": { background: "#fdecea", color: "#c0392b", borderColor: "#f5b8b0" },
  };
  return {
    ...(byStatus[durum || ""] || { background: "#f5f5f7", color: "#6e6e73", borderColor: "#d2d2d7" }),
    borderWidth: 1, borderStyle: "solid", borderRadius: 999, fontWeight: 700, minWidth: 140,
  };
}

function FirmaPicker({
  value,
  manualValue,
  onChange,
}: {
  value: FirmaOpt | null;
  manualValue: string;
  onChange: (firma: FirmaOpt | null, manualValue: string) => void;
}) {
  const [q, setQ] = useState(value?.Ad || manualValue);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<FirmaOpt[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => setQ(value?.Ad || manualValue), [value, manualValue]);

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
        const res = await fetch(`/api/firmalar?search=${encodeURIComponent(q)}&limit=25`, { cache: "no-store" });
        const json = await res.json();
        setRows(Array.isArray(json.data) ? json.data : []);
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
      <input
        value={q}
        onChange={e => { setQ(e.target.value); onChange(null, e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Firma ara veya manuel yaz..."
        style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--color-border)", borderRadius: 8, background: "var(--color-surface)", fontFamily: "inherit" }}
      />
      {(value || manualValue) && (
        <button type="button" onClick={() => { onChange(null, ""); setQ(""); }} style={{ position: "absolute", right: 8, top: 7, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-tertiary)" }}>×</button>
      )}
      {open && (
        <div style={{ position: "absolute", zIndex: 80, top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, boxShadow: "0 10px 24px rgba(0,0,0,.14)", maxHeight: 240, overflowY: "auto" }}>
          {loading ? (
            <div style={{ padding: 10, color: "var(--color-text-tertiary)", fontSize: 13 }}>Aranıyor...</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 10, color: "var(--color-text-tertiary)", fontSize: 13 }}>Sonuç yok</div>
          ) : rows.map(f => (
            <button
              key={f.ID}
              type="button"
              onClick={() => { onChange(f, ""); setQ(f.Ad); setOpen(false); }}
              style={{ display: "block", width: "100%", padding: "8px 10px", border: "none", background: "transparent", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}
            >
              {upperTr(f.Ad)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FaturaTable() {
  const [rows, setRows] = useState<FaturaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [yil, setYil] = useState(String(new Date().getFullYear()));
  const [ay, setAy] = useState("");
  const [odeme, setOdeme] = useState("");
  const [kaynak, setKaynak] = useState("");
  const [vade, setVade] = useState("");
  const [years, setYears] = useState<string[]>([]);
  const [summary, setSummary] = useState<Summary>({ adet: 0, toplam: 0, odenen: 0 });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualMode, setManualMode] = useState<"add" | "edit">("add");
  const [manualEditRow, setManualEditRow] = useState<FaturaRow | null>(null);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState("");
  const [manualFirma, setManualFirma] = useState<FirmaOpt | null>(null);
  const [manualForm, setManualForm] = useState({
    faturaNo: "",
    faturaTarihi: todayIso(),
    vadeTarihi: addDaysIso(todayIso(), 30),
    kaynak: "Unique",
    evrakNo: "",
    toplam: "",
    kdvOran: "20",
    aciklama: "",
    firmaAdManuel: "",
  });

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ search, yil, ay, odeme, kaynak, vade, page: String(page), limit: String(limit) });
      const res = await fetch(`/api/faturalar?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Fatura listesi alınamadı.");
      setRows(json.data || []);
      setTotal(json.total || 0);
      setTotalPages(json.totalPages || 1);
      setSummary(json.summary || { adet: 0, toplam: 0, odenen: 0 });
      if (Array.isArray(json.years) && json.years.length) setYears(json.years);
    } catch (error: unknown) {
      setError(errorMessage(error, "Fatura listesi alınamadı."));
    } finally {
      setLoading(false);
    }
  }, [search, yil, ay, odeme, kaynak, vade, page, limit]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function updateOdeme(row: FaturaRow, odemeDurumu: string) {
    setRows(rs => rs.map(r => r.ID === row.ID ? { ...r, OdemeDurumu: odemeDurumu } : r));
    const res = await fetch(`/api/faturalar/${row.ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ odemeDurumu }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Ödeme durumu güncellenemedi.");
    }
    fetchRows();
  }

  function openManualModal() {
    setManualError("");
    setManualMode("add");
    setManualEditRow(null);
    setManualFirma(null);
    setManualForm({
      faturaNo: "",
      faturaTarihi: todayIso(),
      vadeTarihi: addDaysIso(todayIso(), 30),
      kaynak: "Unique",
      evrakNo: "",
      toplam: "",
      kdvOran: "20",
      aciklama: "",
      firmaAdManuel: "",
    });
    setManualOpen(true);
  }

  function openFaturaEdit(row: FaturaRow) {
    setManualError("");
    setManualMode("edit");
    setManualEditRow(row);
    setManualFirma(row.FaturaFirmaID ? { ID: Number(row.FaturaFirmaID), Ad: row.FirmaAd || "" } : null);
    setManualForm({
      faturaNo: row.FaturaNo || "",
      faturaTarihi: dateInput(row.Tarih),
      vadeTarihi: dateInput(row.VadeTarihi),
      kaynak: row.Kaynak || "Unique",
      evrakNo: row.ProformaNo || "",
      toplam: row.Toplam != null ? String(row.Toplam) : "",
      kdvOran: kdvRateOf(row),
      aciklama: row.Aciklama || "",
      firmaAdManuel: row.FirmaAdManuel || "",
    });
    setManualOpen(true);
  }

  async function submitManual() {
    setManualError("");
    if (!manualForm.faturaNo.trim()) { setManualError("Fatura no zorunludur."); return; }
    if (!manualForm.faturaTarihi.trim()) { setManualError("Fatura tarihi zorunludur."); return; }
    if (!manualForm.vadeTarihi.trim()) { setManualError("Vade tarihi zorunludur."); return; }
    setManualSaving(true);
    try {
      const url = manualMode === "edit" && manualEditRow
        ? `/api/faturalar/${manualEditRow.ID}`
        : "/api/faturalar";
      const res = await fetch(url, {
        method: manualMode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          faturaNo: manualForm.faturaNo,
          faturaTarihi: manualForm.faturaTarihi,
          vadeTarihi: manualForm.vadeTarihi,
          kaynak: manualForm.kaynak,
          evrakNo: manualForm.evrakNo,
          toplam: manualForm.toplam,
          kdvOran: manualForm.kdvOran,
          faturaFirmaId: manualFirma?.ID ?? null,
          firmaAdManuel: manualFirma ? null : manualForm.firmaAdManuel,
          aciklama: manualForm.aciklama,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || (manualMode === "edit" ? "Fatura güncellenemedi." : "Fatura oluşturulamadı."));
      setManualOpen(false);
      setManualEditRow(null);
      setPage(1);
      fetchRows();
    } catch (error: unknown) {
      setManualError(errorMessage(error, manualMode === "edit" ? "Fatura güncellenemedi." : "Fatura oluşturulamadı."));
    } finally {
      setManualSaving(false);
    }
  }

  const pageNumbers = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("...");
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
      if (page < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  const kalan = summary.toplam - summary.odenen;

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchBox} style={{ width: 280 }}>
            <input
              className={styles.searchInput}
              placeholder="Fatura no, proforma, firma..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <select className={styles.pageSizeSelect} value={yil} onChange={e => { setYil(e.target.value); setPage(1); }}>
            <option value="">Tüm yıllar</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className={styles.pageSizeSelect} value={ay} onChange={e => { setAy(e.target.value); setPage(1); }}>
            <option value="">Tüm aylar</option>
            {AYLAR.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select className={styles.pageSizeSelect} value={odeme} onChange={e => { setOdeme(e.target.value); setPage(1); }}>
            <option value="">Tüm ödeme durumları</option>
            {ODEME_DURUMLARI.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className={styles.pageSizeSelect} value={kaynak} onChange={e => { setKaynak(e.target.value); setPage(1); }}>
            <option value="">Tüm kaynaklar</option>
            {FATURA_KAYNAKLARI.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <select className={styles.pageSizeSelect} value={vade} onChange={e => { setVade(e.target.value); setPage(1); }}>
            <option value="">Tüm vadeler</option>
            <option value="gecmis">Vadesi geçenler</option>
            <option value="bugun">Bugün vadesi dolanlar</option>
            <option value="7gun">7 gün içinde</option>
            <option value="30gun">30 gün içinde</option>
            <option value="yok">Vade tarihi olmayanlar</option>
          </select>
          <span className={styles.totalCount}>{total} kayıt</span>
        </div>
        <div className={styles.toolbarRight}>
          <button className={styles.addBtn} type="button" onClick={openManualModal}>+ Manuel Fatura</button>
          <select className={styles.pageSizeSelect} value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
            {[10, 20, 50].map(n => <option key={n} value={n}>{n} / sayfa</option>)}
          </select>
        </div>
      </div>

      <div className={styles.tableCard}>
        {error && <div className={styles.errorBar}>{error}</div>}
        <table className={`${styles.table} ${localStyles.compactTable}`}>
          <thead>
            <tr>
              <th>Evrak / Proforma No</th>
              <th>Fatura No</th>
              <th>Kaynak</th>
              <th>Tarih</th>
              <th>Vade</th>
              <th>Firma</th>
              <th style={{ textAlign: "right" }}>Tutar (KDV Dahil)</th>
              <th>Ödeme Durumu</th>
              <th style={{ width: 72 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className={styles.empty}>Yükleniyor...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className={styles.empty}>Kayıt bulunamadı.</td></tr>
            ) : rows.map(row => {
              // Mevcut (legacy) durum listede yoksa seçeneğe ekle ki select doğru görünsün.
              const opts = row.OdemeDurumu && !ODEME_DURUMLARI.includes(row.OdemeDurumu)
                ? [row.OdemeDurumu, ...ODEME_DURUMLARI]
                : ODEME_DURUMLARI;
              return (
                <tr key={row.ID}>
                  <td className={localStyles.ellipsisCell} title={row.ProformaNo || "-"}>{row.ProformaNo || "-"}</td>
                  <td className={`${styles.primaryCell} ${localStyles.ellipsisCell}`} title={row.FaturaNo}>{row.FaturaNo}</td>
                  <td><span className={`${localStyles.sourceBadge} ${row.Kaynak === "Spektrotek" ? localStyles.sourceSpektrotek : row.Kaynak === "Root" ? localStyles.sourceRoot : row.Kaynak === "Ödeme" ? localStyles.sourcePayment : localStyles.sourceUnique}`}>{row.Kaynak || "Unique"}</span></td>
                  <td>{fmtTarih(row.Tarih)}</td>
                  <td>{fmtTarih(row.VadeTarihi)}</td>
                  <td className={localStyles.ellipsisCell} title={upperTr(row.FirmaAd) || "-"}>{upperTr(row.FirmaAd) || "-"}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                    {fmtMoney(row.Toplam)} TL
                  </td>
                  <td>
                    <select
                      value={row.OdemeDurumu || ""}
                      onChange={e => updateOdeme(row, e.target.value)}
                      className={`${styles.pageSizeSelect} ${localStyles.compactSelect}`}
                      style={odemeStyle(row.OdemeDurumu)}
                    >
                      {!row.OdemeDurumu && <option value="">Fatura Kesilmedi</option>}
                      {opts.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button className={styles.editBtn} type="button" onClick={() => openFaturaEdit(row)} title="Fatura detaylarını düzenle">
                      ✏️
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {!loading && rows.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--color-border)", fontWeight: 700 }}>
                <td colSpan={6} style={{ padding: "12px 8px", color: "var(--color-text-secondary)" }}>
                  {summary.adet} fatura · Kalan: <span style={{ color: kalan > 0 ? "#c06800" : "#1a7f4b" }}>{fmtMoney(kalan)} TL</span>
                </td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", padding: "12px 12px" }}>
                  <div>{fmtMoney(summary.toplam)} TL</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#1a7f4b" }}>Ödenen: {fmtMoney(summary.odenen)} TL</div>
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button className={styles.pageBtn} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
          {pageNumbers().map((p, i) => p === "..." ? (
            <span key={`dots-${i}`} className={styles.pageDots}>…</span>
          ) : (
            <button
              key={p}
              className={`${styles.pageBtn} ${p === page ? styles.pageBtnActive : ""}`}
              onClick={() => setPage(p as number)}
            >{p}</button>
          ))}
          <button className={styles.pageBtn} onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
          <span className={styles.pageInfo}>Sayfa {page} / {totalPages}</span>
        </div>
      )}

      {manualOpen && (
        <div className={styles.modalOverlay}>
          <div className={`${styles.modal} ${localStyles.invoiceModal}`}>
            <div className={styles.modalHeader}>
              <h2>{manualMode === "edit" ? "Fatura Detaylarını Düzenle" : "Manuel Fatura Ekle"}</h2>
              <button className={styles.modalClose} onClick={() => !manualSaving && setManualOpen(false)}>×</button>
            </div>
            <div className={styles.modalBody}>
              {manualError && <div className={styles.errorBar} style={{ marginBottom: 12 }}>{manualError}</div>}
              <div className={styles.formGrid}>
                <label>
                  <span>Kaynak *</span>
                  <select
                    value={manualForm.kaynak}
                    onChange={e => setManualForm(f => ({ ...f, kaynak: e.target.value }))}
                    style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--color-border)", borderRadius: 8, background: "var(--color-surface)" }}
                  >
                    {FATURA_KAYNAKLARI.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </label>
                <label>
                  <span>Fatura No *</span>
                  <input
                    value={manualForm.faturaNo}
                    onChange={e => setManualForm(f => ({ ...f, faturaNo: e.target.value }))}
                    style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--color-border)", borderRadius: 8 }}
                  />
                </label>
                <label>
                  <span>Fatura Tarihi *</span>
                  <input
                    type="date"
                    value={manualForm.faturaTarihi}
                    onChange={e => setManualForm(f => ({ ...f, faturaTarihi: e.target.value, vadeTarihi: addDaysIso(e.target.value, 30) }))}
                    style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--color-border)", borderRadius: 8 }}
                  />
                </label>
                <label>
                  <span>Vade Tarihi *</span>
                  <input
                    type="date"
                    value={manualForm.vadeTarihi}
                    onChange={e => setManualForm(f => ({ ...f, vadeTarihi: e.target.value }))}
                    style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--color-border)", borderRadius: 8 }}
                  />
                </label>
                <label>
                  <span>Tutar (KDV Dahil)</span>
                  <input
                    value={manualForm.toplam}
                    onChange={e => setManualForm(f => ({ ...f, toplam: e.target.value }))}
                    inputMode="decimal"
                    placeholder="0,00"
                    style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--color-border)", borderRadius: 8 }}
                  />
                </label>
                <label>
                  <span>KDV Oranı (%)</span>
                  <input
                    value={manualForm.kdvOran}
                    onChange={e => setManualForm(f => ({ ...f, kdvOran: e.target.value }))}
                    inputMode="decimal"
                    style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--color-border)", borderRadius: 8 }}
                  />
                </label>
              </div>
              <label style={{ display: "block", marginTop: 12 }}>
                <span>Açıklama</span>
                <textarea
                  value={manualForm.aciklama}
                  onChange={e => setManualForm(f => ({ ...f, aciklama: e.target.value }))}
                  rows={3}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--color-border)", borderRadius: 8, resize: "vertical" }}
                />
              </label>
              <div className={`${styles.formGrid} ${localStyles.secondaryFields}`}>
                <label>
                  <span>Firma</span>
                  <FirmaPicker value={manualFirma} manualValue={manualForm.firmaAdManuel} onChange={(firma, firmaAdManuel) => { setManualFirma(firma); setManualForm(f => ({ ...f, firmaAdManuel })); }} />
                </label>
                <label>
                  <span>Evrak No</span>
                  <input
                    value={manualForm.evrakNo}
                    onChange={e => setManualForm(f => ({ ...f, evrakNo: e.target.value }))}
                    placeholder="Boş bırakılabilir"
                    style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--color-border)", borderRadius: 8 }}
                  />
                </label>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setManualOpen(false)} disabled={manualSaving}>İptal</button>
              <button className={styles.saveBtn} onClick={submitManual} disabled={manualSaving}>
                {manualSaving ? "Kaydediliyor..." : (manualMode === "edit" ? "Güncelle" : "Kaydet")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
