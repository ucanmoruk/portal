import { cosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";
import type { CrmOffer } from "@/lib/crmOffer";

let ready: Promise<unknown> | null = null;
export async function crmDraftPool() {
  const pool = await cosmoPool;
  if (!ready) ready = pool.request().query(hasMysqlConfig()
    ? `CREATE TABLE IF NOT EXISTS CrmOfferDraft (ID INT AUTO_INCREMENT PRIMARY KEY, OwnerKey VARCHAR(255) NOT NULL, Payload LONGTEXT NOT NULL, CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) CHARACTER SET utf8mb4`
    : `IF OBJECT_ID('CrmOfferDraft','U') IS NULL CREATE TABLE CrmOfferDraft (ID INT IDENTITY(1,1) PRIMARY KEY, OwnerKey NVARCHAR(255) NOT NULL, Payload NVARCHAR(MAX) NOT NULL, CreatedAt DATETIME NOT NULL DEFAULT GETDATE())`
  ).catch(error => { ready = null; throw error; });
  await ready;
  return pool;
}
export async function createCrmDraft(owner: string, offer: CrmOffer) {
  const pool = await crmDraftPool();
  const result = await pool.request().input("Owner", owner).input("Payload", JSON.stringify(offer))
    .query("INSERT INTO CrmOfferDraft (OwnerKey,Payload) OUTPUT INSERTED.ID VALUES (@Owner,@Payload)");
  return Number(result.recordset[0].ID);
}
