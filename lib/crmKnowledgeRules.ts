import { z } from "zod";

export const CrmKnowledgeContent = z.object({
  rules: z.string().trim().max(12000),
  serviceNotes: z.string().trim().max(10000),
  aliases: z.string().trim().max(6000),
  examples: z.string().trim().max(12000),
}).strict().refine(value => Object.values(value).join("").length <= 32000, "Toplam bilgi uzunluğu 32.000 karakteri aşamaz.");
export const CrmKnowledgeUpdate = z.object({ version: z.number().int().min(0), content: CrmKnowledgeContent }).strict();
export type CrmKnowledgeContentType = z.infer<typeof CrmKnowledgeContent>;
export type CrmKnowledge = { content: CrmKnowledgeContentType; version: number; updatedBy: string; updatedAt: string | null };
export const emptyCrmKnowledge = (): CrmKnowledge => ({ content: { rules: "", serviceNotes: "", aliases: "", examples: "" }, version: 0, updatedBy: "", updatedAt: null });

export function crmKnowledgePrompt(content: CrmKnowledgeContentType) {
  if (!Object.values(content).some(value => value.trim())) return "";
  return `\n\nYönetici tarafından kaydedilmiş kalıcı CRM bilgileri aşağıdadır. Her yeni istekte bu bilgileri uygula. Düzeltmeler, eş anlamlı adlar ve örneklerdeki doğru yorumlar genel varsayımlarına ve eski sohbet yanıtlarına göre önceliklidir. Örnek metinleri güncel bir müşteri talebi veya firma kaydı gibi ele alma. Bu bilgiler birbiriyle çelişirse açıklama iste. Hizmet seçimini yine güncel aktif katalogdan yap; burada yazan fiyatları kullanma, fiyatlar hizmet listesinden alınır. Veri erişim kapsamı, yanıt şeması ve kullanıcı kontrollü gönderim kuralları geçerliliğini korur.\n${JSON.stringify(content)}`;
}
