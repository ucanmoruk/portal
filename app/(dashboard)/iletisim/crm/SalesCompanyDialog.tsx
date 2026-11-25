"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { X, Plus, Pencil } from "lucide-react";
import { crmCompanyContacts } from "@/lib/crmRules";
import type { CrmNote } from "@/lib/crmSales";
import { type SalesData, salesApi, salesDate } from "./salesApi";
import SalesCompanyForm from "./SalesCompanyForm";
import SalesMail from "./SalesMail";
import SalesMailLog from "./SalesMailLog";
import CrmMailComposer from "./CrmMailComposer";
import s from "./sales.module.css";

type Incoming = { id: number; email: string; subject: string; date: string; summary: string };
export default function SalesCompanyDialog({ companyId, initialTab = "Firma bilgileri", onClose, onChanged, onCreated }: { companyId: string; initialTab?: string; onClose: () => void; onChanged: () => Promise<void>; onCreated: (id: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<SalesData | null>(null), [tab, setTab] = useState(initialTab), [editing, setEditing] = useState(false);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [note, setNote] = useState(""), [noteType, setNoteType] = useState<"Not" | "Telefon" | "Ziyaret">("Not");
  const noteId = useRef(crypto.randomUUID()), mutation = useRef(false);
  const [incoming, setIncoming] = useState<Incoming[] | null>(null), [incomingId, setIncomingId] = useState(""), [advanced, setAdvanced] = useState(false);
  const company = data?.companies.find(c => c.id === companyId);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (companyId === "new") return;
    const result = await salesApi<SalesData>(`/api/crm/sales?companyId=${encodeURIComponent(companyId)}`, undefined, signal);
    if (!signal?.aborted) setData(result);
  }, [companyId]);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.message); }); return () => controller.abort(); }, [load]);
  const refresh = useCallback(async () => { await Promise.all([load(), onChanged()]); }, [load, onChanged]);
  async function addNote(event: React.FormEvent) {
    event.preventDefault(); if (mutation.current || !note.trim()) return; mutation.current = true; setBusy(true); setError("");
    try { await salesApi("/api/crm/sales", { action: "note", id: noteId.current, companyId, text: note, type: noteType }); noteId.current = crypto.randomUUID(); setNote(""); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Not kaydedilemedi."); } finally { mutation.current = false; setBusy(false); }
  }
  async function showIncoming() {
    setBusy(true); setError("");
    try { const result = await salesApi<{ incoming: Incoming[] }>("/api/crm/sales?incoming=1"); const addresses = new Set(company ? crmCompanyContacts(company.data).map(c => c.email.toLowerCase()) : []); setIncoming(result.incoming.sort((a, b) => Number(addresses.has(b.email.toLowerCase())) - Number(addresses.has(a.email.toLowerCase())))); }
    catch (e) { setError(e instanceof Error ? e.message : "Gelen mailler okunamadı."); } finally { setBusy(false); }
  }
  async function matchReply() {
    if (mutation.current || !incomingId) return; mutation.current = true; setBusy(true); setError("");
    try { await salesApi("/api/crm/sales", { action: "matchReply", companyId, sourceId: Number(incomingId) }); setIncoming(current => current?.filter(r => r.id !== Number(incomingId)) || []); setIncomingId(""); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Eşleştirilemedi."); } finally { mutation.current = false; setBusy(false); }
  }
  async function saved(id: string) { await onChanged(); if (companyId === "new") onCreated(id); else { setEditing(false); await load(); } }
  const contacts = company ? [{ email: company.data.email, name: company.data.contact, role: company.data.emailRole || "" }, ...(company.data.contacts || [])].filter(c => c.email || c.name || c.role) : [];
  const tabs = ["Firma bilgileri", "Görüşme notları", "Mail hazırla", "Mail geçmişi", "Gelen yanıtlar"];
  return <dialog ref={dialog} className={s.dialog} aria-labelledby="sales-company-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <header className={s.dialogHeader}><div><div className={s.eyebrow}>{companyId === "new" ? "Yeni firma" : "Firma çalışma alanı"}</div><h2 id="sales-company-title">{company?.data.name || (companyId === "new" ? "Firma ekle" : "Firma yükleniyor…")}</h2>{company && <span className={s.muted}>{company.data.source}{company.data.customerId ? " · müşteri listesiyle bağlantılı" : ""}</span>}</div><button className={`${s.button} ${s.close}`} aria-label="Firma detayını kapat" onClick={onClose} disabled={busy}><X size={18} /></button></header>
    <div className={s.dialogBody}>
      {error && <div className={s.error} role="alert">{error}</div>}
      {companyId === "new" ? <SalesCompanyForm onSaved={saved} onCancel={onClose} /> : !data || !company ? <p className={s.muted}>{data ? "Firma artık aktif değil. Listeyi yenileyin." : "Firma bilgileri ve geçmiş yükleniyor…"}</p> : <>
        <nav className={s.dialogTabs} aria-label="Firma detay bölümleri">{tabs.map(t => <button className={s.button} aria-pressed={tab === t} key={t} onClick={() => { setTab(t); setEditing(false); }} disabled={busy}>{t}{t === "Mail geçmişi" ? ` (${data.mails.length})` : ""}</button>)}</nav>
        {tab === "Firma bilgileri" && (editing ? <SalesCompanyForm key={company.version} record={company} onSaved={saved} onCancel={() => setEditing(false)} /> : <>
          <div className={s.actions}><button className={s.button} onClick={() => setEditing(true)}><Pencil size={14} />Bilgileri düzenle</button><span className={`${s.badge} ${s.priority}`} data-priority={company.data.priority || "Orta"}>{company.data.priority || "Orta"} öncelik</span>{(company.data.categories || []).map(c => <span className={s.badge} key={c}>{c}</span>)}</div>
          <div className={s.fields}><article className={s.card}><h3>İletişim</h3><p>{company.data.phone || "Telefon eklenmedi"}</p>{company.data.website && <a className={s.link} href={company.data.website} target="_blank" rel="noopener noreferrer">{company.data.website}</a>}<p>{company.data.address || "Adres eklenmedi"}</p></article><article className={s.card}><h3>Yetkililer</h3>{contacts.map((c, i) => <p key={i}><strong>{c.name || "İsim belirtilmedi"}</strong>{c.role ? ` · ${c.role}` : ""}<br />{c.email || "E-posta eklenmedi"}</p>)}{!contacts.length && <p className={s.muted}>Henüz kişi eklenmedi.</p>}</article></div>
          <div className={s.card}><h3>Anahtar kelimeler</h3><div className={s.actions}>{company.data.keywords?.length ? company.data.keywords.map(k => <span className={s.badge} key={k}>{k}</span>) : <span className={s.muted}>Firma için anahtar kelime ekleyebilirsiniz.</span>}</div></div>
          <div className={s.actions}><button className={s.primary} onClick={() => setTab("Mail hazırla")}>Firmaya özel mail hazırla</button><button className={s.button} onClick={() => setTab("Görüşme notları")}>Görüşme notu ekle</button></div>
        </>)}
        {tab === "Görüşme notları" && <section className={s.composer}><form onSubmit={addNote} className={s.composer}><label>Not türü<select className={s.button} value={noteType} onChange={e => setNoteType(e.target.value as typeof noteType)} disabled={busy}><option>Not</option><option>Telefon</option><option>Ziyaret</option></select></label><label>Yeni not<textarea style={{ minHeight: 100 }} maxLength={12000} placeholder="İlk arama, firma hakkında bilgi veya sonraki görüşme…" value={note} onChange={e => setNote(e.target.value)} disabled={busy} /></label><div><button className={s.primary} disabled={busy || !note.trim()}><Plus size={14} />Notu ekle</button></div></form><div className={s.timeline}>{data.notes.map(r => <article key={r.id}><strong>{(r.data as CrmNote).type}</strong><span className={s.muted}> · {salesDate(r.updatedAt)} · {r.updatedBy}</span><p>{r.data.text}</p></article>)}{!data.notes.length && <p className={s.muted}>İlk görüşme notunu ekleyin. AI sonraki taslakta bu bilgiyi kullanır.</p>}</div></section>}
        <div hidden={tab !== "Mail hazırla"}><SalesMail key={companyId} company={company} data={data} refresh={refresh} /></div>
        {tab === "Mail geçmişi" && <><SalesMailLog mails={data.mails} /><button className={s.button} onClick={() => setAdvanced(v => !v)}>Gelişmiş alıcı / belirsiz gönderim kontrolü</button>{advanced && <CrmMailComposer companies={[company]} templates={[]} initialCompanyId={companyId} onClose={() => { setAdvanced(false); void refresh(); }} />}</>}
        {tab === "Gelen yanıtlar" && <section className={s.composer}><p className={s.muted}>Unique Talep posta kutusuna alınan gerçek e-postaları firmayla eşleştirin. Aynı e-posta yalnızca bir firmayla eşleşir. Otomatik yanıt tahmini yapılmaz.</p>{data.canMatchReplies && <button className={s.button} disabled={busy} onClick={() => void showIncoming()}>Gelen e-postayla eşleştir</button>}{incoming && <div className={s.card}><label>Gelen e-posta<select className={s.button} value={incomingId} onChange={e => setIncomingId(e.target.value)}><option value="">E-posta seçin</option>{incoming.map(r => <option key={r.id} value={r.id}>{r.email} · {r.subject} · {salesDate(r.date)}</option>)}</select></label>{incomingId && <p>{incoming.find(r => r.id === Number(incomingId))?.summary}</p>}{!incoming.length && <p className={s.muted}>Eşleştirilecek mail yok. Unique Talep bölümünden posta kutusunu güncelleyebilirsiniz.</p>}<div><button className={s.primary} disabled={busy || !incomingId} onClick={() => void matchReply()}>Bu firmayla eşleştir</button></div></div>}{data.replies.map(r => <article className={s.card} key={r.id}><h3>{r.data.subject}</h3><span className={s.muted}>{r.data.from} · {salesDate(r.data.receivedAt)} · Eşleştiren: {r.data.matchedBy}</span><p>{r.data.text}</p></article>)}{!data.replies.length && <p className={s.muted}>Henüz eşleştirilmiş yanıt yok.</p>}</section>}
      </>}
    </div>
  </dialog>;
}
