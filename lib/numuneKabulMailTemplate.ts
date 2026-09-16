import { laboratoryMailBrand, renderLaboratoryMail, escapeMailHtml, type LaboratoryMailBrand } from "@/lib/laboratuvarMailTemplate";
export const KABUL_MAIL_MESAJ = "Laboratuvarımıza ilettiğiniz numunelerin kabul işlemleri tamamlanmıştır. Numuneleriniz ve gerçekleştirilecek analizlere ilişkin bilgiler aşağıda yer almaktadır.";
export interface KabulMailRow { id: number; evrakNo: string; kabulTarihi: string; urunAdi: string; test: string; termin: string }
export interface KabulMailData { firmaAd: string; email: string; konu: string; rows: KabulMailRow[] }
export function buildKabulMail(data: KabulMailData, mesaj = KABUL_MAIL_MESAJ, brand: LaboratoryMailBrand = laboratoryMailBrand(), logoSrc = "cid:unique-logo") {
  const headings = ["Evrak No", "Kabul Tarihi", "Ürün Adı", "Yapılacak Test", "Planlanan Termin Tarihi"];
  const cells = data.rows.map(r => [r.evrakNo, r.kabulTarihi, r.urunAdi, r.test, r.termin]);
  const footer = "Termin tarihleri analizlerin tamamlanması için planlanan tarihlerdir. Süreyi etkileyebilecek bir durum oluşması hâlinde tarafınıza ayrıca bilgi verilecektir.";
  const html = renderLaboratoryMail({ brand, title: "Numune Kabul Bilgilendirmesi", message: mesaj, intro: `Sayın ${data.firmaAd} Yetkilisi, numune ve analiz bilgileriniz aşağıda yer almaktadır:`, headings, rows: cells, note: escapeMailHtml(footer), logoSrc });
  const text = `Sayın ${data.firmaAd} Yetkilisi,\n\n${mesaj}\n\n${headings.join(" | ")}\n${cells.map(r=>r.join(" | ")).join("\n")}\n\n${footer}\n\nSaygılarımızla,\n${brand.name}`;
  return { html, text };
}
