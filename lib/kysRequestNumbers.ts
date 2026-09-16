/* eslint-disable @typescript-eslint/no-explicit-any */
import { hasMysqlConfig } from "@/lib/mysqlCompat";
let ready: Promise<void> | null = null;
export function requestYear(value: unknown): number {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error("Talep tarihi geçersiz.");
  return Number(date.toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul", year: "numeric" }));
}
async function lockCounter(tx: any, year: number) {
  await tx.request().input("Y", year).query(hasMysqlConfig()
    ? "INSERT IGNORE INTO KysTalepSayac (Yil,SonNo,Hazir) VALUES (@Y,1000,0)"
    : "IF NOT EXISTS(SELECT 1 FROM KysTalepSayac WITH (UPDLOCK,HOLDLOCK) WHERE Yil=@Y) INSERT INTO KysTalepSayac (Yil,SonNo,Hazir) VALUES (@Y,1000,0)");
  return (await tx.request().input("Y", year).query(hasMysqlConfig()
    ? "SELECT SonNo,Hazir FROM KysTalepSayac WHERE Yil=@Y FOR UPDATE"
    : "SELECT SonNo,Hazir FROM KysTalepSayac WITH (UPDLOCK,HOLDLOCK) WHERE Yil=@Y")).recordset[0];
}
// First use converts existing random numbers in creation order. The durable counter
// retains its high water mark after deletion, and serializes concurrent creates.
export function ensureKysRequestNumbers(base: any): Promise<void> {
  if (!ready) ready = (async () => {
    await base.request().query(hasMysqlConfig()
      ? "CREATE TABLE IF NOT EXISTS KysTalepSayac (Yil INT PRIMARY KEY,SonNo INT NOT NULL,Hazir INT NOT NULL DEFAULT 0)"
      : "IF OBJECT_ID('KysTalepSayac','U') IS NULL CREATE TABLE KysTalepSayac (Yil INT PRIMARY KEY,SonNo INT NOT NULL,Hazir INT NOT NULL DEFAULT 0)");
    const records = (await base.request().query("SELECT ID,OlusturmaTarihi FROM KysTalep ORDER BY OlusturmaTarihi,ID")).recordset;
    const years = [...new Set<number>([requestYear(new Date()), ...records.map((r: any) => requestYear(r.OlusturmaTarihi))])].sort();
    for (const year of years) {
      const tx = await base.transaction(); await tx.begin();
      try {
        const counter = await lockCounter(tx, year);
        if (!Number(counter.Hazir)) {
          const current = (await tx.request().query("SELECT ID,OlusturmaTarihi FROM KysTalep ORDER BY OlusturmaTarihi,ID")).recordset.filter((r: any) => requestYear(r.OlusturmaTarihi) === year);
          for (const row of current) await tx.request().input("ID", row.ID).input("No", "MIG-" + year + "-" + row.ID).query("UPDATE KysTalep SET TalepNo=@No WHERE ID=@ID");
          let number = 1000;
          for (const row of current) await tx.request().input("ID", row.ID).input("No", year + "-" + (++number)).query("UPDATE KysTalep SET TalepNo=@No WHERE ID=@ID");
          await tx.request().input("Y", year).input("N", number).query("UPDATE KysTalepSayac SET SonNo=@N,Hazir=1 WHERE Yil=@Y");
        }
        await tx.commit();
      } catch (e) { await tx.rollback(); throw e; }
    }
  })().catch(e => { ready = null; throw e; });
  return ready;
}
export async function nextKysRequestNumber(tx: any, year = requestYear(new Date())): Promise<string> {
  const counter = await lockCounter(tx, year);
  const number = Math.max(1000, Number(counter.SonNo)) + 1;
  await tx.request().input("Y", year).input("N", number).query("UPDATE KysTalepSayac SET SonNo=@N,Hazir=1 WHERE Yil=@Y");
  return year + "-" + number;
}
