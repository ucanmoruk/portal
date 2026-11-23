import { z } from "zod";

export const CRM_STATUSES = ["Yeni", "Firma arandı", "Mail atıldı", "Görüşüldü", "Ulaşılamadı", "Cevap bekleniyor", "Tekrar aranacak", "İşe dönüştü", "İlgilenmiyor"] as const;
export const CRM_PERMISSIONS = ["Belirtilmedi", "Onaylı", "Tacir / esnaf", "Ret"] as const;
export const CrmContactFields = z.object({ email: z.string().trim().email().max(320), name: z.string().trim().max(200).default(""), role: z.string().trim().max(100).default("") });
export type CrmContact = z.infer<typeof CrmContactFields>;
export const CompanyFields = z.object({
  name: z.string().trim().min(1).max(300), contact: z.string().trim().max(200).default(""),
  email: z.union([z.literal(""), z.string().trim().email().max(320)]).default(""),
  phone: z.string().trim().max(100).default(""), address: z.string().trim().max(2000).default(""),
  taxNumber: z.string().trim().max(30).default(""), permission: z.enum(CRM_PERMISSIONS).default("Belirtilmedi"),
  permissionNote: z.string().trim().max(2000).default(""),
  emailRole: z.string().trim().max(100).default(""), contacts: z.array(CrmContactFields).max(19).default([]),
}).superRefine((company, context) => {
  if (!company.email && company.contacts.length) context.addIssue({ code: "custom", path: ["email"], message: "Ek adresler için önce bir ana e-posta belirleyin." });
  const seen = new Set(company.email ? [company.email.toLowerCase()] : []);
  company.contacts.forEach((contact, index) => {
    const key = contact.email.toLowerCase();
    if (seen.has(key)) context.addIssue({ code: "custom", path: ["contacts", index, "email"], message: "Aynı e-posta adresi tekrar eklenemez." });
    seen.add(key);
  });
});
export type CrmCompany = z.infer<typeof CompanyFields> & { customerId: number | null; source: "Manuel" | "İçe aktarma" | "Müşteri listesi"; conversion?: "Hazırlanıyor" | "Kontrol gerekli" };
export type CrmList = { name: string; description: string; companyIds: string[] };
export type CrmTemplate = { name: string; subject: string; body: string; format?: "text" | "html" };
export type CrmActivity = { at: string; by: string; status: string; note: string };
export type CrmMember = { companyId: string; status: typeof CRM_STATUSES[number]; note: string; nextContact: string; history: CrmActivity[] };
export type CrmCampaign = { name: string; listId: string; templateId: string; subject: string; body: string; format?: "text" | "html"; state: "Taslak" | "Devam ediyor" | "Duraklatıldı" | "Tamamlandı"; members: CrmMember[] };
export const CRM_MAIL_STATES = ["Taslak", "Gönderiliyor", "Gönderildi", "Hata", "Belirsiz"] as const;
export type CrmMailState = typeof CRM_MAIL_STATES[number];
export type CrmMail = {
  name: string; companyId: string; companyVersion: number; companyName: string; to: string; toName?: string; toRole?: string;
  subject: string; body: string; format: "text" | "html"; html: string; renderedSubject: string;
  state: CrmMailState; from: string; startedAt: string | null; sentAt: string | null;
  messageId: string; error: string; history: { at: string; by: string; state: CrmMailState; note: string }[];
};
export type CrmPayload = (CrmCompany | CrmList | CrmTemplate | CrmCampaign | CrmMail) & { _deleted?: { at: string; by: string } };
export type CrmKind = "company" | "list" | "template" | "campaign" | "mail";
export type CrmRecord<T = CrmPayload> = { id: string; kind: CrmKind; version: number; updatedBy: string; updatedAt: string; deletedAt?: string; data: T };
export type CrmData = { companies: CrmRecord<CrmCompany>[]; lists: CrmRecord<CrmList>[]; templates: CrmRecord<CrmTemplate>[]; campaigns: CrmRecord<CrmCampaign>[]; deleted?: CrmRecord[] };
export function renderCrmTemplate(text: string, company: CrmCompany) {
  return text.replace(/\{\{(firma|yetkili)\}\}/g, (_, key: string) => key === "firma" ? company.name : company.contact || "Yetkili");
}
export function campaignProgress(campaign: CrmCampaign) {
  const contacted = campaign.members.filter(m => m.status !== "Yeni").length;
  return { contacted, total: campaign.members.length, percent: campaign.members.length ? Math.round(100 * contacted / campaign.members.length) : 0 };
}
export function companyDuplicate(a: CrmCompany, b: CrmCompany) {
  const addresses = new Set(crmCompanyContacts(a).map(c => c.email.toLowerCase()));
  return Boolean((a.customerId && a.customerId === b.customerId) || (a.taxNumber && a.taxNumber === b.taxNumber) || crmCompanyContacts(b).some(c => addresses.has(c.email.toLowerCase())) || a.name.toLocaleLowerCase("tr-TR") === b.name.toLocaleLowerCase("tr-TR"));
}
/** Includes old records whose primary email contains comma/semicolon-separated addresses. */
export function crmCompanyContacts(company: Pick<CrmCompany, "email" | "contact"> & Partial<Pick<CrmCompany, "contacts" | "emailRole">>): CrmContact[] {
  const contacts: CrmContact[] = [], seen = new Set<string>();
  for (const item of [...company.email.split(/[;,\r\n]+/).map((email, index) => ({ email: email.trim(), name: index === 0 ? company.contact || "" : "", role: index === 0 ? company.emailRole || "" : "" })), ...(company.contacts || [])]) {
    if (!z.string().email().safeParse(item.email).success) continue;
    const key = item.email.toLowerCase();
    if (!seen.has(key)) { contacts.push({ ...item }); seen.add(key); }
  }
  return contacts;
}
/** Splits imported values; CompanyFields validates every resulting address. */
export function crmLegacyContacts(value: string, contact = "") {
  const unique = new Map<string, string>();
  value.split(/[;,\r\n]+/).map(v => v.trim()).filter(Boolean).forEach(email => { if (!unique.has(email.toLowerCase())) unique.set(email.toLowerCase(), email); });
  const entries = [...unique.values()].map((email, index) => ({ email, name: index === 0 ? contact : "", role: "" }));
  return { email: entries[0]?.email || "", contact, contacts: entries.slice(1) };
}
