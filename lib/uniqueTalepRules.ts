import { z } from "zod";
import type { CrmOffer } from "./crmOffer";

export const UNIQUE_STATUSES = ["Bekliyor", "Teklif Gönderildi", "Onaylandı", "Uygun Değil", "Ret"] as const;
export const UNIQUE_CATEGORIES = ["Fiyat Teklifi", "Analiz Talebi", "Bilgi Talebi", "Diğer"] as const;
export type UniqueMailLog = {
  startedAt: string; completedAt?: string; by: string; to: string; cc: string;
  subject: string; attachment: string; state: "Gönderiliyor" | "Gönderildi" | "Belirsiz";
  messageId?: string; accepted?: string[]; rejected?: string[]; response?: string; errorCode?: string;
};
export type UniqueRequest = {
  id: number; version: number; source: string; date: string; name: string; email: string;
  messageId: string; subject: string; text: string; category: typeof UNIQUE_CATEGORIES[number];
  potential: boolean; reason: string; status: typeof UNIQUE_STATUSES[number];
  companyId: number | null; companyName: string; offer: CrmOffer | null; quoteId: number | null;
  mailState: "Taslak" | "Hazırlanıyor" | "Gönderiliyor" | "Gönderildi" | "Belirsiz";
  sentAt: string | null; sentMessageId: string; error: string;
  mailLog?: UniqueMailLog[];
  deletedAt?: string | null; deletedBy?: string;
  createdBy?: string;
};
export const UniqueManualCreate = z.object({
  action: z.literal("manual"), requestId: z.string().uuid(),
  companyName: z.string().trim().min(1).max(300), name: z.string().trim().max(200).default(""),
  companyId: z.number().int().positive().nullable().optional().default(null),
  email: z.string().trim().email().max(320), subject: z.string().trim().min(1).max(500).refine(value => !/[\r\n]/.test(value)),
  text: z.string().trim().min(1).max(12000), category: z.enum(UNIQUE_CATEGORIES).default("Fiyat Teklifi"),
}).strict();
export const uniqueEdit = z.object({
  version: z.number().int().positive(),
  status: z.enum(UNIQUE_STATUSES).optional(), category: z.enum(UNIQUE_CATEGORIES).optional(),
  potential: z.boolean().optional(), companyId: z.number().int().positive().nullable().optional(),
});
export const normalizeUniqueStatus = (status: string): UniqueRequest["status"] => status === "Teklif İletildi" ? "Teklif Gönderildi" : status as UniqueRequest["status"];
export const newestUniqueFirst = (a: Pick<UniqueRequest, "date" | "id">, b: Pick<UniqueRequest, "date" | "id">) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0) || b.id - a.id;
export function classifyUniqueMail(subject: string, text: string, sender: string) {
  const value = `${subject}\n${text}`.toLocaleLowerCase("tr");
  const auto = /^(mailer-daemon|postmaster|no-?reply|notifications?)@/i.test(sender)
    || /unsubscribe|abonelikten çık|bülten aboneli|delivery status notification|undelivered mail/.test(value);
  const lab = /analiz|laboratuvar|kozmetik|mikrobiy|stabilite|challenge|güvenlilik|safety assessment|laboratory|testing|analysis|cosmetic|numune/.test(value);
  const price = /fiyat|teklif|ücret|quotation|quote|pricing|price|cost/.test(value);
  const request = /rica|istiyor|talep|bilgi|yapıyor musunuz|yapabilir|request|please|could you|can you|need|would like/.test(value);
  const potential = !auto && ((lab && (price || request)) || /fiyat teklifi|request for quotation/.test(value));
  const category = !potential ? "Diğer" : price ? "Fiyat Teklifi" : /analiz|test|numune/.test(value) ? "Analiz Talebi" : "Bilgi Talebi";
  return { potential, category: category as UniqueRequest["category"], reason: auto ? "Otomatik bildirim / toplu gönderim işaretleri." : potential ? "Laboratuvar hizmeti veya fiyat talebi içeriyor." : "Müşteri talebi işaretleri bulunamadı; elle incelemeye açık." };
}
