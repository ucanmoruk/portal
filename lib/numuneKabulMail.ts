import { cosmoPool } from "@/lib/db";
import type { KabulMailData, KabulMailRow } from "@/lib/numuneKabulMailTemplate";
export { buildKabulMail, KABUL_MAIL_MESAJ } from "@/lib/numuneKabulMailTemplate";
export type { KabulMailData, KabulMailRow } from "@/lib/numuneKabulMailTemplate";
export function kabulMailDate(value: unknown): string {
  if (!value || String(value).startsWith("0000-")) return "Belirtilmedi";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}.${match[2]}.${match[1]}`;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "Belirtilmedi" : date.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
}
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
