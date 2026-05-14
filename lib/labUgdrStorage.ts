import type { ConnectionPool } from "mssql";
import { UGD_REPORT_TEXT_FIELDS } from "@/lib/ugdReportFields";

let ensuredTextTable = false;
let ensuredFormulTable = false;

export async function ensureLabUgdrTextTable(pool: ConnectionPool) {
  if (ensuredTextTable) return;

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = N'NKR_UGDRaporMetinleri'
    )
    BEGIN
      CREATE TABLE NKR_UGDRaporMetinleri (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        NKRID INT NOT NULL,
        Alan NVARCHAR(100) NOT NULL,
        Dil NVARCHAR(10) NOT NULL,
        Metin NVARCHAR(MAX) NULL,
        UpdatedAt DATETIME NULL
      );
      CREATE INDEX IX_NKR_UGDRaporMetinleri_NKRID
        ON NKR_UGDRaporMetinleri (NKRID, Alan, Dil);
    END
  `);

  ensuredTextTable = true;
}

export async function ensureLabUgdrFormulTable(pool: ConnectionPool) {
  if (ensuredFormulTable) return;

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = N'NKR_Formul'
    )
    BEGIN
      CREATE TABLE NKR_Formul (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        NKRID INT NOT NULL,
        HammaddeID INT NULL,
        INCIName NVARCHAR(500) NULL,
        Miktar NVARCHAR(100) NULL,
        DaP FLOAT NULL,
        Noael NVARCHAR(100) NULL
      );
      CREATE INDEX IX_NKR_Formul_NKRID ON NKR_Formul (NKRID);
    END
  `);

  ensuredFormulTable = true;
}

export async function saveLabUgdrTexts(pool: ConnectionPool, nkrId: number, body: Record<string, unknown>) {
  await ensureLabUgdrTextTable(pool);

  await pool.request()
    .input("NKRID", nkrId)
    .query("DELETE FROM NKR_UGDRaporMetinleri WHERE NKRID = @NKRID");

  for (const field of UGD_REPORT_TEXT_FIELDS) {
    const tr = body[field] ?? "";
    const en = body[`${field}En`] ?? "";
    for (const [dil, metin] of [["tr", tr], ["en", en]] as const) {
      await pool.request()
        .input("NKRID", nkrId)
        .input("Alan", field)
        .input("Dil", dil)
        .input("Metin", metin)
        .query(`
          INSERT INTO NKR_UGDRaporMetinleri (NKRID, Alan, Dil, Metin, UpdatedAt)
          VALUES (@NKRID, @Alan, @Dil, @Metin, GETDATE())
        `);
    }
  }
}

export async function loadLabUgdrTexts(pool: ConnectionPool, nkrId: number) {
  await ensureLabUgdrTextTable(pool);

  const result = await pool.request()
    .input("NKRID", nkrId)
    .query("SELECT Alan, Dil, Metin FROM NKR_UGDRaporMetinleri WHERE NKRID = @NKRID");

  return result.recordset;
}

