import { cosmoPool } from "./db";
import { hasMysqlConfig } from "./mysqlCompat";
import type { UniqueRequest } from "./uniqueTalepRules";

let ready: Promise<unknown> | null = null;
export async function uniquePool() {
  const pool = await cosmoPool;
  if (!ready) ready = pool.request().query(hasMysqlConfig()
    ? `CREATE TABLE IF NOT EXISTS UniqueTalep (ID INT AUTO_INCREMENT PRIMARY KEY, SourceKey VARCHAR(64) NOT NULL UNIQUE, Payload LONGTEXT NOT NULL, Version INT NOT NULL DEFAULT 1, CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) CHARACTER SET utf8mb4`
    : `IF OBJECT_ID('UniqueTalep','U') IS NULL CREATE TABLE UniqueTalep (ID INT IDENTITY(1,1) PRIMARY KEY, SourceKey VARCHAR(64) NOT NULL UNIQUE, Payload NVARCHAR(MAX) NOT NULL, Version INT NOT NULL DEFAULT 1, CreatedAt DATETIME NOT NULL DEFAULT GETDATE())`
  ).then(async () => {
    await pool.request().query(hasMysqlConfig()
      ? `CREATE TABLE IF NOT EXISTS UniqueTalepSync (ID INT PRIMARY KEY, LeaseUntil DATETIME NULL); INSERT IGNORE INTO UniqueTalepSync (ID) VALUES (1)`
      : `IF OBJECT_ID('UniqueTalepSync','U') IS NULL BEGIN CREATE TABLE UniqueTalepSync (ID INT PRIMARY KEY, LeaseUntil DATETIME NULL); INSERT INTO UniqueTalepSync (ID) VALUES (1); END`);
  }).catch(error => { ready = null; throw error; });
  await ready; return pool;
}
function map(row: Record<string, unknown>): UniqueRequest {
  return { ...JSON.parse(String(row.Payload)), id: Number(row.ID), version: Number(row.Version) };
}
export async function getUniqueRequest(id: number) {
  const result = await (await uniquePool()).request().input("ID", id).query("SELECT ID,Payload,Version FROM UniqueTalep WHERE ID=@ID");
  if (!result.recordset[0]) throw new Error("Talep bulunamadı.");
  return map(result.recordset[0]);
}
export async function listUniqueRequests() {
  const result = await (await uniquePool()).request().query("SELECT ID,Payload,Version FROM UniqueTalep ORDER BY ID DESC");
  return result.recordset.map(map);
}
export async function insertUniqueRequest(value: Omit<UniqueRequest, "id" | "version">) {
  const pool = await uniquePool();
  const found = await pool.request().input("Source", value.source).query("SELECT ID FROM UniqueTalep WHERE SourceKey=@Source");
  if (found.recordset.length) return false;
  try {
    await pool.request().input("Source", value.source).input("Payload", JSON.stringify(value))
      .query("INSERT INTO UniqueTalep (SourceKey,Payload) VALUES (@Source,@Payload)");
    return true;
  } catch (error) {
    // A concurrent mailbox scan may have inserted this message already.
    const duplicate = await pool.request().input("Source", value.source).query("SELECT ID FROM UniqueTalep WHERE SourceKey=@Source");
    if (duplicate.recordset.length) return false;
    throw error;
  }
}
export async function saveUniqueRequest(value: UniqueRequest) {
  const result = await (await uniquePool()).request().input("ID", value.id).input("Version", value.version)
    .input("Payload", JSON.stringify(value)).query("UPDATE UniqueTalep SET Payload=@Payload,Version=Version+1 WHERE ID=@ID AND Version=@Version");
  if (!result.rowsAffected.some(n => n > 0)) throw new Error("Kayıt başka bir işlemde güncellendi. Sayfayı yenileyin.");
  return { ...value, version: value.version + 1 };
}
