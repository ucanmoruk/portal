"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, Check, ChevronLeft, ChevronRight, Filter, Plus, Printer, Trash2 } from "lucide-react";
import styles from "./muhasebe.module.css";

const PERIODS = ["Ekim", "Kasım", "Aralık", "2027"] as const;
const RELATED = ["Root", "Unique", "Spektrotek", "Oğuzhan", "Selin"] as const;
type Period = typeof PERIODS[number];
type PaymentState = "bekliyor" | "odendi";
type Row = { id: number; aciklama: string; ilgili: string; gun: number; tutarlar: Record<string, number | null>; durumlar: Record<string, PaymentState> };
type View = "aylik" | "haftalik";

const money = (value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(value);
const emptyValues = () => Object.fromEntries(PERIODS.map((period) => [period, null]));

export default function MuhasebeClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("aylik");
  const [filter, setFilter] = useState<"tumu" | "bekleyen">("bekleyen");
  const [related, setRelated] = useState("Tümü");
  const [week, setWeek] = useState(1);
  const [weekPeriod, setWeekPeriod] = useState<Period>("Ekim");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/muhasebe");
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setRows(json.data || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Veriler alınamadı."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async (row: Row) => {
    setSaving(row.id); setError("");
    try {
      const response = await fetch("/api/admin/muhasebe", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(row) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setRows((current) => current.map((item) => item.id === row.id ? json.data : item));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Kayıt güncellenemedi."); }
    finally { setSaving(null); }
  }, []);

  const patchRow = (id: number, patch: Partial<Row>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  const currentRow = (id: number) => rows.find((row) => row.id === id);

  async function addRow() {
    setError("");
    const response = await fetch("/api/admin/muhasebe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aciklama: "Yeni ödeme", ilgili: "Unique", gun: 1, tutarlar: emptyValues(), durumlar: {} }) });
    const json = await response.json();
    if (!response.ok) { setError(json.error || "Satır eklenemedi."); return; }
    setRows((current) => [...current, json.data]);
  }

  async function removeRow(id: number) {
    if (!window.confirm("Bu ödeme satırı silinsin mi?")) return;
    const response = await fetch(`/api/admin/muhasebe?id=${id}`, { method: "DELETE" });
    if (response.ok) setRows((current) => current.filter((row) => row.id !== id));
  }

  function setAmount(row: Row, period: Period, raw: string) {
    const value = raw === "" ? null : Number(raw.replace(",", "."));
    const durumlar = { ...row.durumlar };
    if (value === null) delete durumlar[period];
    else durumlar[period] ||= "bekliyor";
    patchRow(row.id, { tutarlar: { ...row.tutarlar, [period]: Number.isFinite(value) ? value : null }, durumlar });
  }

  function toggleState(row: Row, period: Period) {
    if (row.tutarlar[period] == null) return;
    const next: PaymentState = row.durumlar[period] === "odendi" ? "bekliyor" : "odendi";
    const changed = { ...row, durumlar: { ...row.durumlar, [period]: next } };
    setRows((current) => current.map((item) => item.id === row.id ? changed : item));
    void save(changed);
  }

  const visibleRows = useMemo(() => rows.filter((row) => {
    if (related !== "Tümü" && row.ilgili !== related) return false;
    if (view === "haftalik") {
      const start = (week - 1) * 7 + 1;
      if (row.gun < start || row.gun > Math.min(start + 6, 31) || row.tutarlar[weekPeriod] == null) return false;
    }
    const filteredPeriods: readonly Period[] = view === "haftalik" ? [weekPeriod] : PERIODS;
    return filter === "tumu" || filteredPeriods.some((period) => row.tutarlar[period] != null && row.durumlar[period] !== "odendi");
  }), [rows, related, view, week, weekPeriod, filter]);

  const totals = useMemo(() => Object.fromEntries(PERIODS.map((period) => [period, visibleRows.reduce((sum, row) => sum + Number(row.tutarlar[period] || 0), 0)])), [visibleRows]);
  const grandTotal = visibleRows.reduce((sum, row) => sum + (view === "haftalik" ? Number(row.tutarlar[weekPeriod] || 0) : PERIODS.reduce((rowSum, period) => rowSum + Number(row.tutarlar[period] || 0), 0)), 0);

  return <main className={styles.page}>
    <header className={styles.pageHeader}><div><p className={styles.eyebrow}>Finans operasyonu</p><h1>Muhasebe ödeme planı</h1><p>Aylık yükümlülükleri girin, vadesine göre izleyin ve ödenen tutarları işaretleyin.</p></div><div className={`${styles.headerActions} ${styles.noPrint}`}><button onClick={() => window.print()}><Printer size={16}/>Yazdır</button><button className={styles.addButton} onClick={() => void addRow()}><Plus size={16}/>Satır ekle</button></div></header>
    <section className={`${styles.toolbar} ${styles.noPrint}`}><div className={styles.segmented}><button className={view === "aylik" ? styles.active : ""} onClick={() => setView("aylik")}>Aylık</button><button className={view === "haftalik" ? styles.active : ""} onClick={() => setView("haftalik")}>Haftalık</button></div>{view === "haftalik" && <div className={styles.weekPicker}><select value={weekPeriod} onChange={(event) => setWeekPeriod(event.target.value as Period)}>{PERIODS.map((period) => <option key={period}>{period}</option>)}</select><button disabled={week === 1} onClick={() => setWeek((value) => value - 1)} aria-label="Önceki hafta"><ChevronLeft size={16}/></button><span>{week}. hafta <small>{(week - 1) * 7 + 1}–{Math.min(week * 7, 31)}. gün</small></span><button disabled={week === 5} onClick={() => setWeek((value) => value + 1)} aria-label="Sonraki hafta"><ChevronRight size={16}/></button></div>}<div className={styles.filters}><Filter size={15}/><select value={filter} onChange={(event) => setFilter(event.target.value as "tumu" | "bekleyen")}><option value="bekleyen">Ödeme bekleyenler</option><option value="tumu">Tüm kayıtlar</option></select><select value={related} onChange={(event) => setRelated(event.target.value)}><option>Tümü</option>{RELATED.map((item) => <option key={item}>{item}</option>)}</select></div></section>
    {error && <div className={styles.error} role="alert">{error}</div>}
    <section className={styles.sheet} aria-busy={loading}><div className={styles.sheetCaption}><span><CalendarRange size={15}/>{view === "aylik" ? "Ekim–Aralık ve 2027 devri" : `${weekPeriod} · ${week}. hafta`}</span><span>{visibleRows.length} satır · {money(grandTotal)}</span></div><div className={styles.tableWrap}><table>
      <colgroup><col className={styles.descriptionCol}/><col className={styles.relatedCol}/><col className={styles.dayCol}/>{view === "aylik" ? PERIODS.map((period) => <col key={period} className={styles.amountCol}/>) : <col className={styles.amountCol}/>}<col className={styles.totalCol}/><col className={`${styles.actionCol} ${styles.noPrint}`}/></colgroup>
      <thead><tr><th>Açıklama</th><th>İlgili</th><th>Gün</th>{view === "aylik" ? PERIODS.map((period) => <th key={period}>{period}</th>) : <th>{weekPeriod}</th>}<th>Toplam</th><th className={styles.noPrint}/></tr></thead>
      <tbody>{loading ? <tr><td colSpan={view === "aylik" ? 8 : 5} className={styles.empty}>Yükleniyor…</td></tr> : visibleRows.length === 0 ? <tr><td colSpan={view === "aylik" ? 8 : 5} className={styles.empty}>Bu görünümde kayıt yok.</td></tr> : visibleRows.map((row) => {
        const periods = view === "aylik" ? PERIODS : [weekPeriod];
        const rowTotal = view === "haftalik" ? Number(row.tutarlar[weekPeriod] || 0) : PERIODS.reduce((sum, period) => sum + Number(row.tutarlar[period] || 0), 0);
        return <tr key={row.id} className={saving === row.id ? styles.saving : ""}><td><input className={styles.textInput} value={row.aciklama} onChange={(event) => patchRow(row.id, { aciklama: event.target.value })} onBlur={() => { const value = currentRow(row.id); if (value) void save(value); }}/></td><td><select value={row.ilgili} onChange={(event) => { const changed = { ...row, ilgili: event.target.value }; patchRow(row.id, changed); void save(changed); }}>{RELATED.map((item) => <option key={item}>{item}</option>)}</select></td><td><input className={styles.dayInput} type="number" min="1" max="31" value={row.gun} onChange={(event) => patchRow(row.id, { gun: Number(event.target.value) })} onBlur={() => { const value = currentRow(row.id); if (value) void save(value); }}/></td>{periods.map((period) => { const amount = row.tutarlar[period]; const state = amount == null ? "bos" : row.durumlar[period] === "odendi" ? "odendi" : "bekliyor"; return <td key={period} className={`${styles.paymentCell} ${styles[state]}`}><div><input aria-label={`${row.aciklama} ${period} tutarı`} type="number" min="0" step="0.01" value={amount ?? ""} placeholder="—" onChange={(event) => setAmount(row, period, event.target.value)} onBlur={() => { const value = currentRow(row.id); if (value) void save(value); }}/>{amount != null && <button className={styles.stateButton} onClick={() => toggleState(row, period)} title={state === "odendi" ? "Ödendi" : "Bekliyor"}><Check size={13}/></button>}</div></td>; })}<td className={styles.rowTotal}>{money(rowTotal)}</td><td className={styles.noPrint}><button className={styles.deleteButton} onClick={() => void removeRow(row.id)} aria-label={`${row.aciklama} satırını sil`}><Trash2 size={15}/></button></td></tr>;
      })}</tbody>
      {visibleRows.length > 0 && <tfoot><tr><th colSpan={3}>Görünüm toplamı</th>{(view === "aylik" ? PERIODS : [weekPeriod]).map((period) => <td key={period}>{money(Number(totals[period] || 0))}</td>)}<td>{money(grandTotal)}</td><td className={styles.noPrint}/></tr></tfoot>}
    </table></div><footer className={styles.legend}><span><i className={styles.pendingDot}/>Sarı: ödeme bekliyor</span><span><i className={styles.paidDot}/>Yeşil: ödendi</span><span>Tutarı yazın; onay simgesine basarak durumu değiştirin.</span></footer></section>
  </main>;
}
