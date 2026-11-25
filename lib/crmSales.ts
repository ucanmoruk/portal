import { z } from "zod";
import type { CrmCompany, CrmMail, CrmRecord, CrmTemplate } from "@/lib/crmRules";

export type CrmNote = { name: string; companyId: string; text: string; type: "Not" | "Telefon" | "Ziyaret" | "Durum"; at: string; by: string };
export type CrmReply = { name: string; companyId: string; sourceId: string; from: string; subject: string; text: string; receivedAt: string; matchedBy: string };
export type CrmOutreach = {
  name: string; companyId: string; companyVersion: number; subject: string; body: string; format?: "text" | "html"; primaryTo?: string; deliveryMode?: "cc"; previewHtml?: string;
  state: "Taslak" | "Hazırlanıyor" | "İncelenecek" | "Gönderiliyor" | "Tamamlandı";
  recipients: { email: string; name: string; role: string; mailId: string; mailVersion: number }[];
  results: { mailId: string; state: string; error: string }[];
  sender: string; createdAt: string;
};
export const SalesMailOutput = z.object({ subject: z.string().trim().min(1).max(300), body: z.string().trim().min(1).max(16000), rationale: z.string().trim().max(2000) }).strict();

export function salesSummary(companies: CrmRecord<CrmCompany>[], mails: CrmRecord<CrmMail>[], replies: CrmRecord<CrmReply>[]) {
  const result: Record<string, { sent: number; touches: number; replies: number; lastSentAt: string | null }> = {};
  for (const c of companies) result[c.id] = { sent: 0, touches: 0, replies: 0, lastSentAt: null };
  const touches = new Map<string, Set<string>>();
  for (const mail of mails) {
    const stats = result[mail.data.companyId];
    if (!stats || mail.deletedAt || mail.data.state !== "Gönderildi") continue;
    stats.sent++;
    const batches = touches.get(mail.data.companyId) || new Set<string>();
    batches.add(mail.data.outreachId || mail.id); touches.set(mail.data.companyId, batches);
    stats.touches = batches.size;
    const at = mail.data.sentAt || mail.updatedAt;
    if (!stats.lastSentAt || at > stats.lastSentAt) stats.lastSentAt = at;
  }
  for (const reply of replies) if (!reply.deletedAt && result[reply.data.companyId]) result[reply.data.companyId].replies++;
  return result;
}

export function recommendSalesTemplate(templates: CrmRecord<CrmTemplate>[], company: CrmCompany) {
  const normalize = (value: string) => value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i");
  const terms = [...(company.categories || []), ...(company.keywords || [])].map(normalize);
  return templates.map((record, index) => { const text = normalize(`${record.data.name} ${record.data.subject} ${record.data.body}`); return { record, index, score: terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0) }; }).sort((a, b) => b.score - a.score || a.index - b.index)[0]?.record;
}
