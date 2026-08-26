/* eslint-disable @typescript-eslint/no-explicit-any */

// Firma modalındaki "Notlar" sekmesi — Müşteri Notları (MusteriNot / takip,
// durum akışı) sisteminden TAMAMEN BAĞIMSIZ, basit bir bilgi notu defteri.
// Sadece metin + kim + ne zaman; durum/görüşme tarihi/başlık yok.

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
        KEY IX_FirmaGenelNot_Firma (FirmaID)
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
  };
}

export type FirmaGenelNotRow = ReturnType<typeof mapGenelNot>;

export async function listFirmaGenelNotlar(firmaId: number) {
  await ensureFirmaGenelNotSchema();
  const pool = await cosmoPool;
  const res = await pool.request().input("FirmaID", firmaId).query(`
    SELECT ID, NotMetni, OlusturanAd, CreatedAt
    FROM FirmaGenelNot
    WHERE FirmaID = @FirmaID
    ORDER BY ID DESC
  `);
  return (res.recordset as AnyRow[]).map(mapGenelNot);
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
