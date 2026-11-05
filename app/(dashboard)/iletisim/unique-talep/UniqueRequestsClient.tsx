"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Mail } from "lucide-react";
import { UNIQUE_STATUSES, UNIQUE_CATEGORIES, type UniqueRequest } from "@/lib/uniqueTalepRules";
import table from "@/app/styles/table.module.css";
import styles from "../spektrotek-talep/requests.module.css";

type Row = Omit<UniqueRequest, "text" | "offer"> & { summary: string; hasOffer: boolean };
export default function UniqueRequestsClient() {
  const [rows, setRows] = useState<Row[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [search, setSearch] = useState(""), [status, setStatus] = useState(""), [category, setCategory] = useState(""), [scope, setScope] = useState("potential"), [page, setPage] = useState(1);
  const load = useCallback(async () => {
    try { const response = await fetch("/api/unique-talep", { cache: "no-store" }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setRows(result.data); }
    catch (e) { setError(e instanceof Error ? e.message : "Talepler okunamadı."); }
  }, []);
  useEffect(() => { void load(); const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60000); return () => clearInterval(timer); }, [load]);
  async function sync() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/unique-talep", { method: "POST" }); const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setNotice(`${result.examined} e-posta incelendi, ${result.added} yeni kayıt eklendi.${result.more ? " Eski e-postaların aktarımı sonraki taramada devam edecek." : ""}`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Posta kutusu taranamadı."); }
    finally { setBusy(false); }
  }
  const filtered = useMemo(() => rows.filter(row => (scope !== "potential" || row.potential) && (!status || row.status === status) && (!category || row.category === category) && `${row.name} ${row.email} ${row.subject} ${row.companyName} ${row.summary}`.toLocaleLowerCase("tr").includes(search.toLocaleLowerCase("tr"))), [rows, scope, status, category, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / 25)), current = Math.min(page, pages);
  return <div className={`${table.page} ${styles.page}`}>
    <div className={table.pageHeader}><div><h1 className={table.pageTitle}>Unique Talep</h1><p className={table.pageSubtitle}>info@uniqueanalyse.com · Gelen müşteri talepleri ve teklifler</p></div><div className={styles.actions}><button className={styles.button} disabled={busy} onClick={() => void load()}><RefreshCw size={14} />Yenile</button><button className={styles.primary} disabled={busy} onClick={() => void sync()}><Mail size={15} />{busy ? "Taranıyor…" : "Posta kutusunu tara"}</button></div></div>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    <div className={styles.summaryWrap}><table className={styles.summary}><caption>Talep özeti</caption><thead><tr><th>Potansiyel müşteri</th><th>Bekliyor</th><th>Teklif iletildi</th><th>Diğer e-postalar</th></tr></thead><tbody><tr><td>{rows.filter(r => r.potential).length}</td><td>{rows.filter(r => r.potential && r.status === "Bekliyor").length}</td><td>{rows.filter(r => !!r.sentAt).length}</td><td>{rows.filter(r => !r.potential).length}</td></tr></tbody></table></div>
    <div className={styles.filters}>
      <label className={styles.search}>Ara<input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Firma, konu veya e-posta" /></label>
      <label>Görünüm<select value={scope} onChange={e => { setScope(e.target.value); setPage(1); }}><option value="potential">Potansiyel müşteriler</option><option value="all">Tüm e-postalar</option></select></label>
      <label>Durum<select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">Tümü</option>{UNIQUE_STATUSES.map(s => <option key={s}>{s}</option>)}</select></label>
      <label>Sınıf<select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}><option value="">Tümü</option>{UNIQUE_CATEGORIES.map(s => <option key={s}>{s}</option>)}</select></label>
    </div>
    <p className={styles.muted}>Son 30 gün taranır. Kural tabanlı ilk sınıflandırmayı detaydan düzeltebilir, teklif ve yanıtı yapay zekâ ile hazırlayabilirsiniz.</p>
    <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Tarih</th><th>Müşteri / firma</th><th>E-posta</th><th>Talep</th><th>Sınıf</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>{filtered.slice((current - 1) * 25, current * 25).map(row => <tr key={row.id}><td className={styles.date}>{new Date(row.date).toLocaleString("tr-TR")}</td><td><strong>{row.companyName || row.name}</strong><small>{row.companyId ? "Firma eşleştirildi" : "Eşleştirme bekliyor"}</small></td><td>{row.email}</td><td className={styles.request}><strong>{row.subject}</strong><small>{row.summary.slice(0, 150)}</small></td><td>{row.category}</td><td>{row.status}<small>{row.mailState === "Belirsiz" ? "Gönderim kontrolü gerekli" : ""}</small></td><td><Link className={styles.button} href={`/iletisim/unique-talep/${row.id}`}>İncele</Link></td></tr>)}{!filtered.length && <tr><td colSpan={7} className={styles.empty}>Bu filtrelerde talep yok. Posta kutusunu tarayabilir veya tüm e-postaları inceleyebilirsiniz.</td></tr>}</tbody></table></div>
    <div className={styles.pagination}><span>{filtered.length} kayıt · {current}/{pages}</span><button className={styles.button} disabled={current <= 1} onClick={() => setPage(current - 1)}>Önceki</button><button className={styles.button} disabled={current >= pages} onClick={() => setPage(current + 1)}>Sonraki</button></div>
  </div>;
}
