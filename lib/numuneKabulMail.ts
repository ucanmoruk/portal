import { cosmoPool } from "@/lib/db";

export const KABUL_MAIL_MESAJ = "Laboratuvarımıza ilettiğiniz numunelerin kabul işlemleri tamamlanmıştır. Numuneleriniz ve gerçekleştirilecek analizlere ilişkin bilgiler aşağıda yer almaktadır.";
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export function kabulMailDate(value: unknown): string {
  if (!value || String(value).startsWith("0000-")) return "Belirtilmedi";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}.${match[2]}.${match[1]}`;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "Belirtilmedi" : date.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
}
export interface KabulMailRow { id: number; evrakNo: string; kabulTarihi: string; urunAdi: string; test: string; termin: string }
export interface KabulMailData { firmaAd: string; email: string; konu: string; rows: KabulMailRow[] }
export async function loadKabulMailData(ids: number[]): Promise<KabulMailData> {
  const pool = await cosmoPool;
  const req = pool.request();
  const placeholders = ids.map((id, i) => { req.input(`id${i}`, id); return `@id${i}`; }).join(",");
  const samples = (await req.query(`
    SELECT n.ID,n.Evrak_No,n.Tarih,n.Numune_Adi,n.Firma_ID,f.Firma_Adi,f.Mail
    FROM NKR n LEFT JOIN Firma f ON f.ID=n.Firma_ID
    WHERE n.Durum='Aktif' AND n.ID IN (${placeholders}) ORDER BY n.Tarih,n.ID
  `)).recordset;
  if (samples.length !== ids.length) throw new Error("Seçili numunelerden bazıları bulunamadı. Listeyi yenileyin.");
  if (!samples[0]?.Firma_ID || new Set(samples.map(n => Number(n.Firma_ID))).size !== 1) throw new Error("Bilgi maili için aynı müşteriye ait numuneleri seçin.");
  const testsReq = pool.request();
  ids.forEach((id, i) => testsReq.input(`id${i}`, id));
  const tests = (await testsReq.query(`
    SELECT x.RaporID,ISNULL(s.Ad,'Test adı belirtilmedi') AS TestAdi,CONVERT(varchar(10),x.Termin,23) AS Termin
    FROM NumuneX1 x LEFT JOIN StokAnalizListesi s ON s.ID=x.AnalizID
    WHERE x.RaporID IN (${placeholders}) ORDER BY x.RaporID,x.ID
  `)).recordset;
  const rows: KabulMailRow[] = [];
  for (const n of samples) {
    const services = tests.filter(t => Number(t.RaporID) === Number(n.ID));
    for (const t of services.length ? services : [{ TestAdi: "Test tanımlanmamış", Termin: null }]) {
      rows.push({ id: n.ID, evrakNo: String(n.Evrak_No ?? ""), kabulTarihi: kabulMailDate(n.Tarih), urunAdi: n.Numune_Adi || "—", test: t.TestAdi, termin: kabulMailDate(t.Termin) });
    }
  }
  return { firmaAd: samples[0].Firma_Adi || "Müşterimiz", email: samples[0].Mail || "", konu: `Numune Kabul Bilgilendirmesi – Evrak No: ${[...new Set(samples.map(n => n.Evrak_No))].join(", ")}`, rows };
}
export function buildKabulMail(data: KabulMailData, mesaj = KABUL_MAIL_MESAJ) {
  const headings = ["Evrak No", "Kabul Tarihi", "Ürün Adı", "Yapılacak Test", "Planlanan Termin Tarihi"];
  const cells = data.rows.map(r => [r.evrakNo, r.kabulTarihi, r.urunAdi, r.test, r.termin]);
  const footer = "Termin tarihleri analizlerin tamamlanması için planlanan tarihlerdir. Süreyi etkileyebilecek bir durum oluşması hâlinde tarafınıza ayrıca bilgi verilecektir.";
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#242424;max-width:1000px;margin:auto"><h2 style="color:#17495b">UNIQUE Analyse</h2><p>Sayın ${escapeHtml(data.firmaAd)} Yetkilisi,</p><p>${escapeHtml(mesaj).replace(/\n/g,"<br>")}</p><table style="width:100%;border-collapse:collapse;table-layout:fixed"><thead><tr>${headings.map(h => `<th style="border:1px solid #d9e1e5;background:#edf3f5;padding:10px;text-align:left">${h}</th>`).join("")}</tr></thead><tbody>${cells.map(row => `<tr>${row.map(c => `<td style="border:1px solid #d9e1e5;padding:9px;vertical-align:top;overflow-wrap:anywhere">${escapeHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table><p>${footer}</p><p>Sorularınız için bu e-postaya yanıt vererek bizimle iletişime geçebilirsiniz.</p><p>Saygılarımızla,<br><strong>UNIQUE Analyse</strong></p></div>`;
  const text = `Sayın ${data.firmaAd} Yetkilisi,\n\n${mesaj}\n\n${headings.join(" | ")}\n${cells.map(r=>r.join(" | ")).join("\n")}\n\n${footer}\n\nSaygılarımızla,\nUNIQUE Analyse`;
  return { html, text };
}
