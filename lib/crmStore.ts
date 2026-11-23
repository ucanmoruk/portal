import { randomUUID } from "node:crypto";
import { cosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";
import type { CrmKind, CrmPayload, CrmRecord } from "@/lib/crmRules";

let ready: Promise<unknown> | null = null;
export async function crmPool() {
  const pool = await cosmoPool;
  if (!ready) ready = pool.request().query(hasMysqlConfig()
    ? "CREATE TABLE IF NOT EXISTS CrmRecord (ID VARCHAR(36) PRIMARY KEY, Kind VARCHAR(20) NOT NULL, Payload LONGTEXT NOT NULL, Version INT NOT NULL, UpdatedBy VARCHAR(255) NOT NULL, UpdatedAt DATETIME NOT NULL, INDEX IX_CrmRecord_Kind (Kind)) CHARACTER SET utf8mb4"
    : "IF OBJECT_ID('CrmRecord','U') IS NULL BEGIN CREATE TABLE CrmRecord (ID VARCHAR(36) PRIMARY KEY, Kind VARCHAR(20) NOT NULL, Payload NVARCHAR(MAX) NOT NULL, Version INT NOT NULL, UpdatedBy NVARCHAR(255) NOT NULL, UpdatedAt DATETIME NOT NULL); CREATE INDEX IX_CrmRecord_Kind ON CrmRecord(Kind); END")
    .catch(error => { ready = null; throw error; });
  await ready;
  return pool;
}
export async function listCrmRecords(kind?: CrmKind): Promise<CrmRecord[]> {
  const pool = await crmPool();
  const result = await pool.request().input("Kind", kind || "").query(`SELECT ID,Kind,Payload,Version,UpdatedBy,UpdatedAt FROM CrmRecord WHERE ${kind ? "Kind=@Kind" : "Kind<>'mail'"} ORDER BY UpdatedAt DESC`);
  return result.recordset.map(row => { const data = JSON.parse(row.Payload); return { id: row.ID, kind: row.Kind, data, deletedAt: data._deleted?.at, version: Number(row.Version), updatedBy: row.UpdatedBy, updatedAt: new Date(row.UpdatedAt).toISOString() }; });
}
export async function findCrmRecord(id: string): Promise<CrmRecord | null> {
  const pool = await crmPool();
  const row = (await pool.request().input("ID", id).query("SELECT ID,Kind,Payload,Version,UpdatedBy,UpdatedAt FROM CrmRecord WHERE ID=@ID")).recordset[0];
  if (!row) return null;
  const data = JSON.parse(row.Payload);
  return { id: row.ID, kind: row.Kind, data, deletedAt: data._deleted?.at, version: Number(row.Version), updatedBy: row.UpdatedBy, updatedAt: new Date(row.UpdatedAt).toISOString() };
}
export async function insertCrmRecord(kind: CrmKind, data: CrmPayload, by: string, id: string = randomUUID()): Promise<CrmRecord> {
  const pool = await crmPool(), at = new Date();
  await pool.request().input("ID", id).input("Kind", kind).input("Payload", JSON.stringify(data)).input("By", by).input("At", at)
    .query("INSERT INTO CrmRecord (ID,Kind,Payload,Version,UpdatedBy,UpdatedAt) VALUES (@ID,@Kind,@Payload,1,@By,@At)");
  return { id, kind, data, version: 1, updatedBy: by, updatedAt: at.toISOString() };
}
export async function saveCrmRecord(record: CrmRecord, data: CrmPayload, by: string): Promise<CrmRecord> {
  const pool = await crmPool(), at = new Date();
  const result = await pool.request().input("ID", record.id).input("Version", record.version).input("Payload", JSON.stringify(data)).input("By", by).input("At", at)
    .query("UPDATE CrmRecord SET Payload=@Payload,Version=Version+1,UpdatedBy=@By,UpdatedAt=@At WHERE ID=@ID AND Version=@Version");
  if (!result.rowsAffected.some((n: number) => n > 0)) throw new CrmError("Kayıt başka bir kullanıcı tarafından değiştirildi. Yenileyip tekrar deneyin.", 409);
  return { ...record, data, deletedAt: data._deleted?.at, version: record.version + 1, updatedBy: by, updatedAt: at.toISOString() };
}
export class CrmError extends Error { constructor(message: string, public status = 400) { super(message); } }
