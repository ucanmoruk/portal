"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Mail, Trash2 } from "lucide-react";
import { UNIQUE_STATUSES, newestUniqueFirst, type UniqueRequest } from "@/lib/uniqueTalepRules";
import table from "@/app/styles/table.module.css";
import styles from "../spektrotek-talep/requests.module.css";

type Row = Omit<UniqueRequest, "text" | "offer"> & { summary: string; hasOffer: boolean };
export default function UniqueRequestsClient() {
  const [rows, setRows] = useState<Row[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [search, setSearch] = useState(""), [status, setStatus] = useState(""), [scope, setScope] = useState("potential"), [page, setPage] = useState(1);
  const [pending, setPending] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const selectionHeader = useRef<HTMLInputElement>(null);
  const mutationBusy = useRef(false), loadSequence = useRef(0);
  const load = useCallback(async () => {
    if (mutationBusy.current) return;
    const sequence = ++loadSequence.current;
    try { const response = await fetch("/api/unique-talep", { cache: "no-store" }); const result = await response.json(); if (!response.ok) throw new Error(result.error); if (sequence === loadSequence.current) setRows(result.data); }
    catch (e) { setError(e instanceof Error ? e.message : "Talepler okunamadı."); }
  }, []);
  useEffect(() => { void load(); const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60000); return () => clearInterval(timer); }, [load]);
  async function changeRow(row: Row, status?: Row["status"]) {
    if (mutationBusy.current || busy) return;
    if (!status && !window.confirm("Bu talep Unique Talep listesinden silinsin mi?")) return;
    mutationBusy.current = true; loadSequence.current++; setPending(row.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/unique-talep/${row.id}`, { method: status ? "POST" : "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: row.version, ...(status ? { action: "edit", status } : {}) }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "İşlem tamamlanamadı.");
      setRows(current => status ? current.map(item => item.id === row.id ? { ...item, ...result.item } : item) : current.filter(item => item.id !== row.id));
      setNotice(status ? "Talep durumu güncellendi." : "Talep listeden silindi.");
    } catch (e) { setError(e instanceof Error ? e.message : "İşlem tamamlanamadı."); }
    finally { loadSequence.current++; mutationBusy.current = false; setPending(null); }
  }
  async function sync() {
    if (mutationBusy.current || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/unique-talep", { method: "POST" }); const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setNotice(`${result.examined} e-posta incelendi, ${result.added} yeni kayıt eklendi.${result.more ? " Eski e-postaların aktarımı sonraki taramada devam edecek." : ""}`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Posta kutusu taranamadı."); }
    finally { setBusy(false); }
  }
  const filtered = useMemo(() => rows.filter(row => (scope !== "potential" || row.potential) && (!status || row.status === status) && `${row.name} ${row.email} ${row.subject} ${row.companyName} ${row.summary}`.toLocaleLowerCase("tr").includes(search.toLocaleLowerCase("tr"))).sort(newestUniqueFirst), [rows, scope, status, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / 25)), current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * 25, current * 25);
  const locked = (row: Row) => ["Hazırlanıyor", "Gönderiliyor", "Belirsiz"].includes(row.mailState);
  const selectable = visible.filter(row => !locked(row));
  const selectedRows = filtered.filter(row => selected.has(row.id) && !locked(row));
  const candidates = selectedRows.filter(row => !row.potential);
  const allSelected = selectable.length > 0 && selectable.every(row => selected.has(row.id));
  useEffect(() => {
    if (selectionHeader.current) selectionHeader.current.indeterminate = !allSelected && selectable.some(row => selected.has(row.id));
  }, [allSelected, selectable, selected]);
  function toggleSelection(ids: number[], checked: boolean) {
    setSelected(previous => { const next = new Set(previous); ids.forEach(id => checked ? next.add(id) : next.delete(id)); return next; });
  }
  async function promote(targets: Row[]) {
    if (mutationBusy.current || busy || !targets.length) return;
    mutationBusy.current = true; loadSequence.current++; setPending(targets[0].id); setError(""); setNotice("");
    let succeeded = 0;
    const failures: string[] = [];
    try {
      for (const row of targets) {
        try {
          const response = await fetch(`/api/unique-talep/${row.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "edit", version: row.version, potential: true }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "İşlem tamamlanamadı.");
          setRows(current => current.map(item => item.id === row.id ? { ...item, ...result.item } : item));
          toggleSelection([row.id], false); succeeded++;
        } catch (e) { failures.push(`${row.subject}: ${e instanceof Error ? e.message : "İşlem tamamlanamadı."}`); }
      }
      if (succeeded) setNotice(`${succeeded} e-posta potansiyel müşterilere aktarıldı.`);
      if (failures.length) setError(`${failures.length} e-posta aktarılamadı. ${failures[0]} Başarısız kayıtları kontrol edip yeniden deneyebilirsiniz.`);
    } finally { loadSequence.current++; mutationBusy.current = false; setPending(null); }
  }
  return <div className={`${table.page} ${styles.page}`}>
    <div className={table.pageHeader}><div><h1 className={table.pageTitle}>Unique Talep</h1><p className={table.pageSubtitle}>info@uniqueanalyse.com · Gelen müşteri talepleri ve teklifler</p></div><div className={styles.actions}><button className={styles.button} disabled={busy || pending !== null} onClick={() => void load()}><RefreshCw size={14} />Yenile</button><button className={styles.primary} disabled={busy || pending !== null} onClick={() => void sync()}><Mail size={15} />{busy ? "Taranıyor…" : "Posta kutusunu tara"}</button></div></div>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    <div className={styles.summaryWrap}><table className={styles.summary}><caption>Talep özeti</caption><thead><tr><th>Potansiyel müşteri</th><th>Bekliyor</th><th>Teklif gönderildi</th><th>Diğer e-postalar</th></tr></thead><tbody><tr><td>{rows.filter(r => r.potential).length}</td><td>{rows.filter(r => r.potential && r.status === "Bekliyor").length}</td><td>{rows.filter(r => r.status === "Teklif Gönderildi").length}</td><td>{rows.filter(r => !r.potential).length}</td></tr></tbody></table></div>
    <div className={styles.filters}>
      <label className={styles.search}>Ara<input value={search} onChange={e => { setSearch(e.target.value); setPage(1); setSelected(new Set()); }} placeholder="Firma, konu veya e-posta" /></label>
      <label>Görünüm<select value={scope} onChange={e => { setScope(e.target.value); setPage(1); setSelected(new Set()); }}><option value="potential">Potansiyel müşteriler</option><option value="all">Tüm e-postalar</option></select></label>
      <label>Durum<select value={status} onChange={e => { setStatus(e.target.value); setPage(1); setSelected(new Set()); }}><option value="">Tümü</option>{UNIQUE_STATUSES.map(s => <option key={s}>{s}</option>)}</select></label>
    </div>
    <div className={styles.actions}>
      <span aria-live="polite">{selectedRows.length} e-posta seçildi</span>
      <button className={styles.button} disabled={busy || pending !== null || !filtered.some(row => !locked(row))} onClick={() => toggleSelection(filtered.filter(row => !locked(row)).map(row => row.id), true)}>Filtredeki tümünü seç</button>
      <button className={styles.button} disabled={busy || pending !== null || !selected.size} onClick={() => setSelected(new Set())}>Seçimi temizle</button>
      <button className={styles.primary} disabled={busy || pending !== null || !candidates.length} onClick={() => void promote(candidates)}>{pending !== null ? "İşlem sürüyor…" : `Potansiyel müşterilere aktar (${candidates.length})`}</button>
    </div>
    <p className={styles.muted}>Son 30 gün taranır. Kural tabanlı ilk sınıflandırmayı detaydan düzeltebilir, teklif ve yanıtı yapay zekâ ile hazırlayabilirsiniz.</p>
    <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th><input ref={selectionHeader} type="checkbox" aria-label="Bu sayfadaki e-postaları seç" checked={allSelected} disabled={busy || pending !== null || !selectable.length} onChange={e => toggleSelection(selectable.map(row => row.id), e.target.checked)} /></th><th>Tarih</th><th>Müşteri / firma</th><th>E-posta</th><th>Talep</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>{visible.map(row => <tr key={row.id}><td><input type="checkbox" aria-label={`${row.subject} e-postasını seç`} checked={selected.has(row.id)} disabled={busy || pending !== null || locked(row)} onChange={e => toggleSelection([row.id], e.target.checked)} /></td><td className={styles.date}>{new Date(row.date).toLocaleString("tr-TR")}</td><td><strong>{row.companyName || row.name}</strong><small>{row.companyId ? "Firma eşleştirildi" : "Eşleştirme bekliyor"}</small></td><td>{row.email}</td><td className={styles.request}><strong>{row.subject}</strong><small>{row.summary.slice(0, 150)}</small></td><td><select className={styles.status} data-status={row.status} aria-label={`${row.subject} talep durumu`} value={row.status} disabled={busy || pending !== null || ["Hazırlanıyor", "Gönderiliyor", "Belirsiz"].includes(row.mailState)} onChange={e => void changeRow(row, e.target.value as Row["status"])}>{UNIQUE_STATUSES.map(s => <option key={s}>{s}</option>)}</select><small>{row.mailState === "Belirsiz" ? "Gönderim kontrolü gerekli" : ""}</small></td><td><div className={styles.actions}><Link className={styles.button} href={`/iletisim/unique-talep/${row.id}`}>İncele</Link>{!row.potential && <button className={styles.button} disabled={busy || pending !== null || locked(row)} onClick={() => void promote([row])}>Potansiyel müşteriye aktar</button>}<button type="button" className={styles.icon} aria-label={`${row.subject} talebini listeden sil`} title="Listeden sil" style={{ color: "var(--color-danger, #b42318)" }} disabled={busy || pending !== null || ["Hazırlanıyor", "Gönderiliyor", "Belirsiz"].includes(row.mailState)} onClick={() => void changeRow(row)}><Trash2 size={15} /></button></div></td></tr>)}{!filtered.length && <tr><td colSpan={7} className={styles.empty}>Bu filtrelerde talep yok. Posta kutusunu tarayabilir veya tüm e-postaları inceleyebilirsiniz.</td></tr>}</tbody></table></div>
    <div className={styles.pagination}><span>{filtered.length} kayıt · {current}/{pages}</span><button className={styles.button} disabled={current <= 1} onClick={() => setPage(current - 1)}>Önceki</button><button className={styles.button} disabled={current >= pages} onClick={() => setPage(current + 1)}>Sonraki</button></div>
  </div>;
}
