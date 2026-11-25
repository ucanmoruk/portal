"use client";
import { useState } from "react";
import { CompanyFields, CRM_CATEGORIES, CRM_SALES_STATUSES, type CrmCompany, type CrmRecord } from "@/lib/crmRules";
import CrmContactsEditor from "./CrmContactsEditor";
import { salesApi } from "./salesApi";
import s from "./sales.module.css";

const empty = (): CrmCompany => ({ name: "", contact: "", email: "", contacts: [], emailRole: "", phone: "", address: "", taxNumber: "", permission: "Belirtilmedi", permissionNote: "", customerId: null, source: "Manuel", categories: [], keywords: [], priority: "Orta", website: "" });
export default function SalesCompanyForm({ record, onSaved, onCancel }: { record?: CrmRecord<CrmCompany>; onSaved: (id: string) => Promise<void>; onCancel: () => void }) {
  const [value, setValue] = useState<CrmCompany>(() => record ? { ...empty(), ...record.data } : empty());
  const [keywords, setKeywords] = useState((record?.data.keywords || []).join(", "));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  function field<K extends keyof CrmCompany>(key: K, v: CrmCompany[K]) { setValue(current => ({ ...current, [key]: v })); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try {
      const company = CompanyFields.parse({ ...value, keywords: [...new Set(keywords.split(",").map(v => v.trim()).filter(Boolean))] });
      const result = await salesApi<{ ids?: string[] }>("/api/crm", record ? { action: "company", id: record.id, version: record.version, company } : { action: "companies", companies: [company] });
      await onSaved(record?.id || result.ids?.[0] || "");
    } catch (e) { setError(e instanceof Error ? e.message : "Firma kaydedilemedi."); } finally { setBusy(false); }
  }
  return <form onSubmit={save} className={s.composer}>
    {error && <p className={s.error} role="alert">{error}</p>}
    <fieldset disabled={busy} className={s.fields} style={{ border: 0, padding: 0, margin: 0 }}>
      <label className={s.wide}>Firma adı *<input autoFocus required maxLength={300} value={value.name} onChange={e => field("name", e.target.value)} /></label>
      <label>Telefon<input type="tel" maxLength={100} value={value.phone} onChange={e => field("phone", e.target.value)} /></label>
      <label>Web sitesi<input type="url" placeholder="https://firma.com" maxLength={500} value={value.website || ""} onChange={e => field("website", e.target.value)} /></label>
      <label className={s.wide}>Adres<textarea rows={2} style={{ minHeight: 64, height: 64 }} maxLength={2000} value={value.address} onChange={e => field("address", e.target.value)} /></label>
      <div className={s.wide}><p className={s.muted}>Kategoriler · birden fazla seçebilirsiniz</p><div className={s.checks}>{CRM_CATEGORIES.map(category => <label key={category}><input type="checkbox" checked={value.categories?.includes(category) || false} onChange={e => field("categories", e.target.checked ? [...(value.categories || []), category] : value.categories?.filter(c => c !== category))} />{category}</label>)}</div></div>
      <label className={s.wide}>Anahtar kelimeler<input placeholder="Örn. güneş kremi, ihracat, mikrobiyoloji" maxLength={4000} value={keywords} onChange={e => setKeywords(e.target.value)} /><span className={s.muted}>Virgülle ayırarak ekleyin.</span></label>
      <label>Öncelik<select value={value.priority || "Orta"} onChange={e => field("priority", e.target.value as CrmCompany["priority"])}>{["Yüksek", "Orta", "Düşük"].map(v => <option key={v}>{v}</option>)}</select></label>
      <label>Süreç durumu<select value={value.salesStatus || ""} onChange={e => field("salesStatus", (e.target.value || undefined) as CrmCompany["salesStatus"])}><option value="">Gönderim ve yanıtlara göre göster</option>{CRM_SALES_STATUSES.map(v => <option key={v}>{v}</option>)}</select></label>
      <div className={s.wide}><CrmContactsEditor value={value} disabled={busy} onChange={setValue} /></div>
    </fieldset>
    <div className={s.actions}><button className={s.primary} disabled={busy}>{busy ? "Kaydediliyor…" : "Firmayı kaydet"}</button><button type="button" className={s.button} disabled={busy} onClick={onCancel}>Vazgeç</button></div>
  </form>;
}
