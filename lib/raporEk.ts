import { hasMysqlConfig } from "@/lib/mysqlCompat";

// "Diğer" formatı raporlar için lab'ın yüklediği Ek-1 PDF referansı.
// PDF fiziksel olarak VerifiedFiles FTP'sinde; burada yalnızca URL + token tutulur.
// (NkrID, RaporFormati) başına tek Ek.

export interface RaporEk {
  ekUrl: string;
  ekToken: string | null;
}

async function ensureRaporEkTable(pool: any) {
  if (hasMysqlConfig()) {
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS NKR_RaporEk (
        ID INT AUTO_INCREMENT PRIMARY KEY,
        NkrID INT NOT NULL,
        RaporFormati VARCHAR(80) NOT NULL,
        EkUrl VARCHAR(500) NOT NULL,
        EkToken VARCHAR(64) NULL,
        YuklemeTarihi DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        YukleyenID INT NULL,
        UNIQUE KEY UX_NKR_RaporEk_Nkr_Format (NkrID, RaporFormati)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci
    `);
    return;
  }
  await pool.request().query(`
    IF OBJECT_ID('dbo.NKR_RaporEk', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.NKR_RaporEk (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        NkrID INT NOT NULL,
        RaporFormati NVARCHAR(80) NOT NULL,
        EkUrl NVARCHAR(500) NOT NULL,
        EkToken NVARCHAR(64) NULL,
        YuklemeTarihi DATETIME2 NOT NULL CONSTRAINT DF_NKR_RaporEk_Tarih DEFAULT SYSUTCDATETIME(),
        YukleyenID INT NULL
      );
      CREATE UNIQUE INDEX UX_NKR_RaporEk_Nkr_Format ON dbo.NKR_RaporEk (NkrID, RaporFormati);
    END
  `);
}

export async function getRaporEk(pool: any, nkrId: number, format: string): Promise<RaporEk | null> {
  await ensureRaporEkTable(pool);
  try {
    const r = await pool.request()
      .input("nkrId", nkrId).input("format", format)
      .query(`
        SELECT TOP 1 EkUrl, EkToken FROM dbo.NKR_RaporEk
        WHERE NkrID = @nkrId AND RaporFormati = @format
      `);
    const row = r.recordset[0];
    if (!row || !row.EkUrl) return null;
    return { ekUrl: String(row.EkUrl), ekToken: row.EkToken ? String(row.EkToken) : null };
  } catch {
    return null;
  }
}

export async function setRaporEk(
  pool: any, nkrId: number, format: string, ekUrl: string, ekToken: string | null, userId: number | null,
) {
  await ensureRaporEkTable(pool);
  if (hasMysqlConfig()) {
    await pool.request()
      .input("nkrId", nkrId).input("format", format)
      .input("ekUrl", ekUrl).input("ekToken", ekToken).input("userId", userId)
      .query(`
        INSERT INTO NKR_RaporEk (NkrID, RaporFormati, EkUrl, EkToken, YukleyenID)
        VALUES (@nkrId, @format, @ekUrl, @ekToken, @userId)
        ON DUPLICATE KEY UPDATE
          EkUrl = VALUES(EkUrl), EkToken = VALUES(EkToken),
          YuklemeTarihi = NOW(), YukleyenID = VALUES(YukleyenID)
      `);
    return;
  }
  await pool.request()
    .input("nkrId", nkrId).input("format", format)
    .input("ekUrl", ekUrl).input("ekToken", ekToken).input("userId", userId)
    .query(`
      MERGE dbo.NKR_RaporEk AS target
      USING (SELECT @nkrId AS NkrID, @format AS RaporFormati) AS src
        ON target.NkrID = src.NkrID AND target.RaporFormati = src.RaporFormati
      WHEN MATCHED THEN
        UPDATE SET EkUrl = @ekUrl, EkToken = @ekToken, YuklemeTarihi = SYSUTCDATETIME(), YukleyenID = @userId
      WHEN NOT MATCHED THEN
        INSERT (NkrID, RaporFormati, EkUrl, EkToken, YukleyenID)
        VALUES (@nkrId, @format, @ekUrl, @ekToken, @userId);
    `);
}

export async function deleteRaporEk(pool: any, nkrId: number, format: string) {
  await ensureRaporEkTable(pool);
  try {
    await pool.request()
      .input("nkrId", nkrId).input("format", format)
      .query(`DELETE FROM dbo.NKR_RaporEk WHERE NkrID = @nkrId AND RaporFormati = @format`);
  } catch {
    /* tablo yoksa yok say */
  }
}
