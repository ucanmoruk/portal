"use client";
import { useEffect, useState } from "react";
import { emptyCrmKnowledge, type CrmKnowledge, type CrmKnowledgeContentType } from "@/lib/crmKnowledgeRules";
import styles from "@/app/styles/table.module.css";

const fields: { key: keyof CrmKnowledgeContentType; label: string; hint: string; placeholder: string; limit: number }[] = [
  { key: "rules", label: "Genel yorumlama ve teklif kuralları", hint: "Hangi taleplerde teklif hazırlanmalı, ne zaman ek bilgi istenmeli?", placeholder: "Örnek biçim: Müşteri … yazarsa … olarak yorumla. … belirtilmemişse önce … bilgisini sor.", limit: 12000 },
  { key: "serviceNotes", label: "Hizmet açıklamaları ve numune koşulları", hint: "Hizmet kapsamı, numune gereklilikleri ve birbirinden ayrılması gereken analizleri yazın. Fiyatları Hizmet Listesi’nden güncelleyin.", placeholder: "Hizmet adı / kodu: …\nKapsam: …\nGerekli numune bilgileri: …", limit: 10000 },
  { key: "aliases", label: "Eş anlamlı adlar ve kısaltmalar", hint: "Müşterilerin kullandığı ifadeyi katalogdaki hizmet adı/koduyla eşleştirin.", placeholder: "Müşterinin kullandığı ifade → Hizmet Listesi’ndeki ad veya kod", limit: 6000 },
  { key: "examples", label: "Yanlış yorumlar ve doğru örnekler", hint: "Önce müşteri ifadesini, ardından doğru yorumu ve gerekçesini yazın.", placeholder: "Müşteri metni: …\nYanlış yorum: …\nDoğru yorum: …\nGerekçe: …", limit: 12000 },
];
export default function CrmKnowledgeEditor() {
  const [record, setRecord] = useState<CrmKnowledge>(emptyCrmKnowledge);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [dirty, setDirty] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    fetch("/api/crm-agent/knowledge", { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Bilgiler yüklenemedi.");
      setRecord(data); setDirty(false);
    }).catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Bilgiler yüklenemedi."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (saving || loading) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/crm-agent/knowledge", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: record.version, content: record.content }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Bilgiler kaydedilemedi.");
      setRecord(prev => ({ ...prev, version: result.version })); setDirty(false);
      setNotice("Kaydedildi. CRM Agent bir sonraki mesajınızda bu bilgileri kullanacak.");
    } catch (err) { setError(err instanceof Error ? err.message : "Bilgiler kaydedilemedi."); }
    finally { setSaving(false); }
  }
  const length = Object.values(record.content).join("").length;
  return <form onSubmit={save} className={styles.tableCard} style={{ padding: 20, marginTop: 20 }}>
    {loading && <p role="status">Bilgiler yükleniyor…</p>}
    {error && <p role="alert" className={styles.formError}>{error}</p>}
    {!loading && error && !dirty && <button type="button" className={styles.cancelBtn} onClick={() => setRetry(n => n + 1)}>Yeniden yükle</button>}
    <fieldset disabled={loading || saving || (record.version === 0 && !!error && !dirty)} style={{ border: 0, padding: 0, display: "grid", gap: 20 }}>
      {fields.map(field => <div className={styles.formGroup} key={field.key}>
        <label htmlFor={`crm-${field.key}`}>{field.label}</label>
        <p id={`crm-${field.key}-hint`} style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "4px 0 8px" }}>{field.hint}</p>
        <textarea id={`crm-${field.key}`} aria-describedby={`crm-${field.key}-hint`} rows={7} maxLength={field.limit} placeholder={field.placeholder} value={record.content[field.key]} onChange={event => { setRecord(prev => ({ ...prev, content: { ...prev.content, [field.key]: event.target.value } })); setDirty(true); setNotice(""); }} style={{ width: "100%", boxSizing: "border-box", resize: "vertical", padding: 12, font: "inherit", lineHeight: 1.6, borderRadius: 8, border: "1px solid var(--color-border)" }} />
      </div>)}
      <p style={{ fontSize: 13 }}>{length.toLocaleString("tr-TR")} / 32.000 karakter · {dirty ? "Kaydedilmemiş değişiklikler var" : `Kayıt sürümü: ${record.version}`}</p>
      {record.updatedBy && <p style={{ fontSize: 12 }}>Son kaydeden: {record.updatedBy}</p>}
      <div><button type="submit" className={styles.saveBtn} disabled={!dirty || length > 32000}>{saving ? "Kaydediliyor…" : "Bilgi ve kuralları kaydet"}</button></div>
    </fieldset>
    {notice && <p role="status">{notice}</p>}
  </form>;
}
