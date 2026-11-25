"use client";
import { useRef, useState } from "react";
import { Sparkles, Send, Save, Plus } from "lucide-react";
import { crmCompanyContacts, type CrmCompany, type CrmRecord } from "@/lib/crmRules";
import { recommendSalesTemplate, type CrmOutreach } from "@/lib/crmSales";
import { emailHasContent, emailPreviewDocument, renderCrmEmail } from "@/lib/crmEmail";
import CrmEmailEditor from "./CrmEmailEditor";
import { type SalesData, salesApi, salesDate } from "./salesApi";
import s from "./sales.module.css";

export default function SalesMail({ company, data, refresh }: { company: CrmRecord<CrmCompany>; data: SalesData; refresh: () => Promise<void> }) {
  const templates = data.templates || [], recommended = recommendSalesTemplate(templates, company.data);
  const [templateId, setTemplateId] = useState(recommended?.id || "");
  const [subject, setSubject] = useState(recommended?.data.subject || ""), [body, setBody] = useState(recommended?.data.body || ""), [format, setFormat] = useState<"text" | "html">(recommended?.data.format || "text"), [instruction, setInstruction] = useState("");
  const contacts = crmCompanyContacts(company.data);
  const [to, setTo] = useState(contacts[0]?.email || "");
  const primary = contacts.find(c => c.email === to), cc = contacts.filter(c => c.email !== to);
  const [draft, setDraft] = useState({ id: crypto.randomUUID(), version: 0 });
  const [review, setReview] = useState<CrmRecord<CrmOutreach> | null>(null);
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState(""), [rationale, setRationale] = useState("");
  const lock = useRef(false);
  const savedDrafts = data.outreaches.filter(r => r.data.state === "Taslak");
  const valid = !!subject.trim() && emailHasContent(renderCrmEmail(body, format, company.data));
  async function task(label: string, work: () => Promise<void>) {
    if (lock.current) return; lock.current = true; setBusy(label); setError(""); setNotice("");
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "İşlem tamamlanamadı."); }
    finally { lock.current = false; setBusy(""); }
  }
  function chooseTemplate(id: string) {
    const template = templates.find(r => r.id === id); setTemplateId(id); setSubject(template?.data.subject || ""); setBody(template?.data.body || ""); setFormat(template?.data.format || "text"); setReview(null);
  }
  function openDraft(record?: CrmRecord<CrmOutreach>) {
    setDraft({ id: record?.id || crypto.randomUUID(), version: record?.version || 0 });
    if (record) { setSubject(record.data.subject); setBody(record.data.body); setFormat(record.data.format || "text"); setTemplateId(""); setTo(record.data.primaryTo || contacts[0]?.email || ""); }
    else chooseTemplate(recommended?.id || "");
    setReview(null); setError(""); setNotice(""); setRationale("");
  }
  async function generate() {
    await task("AI taslağı hazırlanıyor…", async () => {
      const result = await salesApi<{ draft: { subject: string; body: string; rationale: string } }>("/api/crm/sales", { action: "generate", companyId: company.id, instruction, ...(templateId ? { templateId } : {}) });
      setSubject(result.draft.subject); setBody(result.draft.body); setFormat("text"); setRationale(result.draft.rationale); setReview(null);
      setNotice("Taslak hazır. Düzenleyip gönderim kontrolüne geçebilirsiniz.");
    });
  }
  async function saveDraft() {
    await task("Taslak kaydediliyor…", async () => {
      const result = await salesApi<{ batch: CrmRecord<CrmOutreach> }>("/api/crm/sales", { action: "saveDraft", ...draft, companyId: company.id, subject, body, format, ...(to ? { to } : {}) });
      setDraft({ id: result.batch.id, version: result.batch.version }); await refresh(); setNotice("Taslak kaydedildi.");
    });
  }
  async function prepare() {
    await task("Gönderim kontrolü hazırlanıyor…", async () => {
      const result = await salesApi<{ batch: CrmRecord<CrmOutreach> }>("/api/crm/sales", { action: "review", id: crypto.randomUUID(), companyId: company.id, subject, body, format, to });
      setReview(result.batch); await refresh();
    });
  }
  async function send() {
    if (!review) return;
    await task("E-posta gönderiliyor…", async () => {
      try { const result = await salesApi<{ message: string }>("/api/crm/sales", { action: "send", id: review.id, version: review.version, confirmTo: review.data.recipients.map(r => r.email), confirmFrom: review.data.sender }); setNotice(result.message); }
      finally { setReview(null); await refresh(); }
    });
  }
  return <section className={s.composer} aria-label="Firmaya özel mail hazırlama">
    <div className={s.actions}><h3 style={{ margin: 0 }}>Mail hazırla</h3><button className={s.button} disabled={!!busy} onClick={() => openDraft()}><Plus size={14} />Yeni taslak</button></div>
    {error && <div className={s.error} role="alert">{error}</div>}{notice && <div className={s.notice} role="status">{notice}</div>}
    {data.outreaches.some(r => r.data.state === "Gönderiliyor") && <div className={s.error}>Sonucu tamamlanmamış bir gönderim var. Yeniden göndermeden önce mail geçmişini kontrol edin.</div>}
    <div className={s.fields}><label>Gönderen<input readOnly value={data.sender || "Oğuzhan Eker <oguzhan@uniqueanalyse.com>"} /></label><label>Ana alıcı<select value={to} disabled={!!busy || !!review} onChange={e => { setTo(e.target.value); setReview(null); }}><option value="">Alıcı seçin</option>{contacts.map(c => <option key={c.email} value={c.email}>{c.name ? `${c.name} · ` : ""}{c.email}</option>)}</select></label></div>
    {cc.length > 0 && <div className={s.recipients}><span className={s.muted}>CC</span>{cc.map(c => <span className={s.badge} key={c.email}>{c.name ? `${c.name} · ` : ""}{c.email}</span>)}</div>}
    <label>Mail şablonu<select className={s.button} value={templateId} disabled={!!busy || !!review} onChange={e => chooseTemplate(e.target.value)}><option value="">Boş içerik</option>{templates.map(t => <option key={t.id} value={t.id}>{t.data.name}{t.id === recommended?.id ? " · önerilen" : ""}</option>)}</select></label>
    <details className={s.aiBox}><summary>AI ile firmaya özel düzenle</summary><label>Ek yönlendirme<textarea style={{ minHeight: 64, height: 64 }} maxLength={3000} value={instruction} disabled={!!busy} placeholder="Örn. son görüşmedeki stabilite ihtiyacına odaklan" onChange={e => setInstruction(e.target.value)} /></label><div className={s.actions}><button className={s.button} disabled={!!busy || !data.aiReady || !!review} onClick={() => void generate()}><Sparkles size={14} />AI taslağı hazırla</button><span className={s.muted}>{data.aiReady ? `${data.aiProvider} · firma bilgileri ve notları kullanılır` : "AI bağlantısı için AI ayarlarını tamamlayın"}</span></div>{rationale && <p className={s.muted}>{rationale}</p>}</details>
    {savedDrafts.length > 0 && <label>Kayıtlı taslak<select className={s.button} value={savedDrafts.some(r => r.id === draft.id) ? draft.id : ""} disabled={!!busy} onChange={e => { const record = savedDrafts.find(r => r.id === e.target.value); if (record) openDraft(record); }}><option value="">Taslak seçin</option>{savedDrafts.map(r => <option key={r.id} value={r.id}>{r.data.subject} · {salesDate(r.updatedAt)}</option>)}</select></label>}
    <label>Konu<input maxLength={300} value={subject} disabled={!!busy || !!review} onChange={e => { setSubject(e.target.value); setReview(null); }} /></label>
    <CrmEmailEditor value={body} format={format} disabled={!!busy || !!review} onChange={(html, mode) => { setBody(html); setFormat(mode); setReview(null); }} />
    <p className={s.muted}>Oğuzhan Eker imzası otomatik eklenir. Şablonda aynı imza varsa ikinci kez eklenmez. {"{{yetkili}}"} ana alıcının adıyla doldurulur.</p>
    <div className={s.actions}><button className={s.button} disabled={!!busy || !valid || !!review} onClick={() => void saveDraft()}><Save size={14} />Taslağı kaydet</button><button className={s.primary} disabled={!!busy || !valid || !primary || !!review || !data.canSend || !data.sender || company.data.permission === "Ret"} onClick={() => void prepare()}><Send size={14} />Gönderimi kontrol et</button>{busy && <span className={s.muted} role="status">{busy}</span>}</div>
    {!data.sender && <p className={s.muted}>Gönderim için SMTP bağlantı ayarlarını tamamlayın.</p>}
    {review && <section className={s.review} aria-label="Firma maili gönderim onayı"><h3 style={{ margin: 0 }}>Son kontrol</h3><p className={s.muted}>Gönderen: {review.data.sender}<br />Alıcı: {review.data.primaryTo}<br />CC: {review.data.recipients.filter(r => r.email !== review.data.primaryTo).map(r => r.email).join(", ") || "—"}</p><strong>{review.data.subject.replace(/\{\{firma\}\}/g, company.data.name).replace(/\{\{yetkili\}\}/g, primary?.name || "Yetkili")}</strong><iframe title="Gönderilecek mail önizlemesi" sandbox="" referrerPolicy="no-referrer" style={{ width: "100%", height: 400, border: "1px solid var(--color-border-light)", borderRadius: 8 }} srcDoc={emailPreviewDocument(review.data.previewHtml || "")} /><div className={s.actions}><button className={s.primary} disabled={!!busy} onClick={() => void send()}><Send size={14} />Onayla ve gönder</button><button className={s.button} disabled={!!busy} onClick={() => setReview(null)}>Düzenlemeye dön</button></div></section>}
  </section>;
}
