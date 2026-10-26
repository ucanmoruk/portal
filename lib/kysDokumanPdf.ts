import { createHash } from "node:crypto";
import { cosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";
import { getKysDokumanDosya } from "@/lib/kysDokumanStore";
import { convertWordToPdf, isWordFile } from "@/lib/officePdf";

let schemaReady: Promise<void> | undefined;
async function ensureSchema() {
  if (!schemaReady) schemaReady = (async () => {
    const pool = await cosmoPool;
    await pool.request().query(hasMysqlConfig() ? `
      CREATE TABLE IF NOT EXISTS KysDokumanPdf (
        DokumanID INT NOT NULL PRIMARY KEY,
        KaynakSha256 VARCHAR(64) NOT NULL,
        Pdf LONGBLOB NOT NULL,
        Donusturucu VARCHAR(100) NOT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ` : `
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'KysDokumanPdf')
      CREATE TABLE KysDokumanPdf (
        DokumanID INT NOT NULL PRIMARY KEY,
        KaynakSha256 VARCHAR(64) NOT NULL,
        Pdf VARBINARY(MAX) NOT NULL,
        Donusturucu NVARCHAR(100) NOT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
      )
    `);
  })().catch(error => { schemaReady = undefined; throw error; });
  return schemaReady;
}

const pending = new Map<string, Promise<Buffer>>();

/** PDF is a derivative: the uploaded Word and the document approval state stay intact. */
export async function getUploadedKysPdf(id: number): Promise<Buffer> {
  const source = await getKysDokumanDosya(id);
  if (!source) throw new Error("Doküman dosyası bulunamadı.");
  if (source.type === "application/pdf") return source.buffer;
  if (!isWordFile(source.type, source.name)) throw new Error("Bu dosya PDF veya Word belgesi değil.");
  await ensureSchema();
  const sha = createHash("sha256").update(source.buffer).digest("hex");
  const pool = await cosmoPool;
  const cached = await pool.request().input("ID", id).input("Sha", sha)
    .query("SELECT Pdf FROM KysDokumanPdf WHERE DokumanID = @ID AND KaynakSha256 = @Sha");
  if (cached.recordset[0]) return Buffer.from(cached.recordset[0].Pdf);
  const key = `${id}:${sha}`;
  let work = pending.get(key);
  if (!work) {
    work = (async () => {
      const converted = await convertWordToPdf(source.buffer, source.name);
      const tx = await pool.transaction();
      await tx.begin();
      try {
        await tx.request().input("ID", id).query("DELETE FROM KysDokumanPdf WHERE DokumanID = @ID");
        await tx.request().input("ID", id).input("Sha", sha).input("Pdf", converted.buffer).input("Engine", converted.engine)
          .query("INSERT INTO KysDokumanPdf (DokumanID, KaynakSha256, Pdf, Donusturucu) VALUES (@ID, @Sha, @Pdf, @Engine)");
        await tx.commit();
      } catch (error) { await tx.rollback(); throw error; }
      return converted.buffer;
    })().finally(() => pending.delete(key));
    pending.set(key, work);
  }
  return work;
}
