"use client";
import Link from "next/link";
import CrmOfferEditor from "./CrmOfferEditor";
import type { CrmOffer } from "@/lib/crmOffer";
import { useEffect, useState } from "react";
import ui from "./crm-agent.module.css";
import styles from "@/app/styles/table.module.css";

type Firm = { ID: number; Ad: string };
type Message = { role: "user" | "assistant"; content: string };

export default function CrmAgentClient({ canManageKnowledge = false }: { canManageKnowledge?: boolean }) {
  const [drafts, setDrafts] = useState<{ id: number; offer: CrmOffer }[]>([]);
  const [activeDraft, setActiveDraft] = useState<number | null>(null);
  useEffect(() => { fetch("/api/crm-agent/drafts").then(async r => { if (r.ok) setDrafts((await r.json()).data || []); }).catch(() => {}); }, []);
  const [firms, setFirms] = useState<Firm[]>([]), [search, setSearch] = useState(""), [firmaId, setFirmaId] = useState("");
  const [question, setQuestion] = useState(""), [messages, setMessages] = useState<Message[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState("");
  useEffect(() => { const timer = setTimeout(async () => { const response = await fetch(`/api/firmalar?search=${encodeURIComponent(search)}&limit=50&page=1&sortBy=ad&sortDir=asc`); if (response.ok) setFirms((await response.json()).data || []); }, 250); return () => clearTimeout(timer); }, [search]);
  const ask = async (preset?: string) => {
    const value = (preset || question).trim(); if (loading || !value) return;
    setLoading(true); setError(""); const next = [...messages, { role: "user" as const, content: value }]; setMessages(next); setQuestion("");
    try { const response = await fetch("/api/crm-agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: value, firmaId: firmaId || null, messages }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || "Yanıt alınamadı."); setMessages([...next, { role: "assistant", content: body.answer }]); if (body.offer && body.draftId) { setDrafts(prev => [{ id: body.draftId, offer: body.offer }, ...prev]); setActiveDraft(body.draftId); } }
    catch (err) { setError(err instanceof Error ? err.message : "Yanıt alınamadı."); }
    finally { setLoading(false); }
  };
  return <div className={ui.workspace}>
    {canManageKnowledge && <div className={ui.toolbar}><Link className={styles.cancelBtn} href="/iletisim/crm-agent/bilgi-kurallar">Bilgi ve Kurallar →</Link></div>}
    <div className={ui.chatLayout}>
      <aside className={`${styles.tableCard} ${ui.sidebar}`}>
        <div className={styles.formGroup}><label htmlFor="crm-company-search">Firma kapsamı</label><input id="crm-company-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Firma ara…" /><select aria-label="Analiz kapsamındaki firma" disabled={loading} value={firmaId} onChange={e => { setFirmaId(e.target.value); setMessages([]); setActiveDraft(null); }}><option value="">Tüm firmalar (genel analiz)</option>{firms.map(firm => <option key={firm.ID} value={firm.ID}>{firm.Ad}</option>)}</select></div>
        <div><h2 className={ui.sectionLabel}>Hazır sorular</h2><div className={ui.presets}>{["Bu hafta ödeme vadesi gelen firmalar ve faturalar hangileri?", "Bu ay görüşme planlanan firmalar hangileri?", "Takip bekleyen müşteri konularını özetle."].map(item => <button key={item} type="button" disabled={loading} className={styles.cancelBtn} onClick={() => void ask(item)}>{item}</button>)}</div></div>
      </aside>
      <section className={`${styles.tableCard} ${ui.chat}`} aria-label="CRM görüşmesi">
        <div className={ui.scope}>Kapsam: <strong>{firmaId ? firms.find(f => String(f.ID) === firmaId)?.Ad || "Seçili firma" : "Tüm firmalar"}</strong></div>
        <div className={ui.messages} aria-live="polite">
          {messages.length === 0 && <div className={styles.empty}>Müşteri talebini buraya yapıştırın. CRM Agent kapsamı analiz edip teklif ve e-posta yanıtı hazırlasın.</div>}
          {messages.map((message, index) => <div key={index} className={`${ui.message} ${message.role === "user" ? ui.userMessage : ""}`}>{message.content}</div>)}
          {loading && <p role="status" className={ui.muted}>Talep ve hizmet kapsamı inceleniyor…</p>}
          {error && <div role="alert" className={styles.formError}>{error}</div>}
        </div>
        <div className={ui.composer}><div className={styles.formGroup}><label htmlFor="crm-question">Talep veya soru</label><textarea id="crm-question" rows={3} maxLength={12000} value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(); } }} placeholder="Müşteri talebi ve varsa kapsam/adet düzeltmelerinizi yazın…" /></div><button type="button" className={styles.saveBtn} disabled={loading || !question.trim()} onClick={() => void ask()}>{loading ? "İnceleniyor…" : "Analiz et"}</button></div>
      </section>
    </div>
    {drafts.length > 0 && <section className={`${styles.tableCard} ${ui.draftPicker}`} aria-label="Kaydedilmiş taslaklar"><div className={styles.formGroup}><label htmlFor="crm-draft-picker">Teklif ve e-posta taslakları</label><select id="crm-draft-picker" value={activeDraft || ""} onChange={e => setActiveDraft(Number(e.target.value) || null)}><option value="">Taslak seçin…</option>{drafts.map(d => <option key={d.id} value={d.id}>#{d.id} — {d.offer.recipient || "Alıcı belirtilmedi"} — {d.offer.subject}</option>)}</select></div></section>}
    {drafts.map(d => <div key={d.id} hidden={d.id !== activeDraft}><CrmOfferEditor initial={d.offer} draftId={d.id} firms={firms} /></div>)}
  </div>;
}
