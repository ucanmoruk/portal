import { z } from "zod";

export const SPEKTROTEK_TALEP_DURUMLAR=["Bekliyor","Teklif Gönderildi"] as const;
export type SpektrotekTalepDurum=typeof SPEKTROTEK_TALEP_DURUMLAR[number];
const fields={
  tarih:z.string().datetime({offset:true}),
  musteriAdi:z.string().trim().min(1).max(300),
  kisiAdi:z.string().trim().max(200).optional().default(""),
  email:z.string().trim().email().max(320),
  talep:z.string().trim().min(1).max(300),
  ozet:z.string().trim().max(1000).optional().default(""),
  konu:z.string().trim().max(500).optional().default(""),
  hesap:z.string().trim().min(1).max(100),
  skor:z.number().int().min(0).max(100).nullable().optional().default(null),
};
export const SpektrotekTalepBatch=z.object({talepler:z.array(z.object({kaynakId:z.string().regex(/^mailbot:\d{1,12}$/),...fields}).strict()).min(1).max(100)}).strict();
export const SpektrotekTalepCreate=z.object({...fields,durum:z.enum(SPEKTROTEK_TALEP_DURUMLAR).optional().default("Bekliyor")}).strict();
export const SpektrotekTalepEdit=z.object({...fields,durum:z.enum(SPEKTROTEK_TALEP_DURUMLAR),surum:z.number().int().positive()}).strict();
export const SpektrotekTalepStatus=z.object({durum:z.enum(SPEKTROTEK_TALEP_DURUMLAR),surum:z.number().int().positive()}).strict();
export type GelenSpektrotekTalep=z.infer<typeof SpektrotekTalepBatch>["talepler"][number];
export type SpektrotekTalep={id:number;kaynakId:string;tarih:string;musteriAdi:string;kisiAdi:string;email:string;talep:string;ozet:string;konu:string;hesap:string;skor:number|null;durum:SpektrotekTalepDurum;durumTarihi:string|null;durumKullanici:string;surum:number};
export type SpektrotekTalepList={items:SpektrotekTalep[];total:number;page:number;limit:number;accounts:string[];summary:{total:number;pending:number;offered:number;manual:number}};
