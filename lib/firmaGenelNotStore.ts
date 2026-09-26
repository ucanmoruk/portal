/* eslint-disable @typescript-eslint/no-explicit-any */

// Firma modalındaki "Notlar" sekmesi — Müşteri Notları (MusteriNot / takip,
// durum akışı) sisteminden TAMAMEN BAĞIMSIZ, basit bir bilgi notu defteri.
// Serbest metin ve dosya ekleriyle firma bilgi notu defteri.

import { cosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";

type AnyRow = Record<string, any>;

let schemaReady: Promise<void> | null = null;

export type FirmaGenelNotUser = { userId: string; userName: string };

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function rowNumber(row: AnyRow, key: string): number {
  return Number(row[key] ?? row[key.toLowerCase()] ?? 0);
}

function rowString(row: AnyRow, key: string): string {
  return String(row[key] ?? row[key.toLowerCase()] ?? "");
}

function asDateTime(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export async function ensureFirmaGenelNotSchema() {
  if (!schemaReady) {
    schemaReady = createSchema().catch(err => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

async function createSchema() {
  const pool = await cosmoPool;

  if (hasMysqlConfig()) {
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS FirmaGenelNot (
        ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        FirmaID INT NOT NULL,
        NotMetni TEXT NOT NULL,
        OlusturanID VARCHAR(80) NULL,
        OlusturanAd VARCHAR(160) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UpdatedAt DATETIME NULL,
        KEY IX_FirmaGenelNot_Firma (FirmaID)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    await pool.request().query("ALTER TABLE FirmaGenelNot ADD COLUMN IF NOT EXISTS UpdatedAt DATETIME NULL");
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS FirmaGenelNotEk (
        ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        NotID INT NOT NULL,
        DosyaAdi VARCHAR(255) NOT NULL,
        MimeType VARCHAR(120) NOT NULL,
        Boyut INT NOT NULL,
        FileData LONGBLOB NOT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY IX_FirmaGenelNotEk_Not (NotID)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    return;
  }

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'FirmaGenelNot')
    CREATE TABLE FirmaGenelNot (
      ID INT IDENTITY(1,1) PRIMARY KEY,
      FirmaID INT NOT NULL,
      NotMetni NVARCHAR(MAX) NOT NULL,
      OlusturanID NVARCHAR(80) NULL,
      OlusturanAd NVARCHAR(160) NULL,
      CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
      UpdatedAt DATETIME NULL
    )
  `);
  await pool.request().query("IF COL_LENGTH('FirmaGenelNot', 'UpdatedAt') IS NULL ALTER TABLE FirmaGenelNot ADD UpdatedAt DATETIME NULL");
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'FirmaGenelNotEk')
    CREATE TABLE FirmaGenelNotEk (
      ID INT IDENTITY(1,1) PRIMARY KEY,
      NotID INT NOT NULL,
      DosyaAdi NVARCHAR(255) NOT NULL,
      MimeType NVARCHAR(120) NOT NULL,
      Boyut INT NOT NULL,
      FileData VARBINARY(MAX) NOT NULL,
      CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
    )
  `);
}

function mapGenelNot(row: AnyRow) {
  return {
    id: rowNumber(row, "ID"),
    notMetni: rowString(row, "NotMetni"),
    olusturanAd: rowString(row, "OlusturanAd"),
    createdAt: asDateTime(row.CreatedAt ?? row.createdat),
    updatedAt: asDateTime(row.UpdatedAt ?? row.updatedat),
    ekler: [] as Array<{ id: number; dosyaAdi: string; mimeType: string; boyut: number }>,
  };
}

export type FirmaGenelNotRow = ReturnType<typeof mapGenelNot>;

export async function listFirmaGenelNotlar(firmaId: number) {
  await ensureFirmaGenelNotSchema();
  const pool = await cosmoPool;
  const res = await pool.request().input("FirmaID", firmaId).query(`
    SELECT ID, NotMetni, OlusturanAd, CreatedAt, UpdatedAt
    FROM FirmaGenelNot
    WHERE FirmaID = @FirmaID
    ORDER BY ID DESC
  `);
  const notes = (res.recordset as AnyRow[]).map(mapGenelNot);
  if (!notes.length) return notes;
  const attachments = await pool.request().input("FirmaID", firmaId).query(`
    SELECT e.ID, e.NotID, e.DosyaAdi, e.MimeType, e.Boyut
    FROM FirmaGenelNotEk e
    INNER JOIN FirmaGenelNot n ON n.ID=e.NotID
    WHERE n.FirmaID=@FirmaID ORDER BY e.ID
  `);
  const byId = new Map(notes.map(note => [note.id, note]));
  for (const row of attachments.recordset as AnyRow[]) {
    byId.get(rowNumber(row, "NotID"))?.ekler.push({
      id: rowNumber(row, "ID"), dosyaAdi: rowString(row, "DosyaAdi"),
      mimeType: rowString(row, "MimeType"), boyut: rowNumber(row, "Boyut"),
    });
  }
  return notes;
}

export async function createFirmaGenelNot(firmaId: number, notMetni: string, user: FirmaGenelNotUser) {
  await ensureFirmaGenelNotSchema();
  const metin = text(notMetni);
  if (!metin) throw new Error("Not metni zorunludur.");

  const pool = await cosmoPool;
  const res = await pool.request()
    .input("FirmaID", firmaId)
    .input("NotMetni", metin)
    .input("OlusturanID", user.userId || null)
    .input("OlusturanAd", user.userName || null)
    .query(`
      INSERT INTO FirmaGenelNot (FirmaID, NotMetni, OlusturanID, OlusturanAd)
      OUTPUT INSERTED.ID
      VALUES (@FirmaID, @NotMetni, @OlusturanID, @OlusturanAd)
    `);
  return { id: Number(res.recordset[0]?.ID ?? res.recordset[0]?.id ?? 0) };
}

export type FirmaGenelNotEkInput = { dosyaAdi: string; mimeType: string; data: Buffer };

export async function addFirmaGenelNotEkleri(firmaId: number, notId: number, files: FirmaGenelNotEkInput[]) {
  if (!files.length) return;
  await ensureFirmaGenelNotSchema();
  const pool = await cosmoPool;
  const owner = await pool.request().input("ID", notId).input("FirmaID", firmaId)
    .query("SELECT ID FROM FirmaGenelNot WHERE ID=@ID AND FirmaID=@FirmaID");
  if (!owner.recordset.length) throw new Error("Not bulunamadı.");
  for (const file of files) {
    await pool.request().input("NotID", notId).input("DosyaAdi", file.dosyaAdi)
      .input("MimeType", file.mimeType).input("Boyut", file.data.length).input("FileData", file.data)
      .query("INSERT INTO FirmaGenelNotEk (NotID,DosyaAdi,MimeType,Boyut,FileData) VALUES (@NotID,@DosyaAdi,@MimeType,@Boyut,@FileData)");
  }
}

export async function updateFirmaGenelNot(firmaId: number, notId: number, notMetni: string) {
  await ensureFirmaGenelNotSchema();
  const metin = text(notMetni);
  if (!metin) throw new Error("Not metni zorunludur.");
  const pool = await cosmoPool;
  const result = await pool.request().input("ID", notId).input("FirmaID", firmaId).input("NotMetni", metin)
    .query("UPDATE FirmaGenelNot SET NotMetni=@NotMetni,UpdatedAt=GETDATE() WHERE ID=@ID AND FirmaID=@FirmaID");
  if (!result.rowsAffected?.[0]) throw new Error("Not bulunamadı.");
}

export async function getFirmaGenelNotEk(firmaId: number, notId: number, ekId: number) {
  await ensureFirmaGenelNotSchema();
  const pool = await cosmoPool;
  const result = await pool.request().input("FirmaID", firmaId).input("NotID", notId).input("EkID", ekId).query(`
    SELECT e.DosyaAdi,e.MimeType,e.FileData FROM FirmaGenelNotEk e
    INNER JOIN FirmaGenelNot n ON n.ID=e.NotID
    WHERE e.ID=@EkID AND e.NotID=@NotID AND n.FirmaID=@FirmaID
  `);
  return result.recordset[0] || null;
}

export async function deleteFirmaGenelNotEk(firmaId: number, notId: number, ekId: number) {
  await ensureFirmaGenelNotSchema();
  const pool = await cosmoPool;
  const result = await pool.request().input("FirmaID", firmaId).input("NotID", notId).input("EkID", ekId).query(hasMysqlConfig() ? `
    DELETE e FROM FirmaGenelNotEk e INNER JOIN FirmaGenelNot n ON n.ID=e.NotID
    WHERE e.ID=@EkID AND e.NotID=@NotID AND n.FirmaID=@FirmaID
  ` : `
    DELETE FROM FirmaGenelNotEk WHERE ID=@EkID AND NotID=@NotID
      AND EXISTS(SELECT 1 FROM FirmaGenelNot n WHERE n.ID=@NotID AND n.FirmaID=@FirmaID)
  `);
  if (!result.rowsAffected?.[0]) throw new Error("Dosya bulunamadı.");
}
