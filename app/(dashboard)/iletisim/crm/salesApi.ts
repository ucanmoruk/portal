import type { CrmCompany, CrmMail, CrmRecord, CrmTemplate } from "@/lib/crmRules";
import type { CrmNote, CrmOutreach, CrmReply } from "@/lib/crmSales";
export type SalesData = {
  companies: CrmRecord<CrmCompany>[]; templates: CrmRecord<CrmTemplate>[]; signatureHtml: string; mails: CrmRecord<CrmMail>[]; notes: CrmRecord<CrmNote>[]; replies: CrmRecord<CrmReply>[]; outreaches: CrmRecord<CrmOutreach>[];
  stats: Record<string, { sent: number; touches: number; replies: number; lastSentAt: string | null }>;
  aiReady: boolean; aiProvider: string; sender: string; canManageAi: boolean; canSend: boolean; canUseCustomers: boolean; canMatchReplies: boolean;
};
export async function salesApi<T = SalesData>(path = "/api/crm/sales", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { cache: "no-store", signal, ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "İşlem tamamlanamadı.");
  return result as T;
}
export const salesDate = (date?: string | null) => date ? new Date(date).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "medium", timeStyle: "short" }) : "—";
