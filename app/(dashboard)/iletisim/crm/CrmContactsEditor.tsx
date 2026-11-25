"use client";

import { Plus, Trash2 } from "lucide-react";
import type { CrmCompany } from "@/lib/crmRules";
import styles from "../spektrotek-talep/requests.module.css";
import ui from "./crm.module.css";

type Props = { value: CrmCompany; disabled: boolean; onChange: (value: CrmCompany) => void };
export default function CrmContactsEditor({ value, disabled, onChange }: Props) {
  const contacts = value.contacts || [];
  function setPrimary(index: number) {
    const chosen = contacts[index], remaining = contacts.filter((_, i) => i !== index);
    if (value.email) remaining.splice(index, 0, { email: value.email, name: value.contact, role: value.emailRole || "" });
    onChange({ ...value, email: chosen.email, contact: chosen.name, emailRole: chosen.role, contacts: remaining });
  }
  return <section className={`${ui.contactEditor} ${styles.wide}`} aria-label="Firma e-posta kişileri">
    <div className={styles.actions}><h2>E-posta adresleri ve kişiler</h2><button type="button" className={styles.button} disabled={disabled || contacts.length >= 19} onClick={() => onChange({ ...value, contacts: [...contacts, { email: "", name: "", role: "" }] })}><Plus size={14} />E-posta ekle</button></div>
    <div className={ui.contactCard}><div className={ui.contactHeading}><span className={ui.tag}>Ana e-posta</span></div><div className={ui.contactFields}>
      <label>Yetkili<input maxLength={200} value={value.contact} disabled={disabled} onChange={e => onChange({ ...value, contact: e.target.value })} /></label>
      <label>Görev / bölüm<input maxLength={100} value={value.emailRole || ""} disabled={disabled} onChange={e => onChange({ ...value, emailRole: e.target.value })} /></label>
      <label>E-posta<input type="email" maxLength={320} value={value.email} disabled={disabled} onChange={e => onChange({ ...value, email: e.target.value })} /></label>
    </div></div>
    {contacts.map((contact, index) => <div className={ui.contactCard} key={index}><div className={ui.contactHeading}><button type="button" className={styles.button} aria-label={`${index + 2}. adresi ana e-posta yap`} disabled={disabled || !contact.email} onClick={() => setPrimary(index)}>Ana e-posta yap</button><button type="button" className={`${styles.icon} ${ui.deleteButton}`} aria-label={`${index + 2}. e-posta adresini kaldır`} disabled={disabled} onClick={() => onChange({ ...value, contacts: contacts.filter((_, i) => i !== index) })}><Trash2 size={14} /></button></div><div className={ui.contactFields}>
      <label>Kişi adı {index + 2}<input maxLength={200} value={contact.name} disabled={disabled} onChange={e => onChange({ ...value, contacts: contacts.map((c, i) => i === index ? { ...c, name: e.target.value } : c) })} /></label>
      <label>Görev / bölüm {index + 2}<input maxLength={100} value={contact.role} disabled={disabled} onChange={e => onChange({ ...value, contacts: contacts.map((c, i) => i === index ? { ...c, role: e.target.value } : c) })} /></label>
      <label>E-posta {index + 2}<input required type="email" maxLength={320} value={contact.email} disabled={disabled} onChange={e => onChange({ ...value, contacts: contacts.map((c, i) => i === index ? { ...c, email: e.target.value } : c) })} /></label>
    </div></div>)}
    <p className={styles.muted}>En fazla 20 kişi. E-posta adresi olan kişiler gönderim kontrolünde listelenir.</p>
  </section>;
}
