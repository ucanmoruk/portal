"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, Plus, RefreshCw, Search, Sparkles, Users, X } from "lucide-react";
import { CRM_CATEGORIES, CRM_SALES_STATUSES, crmCompanyContacts, type CrmCompany, type CrmRecord } from "@/lib/crmRules";
import SalesCompanyDialog from "./SalesCompanyDialog";
import SalesMailLog from "./SalesMailLog";
import SalesAiSettings from "./SalesAiSettings";
import CrmClient from "./CrmClient";
import { type SalesData, salesApi, salesDate } from "./salesApi";
import s from "./sales.module.css";

type Customer = { ID: number; name: string; email: string; contact: string };
function CustomerImport({ onClose, onImported }: { onClose: () => void; onImported: (id: string) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState(""), [customers, setCustomers] = useState<Customer[]>([]), [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const mutation = useRef(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      void salesApi<{ customers: Customer[] }>(`/api/crm?customers=${encodeURIComponent(query)}`, undefined, controller.signal).then(r => { if (!controller.signal.aborted) setCustomers(r.customers); }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  async function add() {
    if (mutation.current) return; mutation.current = true; setBusy(true); setError("");
    try { const result = await salesApi<{ ids: string[] }>("/api/crm", { action: "customers", customerIds: selected }); await onImported(result.ids[0] || ""); }
    catch (e) { setError(e instanceof Error ? e.message : "Müşteriler alınamadı."); } finally { mutation.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className={s.dialog} aria-labelledby="sales-import-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}><header className={s.dialogHeader}><h2 id="sales-import-title">Müşteri listesinden firma seç</h2><button className={s.button} onClick={onClose} disabled={busy} aria-label="Müşteri seçimini kapat"><X size={18} /></button></header><div className={s.dialogBody}>{error && <p className={s.error} role="alert">{error}</p>}<p className={s.muted}>İletişim bilgileri CRM’ye kopyalanır. Müşteri listesindeki asıl kayıt değişmez; mevcut CRM firması varsa tekrar eklenmez.</p><div className={s.filters}><input autoFocus aria-label="Müşteri listesinde ara" placeholder="Firma adı veya e-posta…" value={query} onChange={e => setQuery(e.target.value)} disabled={busy} /></div><div className={s.timeline}>{customers.map(c => <label key={c.ID} className={s.card} style={{ display: "flex", alignItems: "center", gap: 12 }}><input type="checkbox" disabled={busy || (!selected.includes(Number(c.ID)) && selected.length >= 100)} checked={selected.includes(Number(c.ID))} onChange={e => setSelected(current => e.target.checked ? [...current, Number(c.ID)] : current.filter(id => id !== Number(c.ID)))} /><span><strong>{c.name}</strong><br /><span className={s.muted}>{c.contact} {c.email}</span></span></label>)}{!customers.length && <p className={s.muted}>{loading ? "Müşteriler aranıyor…" : "Eşleşen müşteri yok."}</p>}</div><div className={s.actions}><button className={s.primary} disabled={busy || !selected.length} onClick={() => void add()}>{busy ? "Ekleniyor…" : `${selected.length} firmayı CRM’ye ekle`}</button><button className={s.button} onClick={onClose} disabled={busy}>Vazgeç</button></div></div></dialog>;
}
export default function SalesClient() {
  const [aiSettings, setAiSettings] = useState(false);
  const [data, setData] = useState<SalesData | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("Firmalar"), [selectedId, setSelectedId] = useState<string | null>(null), [detailTab, setDetailTab] = useState("Firma bilgileri"), [importing, setImporting] = useState(false);
  const [query, setQuery] = useState(""), [category, setCategory] = useState(""), [priority, setPriority] = useState(""), [status, setStatus] = useState(""), [page, setPage] = useState(1);
  const [changingId, setChangingId] = useState("");
  const sequence = useRef(0), mutation = useRef(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    const seq = ++sequence.current;
    try { const result = await salesApi<SalesData>("/api/crm/sales", undefined, signal); if (seq === sequence.current && !signal?.aborted) { setData(result); setError(""); } }
    finally { if (seq === sequence.current && !signal?.aborted) setLoading(false); }
  }, []);
  const refresh = useCallback(async () => { await load(); }, [load]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.message); }); return () => controller.abort(); }, [load]);
  const companyStatus = useCallback((r: CrmRecord<CrmCompany>) => {
    const stats = data?.stats[r.id];
    return r.data.salesStatus || (stats?.replies ? "Yanıt alındı" : (stats?.touches || 0) > 1 ? "2. temas" : stats?.sent ? "1. mail" : "Yeni");
  }, [data?.stats]);
  const companies = useMemo(() => (data?.companies || []).filter(r => {
    const text = `${r.data.name} ${r.data.phone} ${r.data.website || ""} ${(r.data.keywords || []).join(" ")} ${crmCompanyContacts(r.data).map(c => `${c.name} ${c.role} ${c.email}`).join(" ")}`.toLocaleLowerCase("tr-TR");
    return text.includes(query.toLocaleLowerCase("tr-TR")) && (!category || r.data.categories?.includes(category as typeof CRM_CATEGORIES[number])) && (!priority || (r.data.priority || "Orta") === priority) && (!status || companyStatus(r) === status);
  }), [data?.companies, query, category, priority, status, companyStatus]);
  const pages = Math.max(1, Math.ceil(companies.length / 15)), current = Math.min(page, pages);
  const stats = Object.values(data?.stats || {}), contacted = stats.filter(s => s.sent > 0).length, responded = stats.filter(s => s.replies > 0).length;
  function open(id: string, tab = "Firma bilgileri") { setDetailTab(tab); setSelectedId(id); }
  async function changeStatus(company: CrmRecord<CrmCompany>, value: string) {
    if (mutation.current) return; mutation.current = true; setChangingId(company.id);
    try { await salesApi("/api/crm/sales", { action: "status", companyId: company.id, version: company.version, status: value }); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Durum değiştirilemedi."); } finally { mutation.current = false; setChangingId(""); }
  }
  return <div className={s.page}>
    <header className={s.heading}><div><h1><Sparkles size={23} style={{ display: "inline", verticalAlign: "middle", marginRight: 9, color: "var(--color-accent)" }} />AI Satış Asistanı</h1><p className={s.muted}>Firma, görüşme ve e-postalarınızı tek yerden yönetin.</p></div><div className={s.actions}>{data?.canManageAi && <button className={s.button} onClick={() => setAiSettings(true)}><Sparkles size={14} />AI ayarları</button>}<button className={s.button} disabled={loading} aria-label="Firmaları yenile" onClick={() => { setLoading(true); void refresh().catch(e => setError(e.message)); }}><RefreshCw size={15} className={loading ? s.spinner : undefined} /></button>{data?.canUseCustomers && <button className={s.button} onClick={() => setImporting(true)}><Users size={15} />Müşteriden ekle</button>}<button className={s.primary} onClick={() => open("new")}><Plus size={16} />Yeni firma</button></div></header>
    {error && <div className={s.error} role="alert">{error}</div>}
    <section className={s.stats} aria-label="Satış özeti"><div className={s.stat}><span>Firma havuzu</span><strong>{data ? data.companies.length : "—"}</strong></div><div className={s.stat}><span>Gönderilen e-posta</span><strong>{data ? stats.reduce((n, r) => n + r.sent, 0) : "—"}</strong></div><div className={s.stat}><span>Temas kurulan firma</span><strong>{data ? contacted : "—"}</strong></div><div className={s.stat}><span>Yanıt veren firma</span><strong>{data ? responded : "—"}</strong>{contacted > 0 && <span className={s.muted}>%{Math.round(stats.filter(r => r.sent && r.replies).length / contacted * 100)} geri dönüş</span>}</div></section>
    <nav className={s.tabs} aria-label="AI Satış Asistanı bölümleri">{["Firmalar", "Mail günlüğü", "Listeler ve kampanyalar"].map(t => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>)}</nav>
    {tab === "Firmalar" && <>
      <div className={s.filters}><Search size={16} aria-hidden="true" /><input aria-label="Firma ara" placeholder="Firma, yetkili, e-posta veya anahtar kelime ara…" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /><select aria-label="Kategori filtresi" value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}><option value="">Tüm kategoriler</option>{CRM_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select><select aria-label="Öncelik filtresi" value={priority} onChange={e => { setPriority(e.target.value); setPage(1); }}><option value="">Tüm öncelikler</option>{["Yüksek", "Orta", "Düşük"].map(p => <option key={p}>{p}</option>)}</select><select aria-label="Durum filtresi" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">Tüm durumlar</option>{CRM_SALES_STATUSES.map(st => <option key={st}>{st}</option>)}</select></div>
      <div className={s.tableWrap}><table className={s.table}><thead><tr><th>Firma / yetkili</th><th>Kategori</th><th>Öncelik</th><th>Gönderilen mail</th><th>Yanıt</th><th>Süreç durumu</th><th>Son gönderim</th></tr></thead><tbody>{companies.slice((current - 1) * 15, current * 15).map(company => { const stats = data?.stats[company.id], contacts = crmCompanyContacts(company.data); return <tr key={company.id}><td><button className={s.link} onClick={() => open(company.id)}>{company.data.name}</button><small>{company.data.contact || contacts[0]?.name || "Yetkili eklenmedi"}{contacts.length ? ` · ${contacts.length} e-posta` : ""}</small></td><td>{company.data.categories?.length ? company.data.categories.join(", ") : <span className={s.muted}>Belirtilmedi</span>}</td><td><span className={`${s.badge} ${s.priority}`} data-priority={company.data.priority || "Orta"}>{company.data.priority || "Orta"}</span></td><td><button className={s.link} onClick={() => open(company.id, "Mail geçmişi")}>{stats?.sent || 0}</button><small>{stats?.touches || 0} temas</small></td><td>{stats?.replies || 0}</td><td><select className={s.button} aria-label={`${company.data.name} süreç durumu`} value={companyStatus(company)} disabled={!!changingId} onChange={e => void changeStatus(company, e.target.value)}>{CRM_SALES_STATUSES.map(st => <option key={st}>{st}</option>)}</select></td><td>{salesDate(stats?.lastSentAt)}</td></tr>; })}{!companies.length && <tr><td className={s.empty} colSpan={7}><Building2 size={28} style={{ margin: "0 auto 10px" }} /><strong>{loading ? "Firmalar yükleniyor…" : data?.companies.length ? "Filtrelere uygun firma bulunamadı." : "İlk firmanızla başlayın"}</strong><br />{!loading && !data?.companies.length && "Yeni firma ekleyin veya müşteri listesinden seçin. Görüşme notları ve mail geçmişi firma içinde birikecek."}</td></tr>}</tbody></table></div>
      <div className={s.pagination}><span>{companies.length} firma · {current}/{pages}</span><button className={s.button} disabled={current <= 1} onClick={() => setPage(current - 1)}>Önceki</button><button className={s.button} disabled={current >= pages} onClick={() => setPage(current + 1)}>Sonraki</button></div>
    </>}
    {tab === "Mail günlüğü" && data && <SalesMailLog mails={data.mails} onOpen={id => open(id, "Mail geçmişi")} />}
    {tab === "Listeler ve kampanyalar" && <CrmClient />}
    {selectedId && <SalesCompanyDialog key={selectedId} companyId={selectedId} initialTab={detailTab} onClose={() => setSelectedId(null)} onChanged={refresh} onCreated={id => open(id)} />}
    {aiSettings && <SalesAiSettings onClose={() => setAiSettings(false)} onSaved={refresh} />}
    {importing && <CustomerImport onClose={() => setImporting(false)} onImported={async id => { await refresh(); setImporting(false); if (id) open(id); }} />}
  </div>;
}
