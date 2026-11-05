import poolPromise from "@/lib/db";
import { packLiveReport, restoreLiveReportSections, type LiveReportSection } from "@/lib/ugdLiveReport";
export type LiveReportKey = { source: "lab" | "ugd"; recordId: number; language: "tr" | "en" | "cpsr"; profile: "lab" | "ugd" };
let ready: Promise<unknown> | null = null;
async function reportPool() {
  const pool = await poolPromise;
  if ((pool as unknown as { config?: { __mysql?: boolean } }).config?.__mysql) return pool;
  if (!ready) ready = pool.request().query(process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL
    ? `CREATE TABLE IF NOT EXISTS UGD_CanliRaporEdits (ID SERIAL PRIMARY KEY, Source VARCHAR(20) NOT NULL, RecordID INTEGER NOT NULL, Dil VARCHAR(10) NOT NULL, Profile VARCHAR(20) NOT NULL, HeadHtml TEXT NULL, BodyHtml TEXT NULL, SectionsJson TEXT NULL, CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);
       CREATE INDEX IF NOT EXISTS IX_UGD_CanliRaporEdits_Record ON UGD_CanliRaporEdits (Source,RecordID,Dil,Profile,CreatedAt)`
    : `IF OBJECT_ID('UGD_CanliRaporEdits','U') IS NULL BEGIN CREATE TABLE UGD_CanliRaporEdits (ID INT IDENTITY(1,1) PRIMARY KEY, Source NVARCHAR(20) NOT NULL, RecordID INT NOT NULL, Dil NVARCHAR(10) NOT NULL, Profile NVARCHAR(20) NOT NULL, HeadHtml NVARCHAR(MAX) NULL, BodyHtml NVARCHAR(MAX) NULL, SectionsJson NVARCHAR(MAX) NULL, CreatedAt DATETIME NOT NULL DEFAULT GETDATE()); CREATE INDEX IX_UGD_CanliRaporEdits_Record ON UGD_CanliRaporEdits (Source,RecordID,Dil,Profile,CreatedAt); END`
  ).catch(error => { ready = null; throw error; });
  await ready; return pool;
}
const value = (row: Record<string, unknown>, key: string) => row[key] ?? row[key.toLowerCase()] ?? row[key.toUpperCase()];
export async function loadLiveReport(key: LiveReportKey) {
  const result = await (await reportPool()).request().input("Source", key.source).input("RecordID", key.recordId).input("Dil", key.language).input("Profile", key.profile)
    .query("SELECT TOP 1 ID,HeadHtml,BodyHtml,SectionsJson,CreatedAt FROM UGD_CanliRaporEdits WHERE Source=@Source AND RecordID=@RecordID AND Dil=@Dil AND Profile=@Profile ORDER BY CreatedAt DESC,ID DESC");
  const row = result.recordset[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const bodyHtml = String(value(row, "BodyHtml") || "");
  let sections: unknown = [];
  try { sections = JSON.parse(String(value(row, "SectionsJson") || "[]")); } catch { /* Keep the authoritative saved body. */ }
  const compact = packLiveReport(restoreLiveReportSections(bodyHtml, sections), bodyHtml);
  return { ...key, id: Number(value(row, "ID")), headHtml: String(value(row, "HeadHtml") || ""), ...compact, createdAt: value(row, "CreatedAt") };
}
export async function saveLiveReport(key: LiveReportKey, headHtml: string, sections: LiveReportSection[], bodyHtml = "") {
  const compact = packLiveReport(sections, bodyHtml);
  if (!compact.bodyHtml.trim()) throw new Error("Kaydedilecek canlı rapor içeriği bulunamadı.");
  await (await reportPool()).request().input("Source", key.source).input("RecordID", key.recordId).input("Dil", key.language).input("Profile", key.profile)
    .input("HeadHtml", headHtml).input("BodyHtml", compact.bodyHtml).input("SectionsJson", JSON.stringify(compact.sections))
    .query("INSERT INTO UGD_CanliRaporEdits (Source,RecordID,Dil,Profile,HeadHtml,BodyHtml,SectionsJson,CreatedAt) VALUES (@Source,@RecordID,@Dil,@Profile,@HeadHtml,@BodyHtml,@SectionsJson,GETDATE())");
}
