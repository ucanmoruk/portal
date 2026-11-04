import { cosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";
import { CrmKnowledgeContent, emptyCrmKnowledge, type CrmKnowledge, type CrmKnowledgeContentType } from "@/lib/crmKnowledgeRules";

let ready: Promise<unknown> | null = null;
async function knowledgePool() {
  const pool = await cosmoPool;
  if (!ready) ready = (async () => {
    await pool.request().query(hasMysqlConfig()
      ? "CREATE TABLE IF NOT EXISTS CrmKnowledge (ID INT PRIMARY KEY, Content LONGTEXT NOT NULL, Version INT NOT NULL DEFAULT 0, UpdatedBy VARCHAR(255) NOT NULL, UpdatedAt DATETIME NULL) CHARACTER SET utf8mb4"
      : "IF OBJECT_ID('CrmKnowledge','U') IS NULL CREATE TABLE CrmKnowledge (ID INT PRIMARY KEY, Content NVARCHAR(MAX) NOT NULL, Version INT NOT NULL DEFAULT 0, UpdatedBy NVARCHAR(255) NOT NULL, UpdatedAt DATETIME NULL)");
    const request = pool.request().input("Content", JSON.stringify(emptyCrmKnowledge().content));
    await request.query(hasMysqlConfig()
      ? "INSERT IGNORE INTO CrmKnowledge (ID,Content,Version,UpdatedBy) VALUES (1,@Content,0,'')"
      : "IF NOT EXISTS (SELECT 1 FROM CrmKnowledge WHERE ID=1) INSERT INTO CrmKnowledge (ID,Content,Version,UpdatedBy) VALUES (1,@Content,0,'')");
  })().catch(error => { ready = null; throw error; });
  await ready;
  return pool;
}
export async function getCrmKnowledge(): Promise<CrmKnowledge> {
  const pool = await knowledgePool();
  const row = (await pool.request().query("SELECT Content,Version,UpdatedBy,UpdatedAt FROM CrmKnowledge WHERE ID=1")).recordset[0];
  if (!row) throw new Error("CRM bilgi kaydı bulunamadı.");
  return { content: CrmKnowledgeContent.parse(JSON.parse(row.Content)), version: Number(row.Version), updatedBy: row.UpdatedBy || "", updatedAt: row.UpdatedAt instanceof Date ? row.UpdatedAt.toISOString() : row.UpdatedAt || null };
}
export async function saveCrmKnowledge(content: CrmKnowledgeContentType, version: number, userName: string) {
  const validated = CrmKnowledgeContent.parse(content);
  const pool = await knowledgePool();
  const result = await pool.request().input("Content", JSON.stringify(validated)).input("Version", version).input("UpdatedBy", userName).input("UpdatedAt", new Date())
    .query("UPDATE CrmKnowledge SET Content=@Content,Version=Version+1,UpdatedBy=@UpdatedBy,UpdatedAt=@UpdatedAt WHERE ID=1 AND Version=@Version");
  return result.rowsAffected.some((count: number) => count > 0);
}
