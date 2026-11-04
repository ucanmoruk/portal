import { z } from "zod";

export const CrmAnalysis = z.object({
  answer: z.string().max(12000),
  offer: z.object({
    recipient: z.string().max(255), email: z.string().max(320), subject: z.string().max(500),
    replySubject: z.string().max(500).default(""), replyBody: z.string().max(16000).default(""),
    warnings: z.array(z.string().max(500)).max(30),
    items: z.array(z.object({ serviceId: z.number().int().positive(), quantity: z.number().int().min(1).max(100000), products: z.array(z.string().max(200)).max(30).default([]) })).max(100),
    packages: z.array(z.object({ packageId: z.number().int().positive(), quantity: z.number().int().min(1).max(100000), products: z.array(z.string().max(200)).max(30).default([]) })).max(30).default([]),
  }).nullable(),
});
export type CrmOffer = {
  savedId?: number | null;
  replySubject?: string; replyBody?: string;
  recipient: string; email: string; subject: string; warnings: string[];
  items: { serviceId: number; name: string; quantity: number; price: number; currency: string; method: string; accreditation: string; products?: string[]; packageGroup?: string | null; packageTitle?: string | null; duration?: string; sampleRequirement?: string }[];
};
export const CrmOfferEdit = z.object({
  recipient: z.string().trim().max(255), email: z.string().trim().max(320), subject: z.string().trim().max(500),
  replySubject: z.string().trim().max(500).optional(), replyBody: z.string().trim().max(16000).optional(),
  warnings: z.array(z.string().max(500)).max(130), savedId: z.number().int().positive().nullable().optional(),
  items: z.array(z.object({ serviceId: z.number().int().positive(), name: z.string().max(500), quantity: z.number().int().min(1).max(100000), price: z.number().min(0).max(1000000000), currency: z.string().min(1).max(10), method: z.string().max(500), accreditation: z.string().max(100), products: z.array(z.string().max(200)).max(30).optional(), packageGroup: z.string().max(64).nullable().optional(), packageTitle: z.string().max(300).nullable().optional(), duration: z.string().max(500).optional(), sampleRequirement: z.string().max(1000).optional() })).max(300),
});
export type CrmService = { ID: number; Ad: string; Fiyat: number | null; ParaBirimi: string | null; Metot: string; Akreditasyon: string; Sure?: string | null; NumGereklilik?: string | null };
export type CrmPackage = { ID: number; Ad: string; serviceIds: number[] };
export const crmCurrency = (value: string | null) => ({ "₺": "TRY", "TL": "TRY", "$": "USD", "€": "EUR" }[value || ""] || value || "TRY");

// Only catalog values can supply initial prices, names and currencies.
export function hydrateCrmOffer(offer: NonNullable<z.infer<typeof CrmAnalysis>["offer"]>, services: CrmService[], packages: CrmPackage[] = []): CrmOffer {
  const warnings = [...offer.warnings];
  const items: CrmOffer["items"] = [];
  for (const item of offer.items) {
    const service = services.find(s => Number(s.ID) === item.serviceId);
    if (!service || service.Fiyat == null || !Number.isFinite(Number(service.Fiyat)) || Number(service.Fiyat) < 0) {
      warnings.push("Bir hizmet veya liste fiyatı bulunamadı; ilgili kalem eklenmedi.");
      continue;
    }
    items.push({ serviceId: Number(service.ID), name: service.Ad, quantity: item.quantity, price: Number(service.Fiyat), currency: crmCurrency(service.ParaBirimi), method: service.Metot || "", accreditation: service.Akreditasyon || "", ...(item.products?.length ? { products: item.products } : {}), ...(service.Sure ? { duration: String(service.Sure) } : {}), ...(service.NumGereklilik ? { sampleRequirement: service.NumGereklilik } : {}) });
  }
  for (const [index, selected] of (offer.packages || []).entries()) {
    const pack = packages.find(item => Number(item.ID) === selected.packageId);
    const members = pack?.serviceIds.map(id => services.find(service => Number(service.ID) === id));
    if (!pack || !members?.length || members.some(service => !service || service.Fiyat == null || !Number.isFinite(Number(service.Fiyat)) || Number(service.Fiyat) < 0)) {
      warnings.push(`Paket #${selected.packageId} veya paket içindeki bir hizmetin fiyatı bulunamadı; paket eksik fiyatla eklenmedi.`);
      continue;
    }
    for (const service of members as CrmService[]) {
      items.push({ serviceId: Number(service.ID), name: service.Ad, quantity: selected.quantity, price: Number(service.Fiyat), currency: crmCurrency(service.ParaBirimi), method: service.Metot || "", accreditation: service.Akreditasyon || "", products: selected.products || [], packageGroup: `crm-package-${pack.ID}-${index}`, packageTitle: pack.Ad, duration: String(service.Sure || ""), sampleRequirement: service.NumGereklilik || "" });
    }
  }
  return { ...offer, warnings, items };
}
