"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, Mail, Plus, RefreshCw, X } from "lucide-react";
import type { CrmCompany, CrmMail, CrmRecord, CrmTemplate } from "@/lib/crmRules";
import { crmCompanyContacts, renderCrmTemplate } from "@/lib/crmRules";
import { emailHasContent, emailPreviewDocument, renderCrmEmail } from "@/lib/crmEmail";
import CrmEmailEditor from "./CrmEmailEditor";
import styles from "../spektrotek-talep/requests.module.css";
import ui from "./crm.module.css";

type Props = { companies: CrmRecord<CrmCompany>[]; templates: CrmRecord<CrmTemplate>[]; initialCompanyId: string; onClose: () => void };
type MailData = { records: CrmRecord<CrmMail>[]; configured: boolean; sender: string; reason: string; canSend: boolean; canResolve: boolean };
type Fields = { id: string; to: string; version: number; subject: string; body: string; format: "text" | "html" };
const defaultTo = (company?: CrmRecord<CrmCompany>) => { const contacts = company ? crmCompanyContacts(company.data) : []; return contacts.length === 1 ? contacts[0].email : ""; };
const newFields = (to = ""): Fields => ({ id: crypto.randomUUID(), to, version: 0, subject: "", body: "", format: "html" });
const date = (at: string) => new Date(at).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
async function mailApi(body: unknown) {
  const response = await fetch("/api/crm/mail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Mail işlemi tamamlanamadı.");
  return result;
}
export default function CrmMailComposer({ companies, templates, initialCompanyId, onClose }: Props) {
  const [companyId, setCompanyId] = useState(initialCompanyId), [search, setSearch] = useState(""), [fields, setFields] = useState<Fields>(() => newFields(defaultTo(companies.find(r => r.id === initialCompanyId))));
  const [data, setData] = useState<MailData | null>(null), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(false), [confirmation, setConfirmation] = useState<CrmRecord<CrmMail> | null>(null), [templateId, setTemplateId] = useState("");
  const [resolution, setResolution] = useState<"Gönderildi" | "Gönderilmedi">("Gönderilmedi"), [resolutionNote, setResolutionNote] = useState("");
  const mutation = useRef(false), sequence = useRef(0), panel = useRef<HTMLElement>(null);
  const company = companies.find(r => r.id === companyId), selected = data?.records.find(r => r.id === fields.id);
  const locked = !!selected && !["Taslak", "Hata"].includes(selected.data.state);
  const recipients = useMemo(() => company ? crmCompanyContacts(company.data) : [], [company]);
  const recipient = recipients.find(r => r.email.toLowerCase() === fields.to.toLowerCase());
  const html = useMemo(() => company ? renderCrmEmail(fields.body, fields.format, { ...company.data, contact: recipient?.name || "" }) : "", [company, recipient, fields.body, fields.format]);
  const valid = !!company && !!fields.subject.trim() && emailHasContent(html) && (!recipients.length || !!recipient);
  const dirty = !selected || fields.to.toLowerCase() !== selected.data.to.toLowerCase() || fields.subject !== selected.data.subject || fields.body !== selected.data.body || fields.format !== selected.data.format || company?.version !== selected.data.companyVersion;
  const choices = companies.filter(r => r.id === companyId || `${r.data.name} ${crmCompanyContacts(r.data).map(c => c.email).join(" ")}`.toLocaleLowerCase("tr-TR").includes(search.toLocaleLowerCase("tr-TR")));
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!companyId) { setData(null); return; }
    const seq = ++sequence.current; setLoading(true);
    try {
      const response = await fetch(`/api/crm/mail?companyId=${encodeURIComponent(companyId)}`, { cache: "no-store", signal });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      if (seq === sequence.current && !signal?.aborted) setData(result);
      return result as MailData;
    } finally { if (seq === sequence.current) setLoading(false); }
  }, [companyId]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => { controller.abort(); };
  }, [load]);
  useEffect(() => { panel.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, []);
  useEffect(() => {
    if (!selected || selected.data.state !== "Gönderiliyor" || busy) return;
    const timer = setInterval(() => { void load().catch(() => {}); }, 10000);
    return () => clearInterval(timer);
  }, [selected, busy, load]);
  function reset(to = defaultTo(company)) { setFields(newFields(to)); setPreview(false); setConfirmation(null); setTemplateId(""); setResolutionNote(""); setError(""); setNotice(""); }
  function chooseCompany(value: string) { setCompanyId(value); setData(null); reset(defaultTo(companies.find(r => r.id === value))); }
  async function saveDraft(review: boolean) {
    if (mutation.current || !company || !valid || locked) return;
    mutation.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const { to, ...draftFields } = fields;
      const result = await mailApi({ action: "draft", ...draftFields, ...(to ? { to } : {}), companyId });
      const record = result.record as CrmRecord<CrmMail>;
      setFields({ id: record.id, to: record.data.to, version: record.version, subject: record.data.subject, body: record.data.body, format: record.data.format });
      await load();
      if (review) setConfirmation(record); else setNotice("Firmaya özel mail taslağı kaydedildi.");
    } catch (e) { setError(e instanceof Error ? e.message : "Taslak kaydedilemedi."); }
    finally { mutation.current = false; setBusy(false); }
  }
  async function send() {
    if (mutation.current || !confirmation) return;
    mutation.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const result = await mailApi({ action: "send", id: confirmation.id, version: confirmation.version, confirmTo: confirmation.data.to, confirmFrom: data?.sender || "" });
      setNotice(result.message); setFields(current => ({ ...current, version: result.record.version }));
    } catch (e) { setError(e instanceof Error ? e.message : "Gönderim tamamlanamadı. Geçmişi yenileyerek kontrol edin."); }
    finally {
      setConfirmation(null);
      try {
        const latest = await load();
        const saved = latest?.records.find(r => r.id === confirmation.id);
        if (saved) setFields(current => current.id === saved.id ? { ...current, version: saved.version } : current);
      } catch { setError(current => `${current} Gönderim geçmişi alınamadı; tekrar göndermeden önce Yenile ile kontrol edin.`); }
      mutation.current = false; setBusy(false);
    }
  }
  async function resolve() {
    if (!selected || mutation.current) return;
    mutation.current = true; setBusy(true); setError("");
    try {
      const result = await mailApi({ action: "resolve", id: selected.id, version: selected.version, outcome: resolution, note: resolutionNote });
      setFields(current => ({ ...current, version: result.record.version })); setResolutionNote(""); await load(); setNotice("Yönetici kontrolü kaydedildi.");
    } catch (e) { setError(e instanceof Error ? e.message : "Kontrol kaydedilemedi."); }
    finally { mutation.current = false; setBusy(false); }
  }
  function open(record: CrmRecord<CrmMail>) {
    setFields({ id: record.id, to: record.data.to, version: record.version, subject: record.data.subject, body: record.data.body, format: record.data.format });
    setPreview(false); setConfirmation(null); setTemplateId(""); setError(""); setNotice(""); setResolutionNote("");
  }
  const needsReview = selected && (selected.data.state === "Belirsiz" || (selected.data.state === "Gönderiliyor" && selected.data.startedAt && Date.now() - new Date(selected.data.startedAt).getTime() > 5 * 60_000));
  return <section ref={panel} className={ui.panel} aria-label="Firmaya özel mail">
    <div className={styles.actions}><h2>Firmaya özel mail</h2><button type="button" className={styles.button} disabled={busy} onClick={() => reset()}><Plus size={14} />Yeni mail</button><button type="button" className={styles.icon} disabled={busy} title="Kapat" aria-label="Firma mail alanını kapat" onClick={onClose}><X size={15} /></button></div>
    <p className={styles.muted}>Seçtiğiniz firmaya tek alıcılı, birebir yazışma gönderin. İçerikteki değişiklikler genel şablonu değiştirmez.</p>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    <div className={styles.fields}><label>Firma ara<input type="search" value={search} disabled={busy} onChange={e => setSearch(e.target.value)} placeholder="Firma adı veya mail adresi" /></label><label htmlFor="crm-direct-company">Alıcı firma<select id="crm-direct-company" aria-label="Alıcı firma" value={companyId} disabled={busy} onChange={e => chooseCompany(e.target.value)}><option value="">Firma seçin</option>{choices.map(r => <option value={r.id} key={r.id}>{r.data.name} · {r.data.email || "Mail adresi yok"}</option>)}</select></label></div>
    {company && <>
      <div className={ui.mailRecipient}><strong>{company.data.name}</strong><span>{recipient ? [recipient.name, recipient.email].filter(Boolean).join(" · ") : recipients.length ? "Gönderilecek e-posta adresini seçin." : "Firma kaydına e-posta adresi ekleyin."}</span><span className={styles.muted}>{loading ? "Mail ayarları kontrol ediliyor…" : data?.configured ? `Gönderen: ${data.sender}` : data?.reason || "Mail ayarları henüz alınamadı."}</span></div>
      <div className={styles.fields}><label htmlFor="crm-direct-recipient">Alıcı e-posta<select id="crm-direct-recipient" aria-label="Alıcı e-posta" value={fields.to} disabled={busy || locked || !!confirmation} onChange={e => { setFields(current => ({ ...current, to: e.target.value })); setPreview(false); }}><option value="">{recipients.length ? "Gönderilecek kişiyi / adresi seçin" : "Kayıtlı e-posta yok"}</option>{recipients.map((contact, index) => <option key={contact.email.toLowerCase()} value={contact.email}>{[contact.name, contact.role, contact.email, index === 0 ? "Ana e-posta" : ""].filter(Boolean).join(" · ")}</option>)}{fields.to && !recipient && <option value={fields.to}>{fields.to} (firma kaydından kaldırılmış)</option>}</select></label></div>
      {company.data.permission === "Ret" && <p className={styles.error}>Bu firma için ret kaydı var; mail gönderilemez.</p>}
      {data && !data.canSend && <p className={styles.muted}>Taslak hazırlayabilirsiniz. Gönderim için “CRM — Firmaya mail gönder” yetkisi gerekir.</p>}
      <form onSubmit={e => { e.preventDefault(); void saveDraft(false); }} className={ui.inlineForm}>
        <div className={styles.fields}><label>Şablondan başla<select aria-label="Birebir mail şablonu" disabled={busy || locked || !!confirmation} value={templateId} onChange={e => {
          const template = templates.find(t => t.id === e.target.value); setTemplateId(e.target.value);
          if (template) { setFields(current => ({ ...current, subject: template.data.subject, body: template.data.body, format: template.data.format || "text" })); setPreview(false); }
        }}><option value="">Şablon seçin (isteğe bağlı)</option>{templates.map(t => <option key={t.id} value={t.id}>{t.data.name}</option>)}</select></label><label>Mail konusu<input required maxLength={500} disabled={busy || locked || !!confirmation} value={fields.subject} onChange={e => setFields(current => ({ ...current, subject: e.target.value }))} /></label></div>
        <CrmEmailEditor key={`${fields.id}:${companyId}`} value={fields.body} format={fields.format} disabled={busy || locked || !!confirmation} onChange={(body, format) => setFields(current => ({ ...current, body, format }))} />
        <div className={styles.actions}><button className={styles.primary} disabled={busy || locked || !!confirmation || !valid}>Taslağı kaydet</button><button type="button" className={styles.button} disabled={(!valid && !locked) || busy} onClick={() => setPreview(v => !v)}><Eye size={14} />Önizle</button><button type="button" className={styles.button} disabled={busy || loading || locked || !!confirmation || !valid || !data?.configured || !data?.canSend || !recipient || company.data.permission === "Ret"} onClick={() => void saveDraft(true)}><Mail size={14} />Gönderimi incele</button>{selected && <span className={styles.muted}>{selected.data.state}{dirty && !locked ? " · kaydedilmemiş değişiklik var" : ""}</span>}</div>
      </form>
      {preview && <div className={ui.mailReview}><strong>{locked && selected ? selected.data.renderedSubject : renderCrmTemplate(fields.subject, { ...company.data, contact: recipient?.name || "" })}</strong><iframe className={ui.emailPreview} title="Firmaya özel mail önizlemesi" sandbox="" referrerPolicy="no-referrer" srcDoc={emailPreviewDocument(locked && selected ? selected.data.html : html)} /></div>}
      {confirmation && <section className={ui.mailReview} aria-label="Mail gönderim kontrolü"><h2>Gönderim kontrolü</h2><p><strong>Alıcı:</strong> {confirmation.data.companyName}{confirmation.data.toName ? ` · ${confirmation.data.toName}` : ""}{confirmation.data.toRole ? ` (${confirmation.data.toRole})` : ""} &lt;{confirmation.data.to}&gt;</p><p><strong>Gönderen:</strong> {data?.sender}</p><p><strong>Konu:</strong> {confirmation.data.renderedSubject}</p><iframe className={ui.emailPreview} title="Gönderilecek mail içeriği" sandbox="" referrerPolicy="no-referrer" srcDoc={emailPreviewDocument(confirmation.data.html)} /><p className={styles.muted}>Bu işlem yalnızca yukarıdaki firmaya bir mail gönderir.</p><div className={styles.actions}><button type="button" className={styles.primary} disabled={busy} onClick={() => void send()}>{busy ? "Gönderiliyor…" : "Bu firmaya gönder"}</button><button type="button" className={styles.button} disabled={busy} onClick={() => setConfirmation(null)}>Vazgeç</button></div></section>}
      {needsReview && data?.canResolve && <section className={ui.mailReview}><h2>Gönderim sonucunu kontrol et</h2><p className={styles.muted}>Önce SMTP kayıtlarından veya posta kutusundan sonucu doğrulayın. “Gönderilmedi” seçimi taslağı tekrar gönderilebilir yapar.</p><div className={styles.fields}><label>Doğruladığınız sonuç<select value={resolution} disabled={busy} onChange={e => setResolution(e.target.value as typeof resolution)}><option>Gönderilmedi</option><option>Gönderildi</option></select></label><label>Kontrol notu<input maxLength={2000} minLength={5} value={resolutionNote} disabled={busy} onChange={e => setResolutionNote(e.target.value)} placeholder="Hangi kayıttan, nasıl kontrol edildi?" /></label></div><button type="button" className={styles.button} disabled={busy || resolutionNote.trim().length < 5} onClick={() => void resolve()}>Kontrol sonucunu kaydet</button></section>}
      <div className={styles.actions}><h2>Firma mail geçmişi</h2><button type="button" className={styles.icon} aria-label="Firma mail geçmişini yenile" disabled={busy || loading} onClick={() => { void load().catch(e => setError(e.message)); }}><RefreshCw size={14} /></button></div>
      <p className={styles.muted}>“Gönderildi”, SMTP sunucusunun kabulünü belirtir; teslim veya okunma teyidi değildir. Belirsiz gönderimler otomatik tekrarlanmaz.</p>
      <div className={styles.tableWrap}><table className={`${styles.table} ${ui.smallTable}`}><thead><tr><th>Tarih / kullanıcı</th><th>Alıcı / konu</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>{data?.records.map(record => <tr key={record.id}><td>{date(record.updatedAt)}<small>{record.updatedBy}</small></td><td>{record.data.to || "Mail adresi yok"}{record.data.toName && <small>{record.data.toName}{record.data.toRole ? ` · ${record.data.toRole}` : ""}</small>}<small>{record.data.renderedSubject}</small></td><td><span className={`${styles.status} ${ui.status}`} data-status={record.data.state}>{record.data.state}</span>{record.data.error && <small>{record.data.error}</small>}<details className={ui.history}><summary>İşlem geçmişi</summary>{record.data.history.map((h, i) => <p key={i}>{date(h.at)} · {h.by} · {h.state}<br />{h.note}</p>)}{record.data.messageId && <p>Mesaj kimliği: {record.data.messageId}</p>}</details></td><td><button type="button" className={styles.icon} disabled={busy} aria-label={`${record.data.renderedSubject} mailini aç`} onClick={() => open(record)}><Eye size={15} /></button></td></tr>)}{!data?.records.length && <tr><td colSpan={4} className={styles.empty}>{loading ? "Mail geçmişi yükleniyor…" : "Bu firma için kaydedilmiş mail yok."}</td></tr>}</tbody></table></div>
    </>}
  </section>;
}
