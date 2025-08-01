import { randomUUID } from "node:crypto";
import { hasMysqlConfig } from "@/lib/mysqlCompat";
import { cosmoPool } from "@/lib/db";

type RaporMailLogPool = Awaited<typeof cosmoPool>;

export type RaporMailLogInput = {
  nkrId: number;
  raporFormati: string;
  mailAdresi: string;
  gonderen: string;
};

export type RaporMailLogEntry = RaporMailLogInput & {
  logId: string;
};

let ensurePromise: Promise<void> | undefined;

export async function ensureRaporMailLogTable(pool: RaporMailLogPool) {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const mysql = hasMysqlConfig();
      const idColumn = mysql
        ? "ID BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY"
        : "ID INT IDENTITY(1,1) PRIMARY KEY";
      const create = mysql
        ? `CREATE TABLE IF NOT EXISTS NKR_RaporMailLog (
             ${idColumn}, LogID VARCHAR(36) NOT NULL UNIQUE, NkrID INT NOT NULL,
             RaporFormati NVARCHAR(80) NULL, EvrakNo NVARCHAR(100) NULL,
             FirmaAdi NVARCHAR(255) NULL, MailAdresi NVARCHAR(1000) NOT NULL,
             GonderimTarihi DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
             Durum NVARCHAR(30) NOT NULL, Aciklama NVARCHAR(2000) NULL,
             Gonderen NVARCHAR(255) NULL, MessageId NVARCHAR(255) NULL
           )`
        : `IF OBJECT_ID('NKR_RaporMailLog', 'U') IS NULL
           CREATE TABLE NKR_RaporMailLog (
             ${idColumn}, LogID NVARCHAR(36) NOT NULL UNIQUE, NkrID INT NOT NULL,
             RaporFormati NVARCHAR(80) NULL, EvrakNo NVARCHAR(100) NULL,
             FirmaAdi NVARCHAR(255) NULL, MailAdresi NVARCHAR(1000) NOT NULL,
             GonderimTarihi DATETIME NOT NULL DEFAULT GETDATE(),
             Durum NVARCHAR(30) NOT NULL, Aciklama NVARCHAR(2000) NULL,
             Gonderen NVARCHAR(255) NULL, MessageId NVARCHAR(255) NULL
           )`;

      await pool.request().query(create);
    })().catch((error) => {
      ensurePromise = undefined;
      throw error;
    });
  }
  await ensurePromise;
}

export async function createRaporMailLogEntries(
  pool: RaporMailLogPool,
  input: RaporMailLogInput[],
): Promise<RaporMailLogEntry[]> {
  await ensureRaporMailLogTable(pool);
  const entries: RaporMailLogEntry[] = [];

  for (const item of input) {
    const logId = randomUUID();
    const meta = await pool.request().input("nkrId", item.nkrId).query(`
      SELECT n.Evrak_No AS EvrakNo, n.RaporNo,
             f.Firma_Adi AS FirmaAdi
      FROM NKR n
      LEFT JOIN Firma f ON f.ID = n.Firma_ID
      WHERE n.ID = @nkrId
    `);
    const row = (meta.recordset?.[0] ?? {}) as Record<string, unknown>;

    await pool.request()
      .input("logId", logId)
      .input("nkrId", item.nkrId)
      .input("format", item.raporFormati)
      .input("evrakNo", row.EvrakNo == null ? null : String(row.EvrakNo))
      .input("firmaAdi", row.FirmaAdi == null ? null : String(row.FirmaAdi))
      .input("mailAdresi", item.mailAdresi)
      .input("durum", "Gönderiliyor")
      .input("gonderen", item.gonderen || null)
      .query(`
        INSERT INTO NKR_RaporMailLog
          (LogID, NkrID, RaporFormati, EvrakNo, FirmaAdi, MailAdresi, Durum, Gonderen)
        VALUES (@logId, @nkrId, @format, @evrakNo, @firmaAdi, @mailAdresi, @durum, @gonderen)
      `);

    entries.push({ ...item, logId });
  }
  return entries;
}

export async function updateRaporMailLog(
  pool: RaporMailLogPool,
  logIds: string[],
  durum: "Başarılı" | "Başarısız",
  aciklama: string | null,
  messageId?: string | null,
) {
  if (logIds.length === 0) return;
  await ensureRaporMailLogTable(pool);
  for (const logId of logIds) {
    await pool.request()
      .input("logId", logId)
      .input("durum", durum)
      .input("aciklama", aciklama?.slice(0, 2000) ?? null)
      .input("messageId", messageId?.slice(0, 255) ?? null)
      .query(`
        UPDATE NKR_RaporMailLog
        SET Durum = @durum, Aciklama = @aciklama, MessageId = @messageId
        WHERE LogID = @logId
      `);
  }
}
