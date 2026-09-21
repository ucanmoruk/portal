import { hasMysqlConfig } from "@/lib/mysqlCompat";
import { FATURA_KAYNAKLARI } from "@/lib/faturaConstants";

export type FaturaKaynagi = (typeof FATURA_KAYNAKLARI)[number];

let schemaReady: Promise<void> | null = null;

interface SqlPoolLike {
  request(): { query(sql: string): Promise<unknown> };
}

export function isFaturaKaynagi(value: string): value is FaturaKaynagi {
  return FATURA_KAYNAKLARI.includes(value as FaturaKaynagi);
}

export async function ensureFaturaTrackingSchema(pool: SqlPoolLike) {
  if (!schemaReady) {
    schemaReady = ensureSchema(pool).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

async function ensureSchema(pool: SqlPoolLike) {
  if (hasMysqlConfig()) {
    await pool.request().query("ALTER TABLE Fatura ADD COLUMN IF NOT EXISTS Kaynak VARCHAR(20) NOT NULL DEFAULT 'Unique'");
    await pool.request().query("ALTER TABLE Fatura ADD COLUMN IF NOT EXISTS VadeTarihi DATE NULL");
    await pool.request().query("UPDATE Fatura SET Kaynak = 'Unique' WHERE Kaynak IS NULL OR Kaynak = ''");
    await pool.request().query("UPDATE Fatura SET VadeTarihi = DATE_ADD(DATE(Tarih), INTERVAL 30 DAY) WHERE VadeTarihi IS NULL AND Tarih IS NOT NULL AND Tarih <> '0000-00-00 00:00:00'");
    return;
  }

  await pool.request().query("IF COL_LENGTH('Fatura', 'Kaynak') IS NULL ALTER TABLE Fatura ADD Kaynak NVARCHAR(20) NOT NULL CONSTRAINT DF_Fatura_Kaynak DEFAULT N'Unique'");
  await pool.request().query("IF COL_LENGTH('Fatura', 'VadeTarihi') IS NULL ALTER TABLE Fatura ADD VadeTarihi DATE NULL");
  await pool.request().query("UPDATE Fatura SET Kaynak = N'Unique' WHERE Kaynak IS NULL OR Kaynak = N''");
  await pool.request().query("UPDATE Fatura SET VadeTarihi = DATEADD(DAY, 30, CAST(Tarih AS DATE)) WHERE VadeTarihi IS NULL AND Tarih IS NOT NULL");
}
