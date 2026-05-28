import poolPromise from "./db";

const isPostgres = Boolean(process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL);

let tableEnsured = false;

async function ensureTable() {
  if (tableEnsured) return;
  const pool = await poolPromise;
  if (isPostgres) {
    // PG: native CREATE TABLE IF NOT EXISTS — translator pass-through
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS PortalAyarlar (
        Anahtar VARCHAR(100) NOT NULL PRIMARY KEY,
        Deger TEXT NULL
      )
    `);
  } else {
    // MSSQL: IF NOT EXISTS ... CREATE TABLE
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PortalAyarlar')
      CREATE TABLE PortalAyarlar (
        Anahtar NVARCHAR(100) NOT NULL PRIMARY KEY,
        Deger   NVARCHAR(MAX) NULL
      )
    `);
  }
  tableEnsured = true;
}

export async function getAllSettings(): Promise<Record<string, string>> {
  await ensureTable();
  const pool = await poolPromise;
  const res  = await pool.request().query("SELECT Anahtar, Deger FROM PortalAyarlar");
  const map: Record<string, string> = {};
  for (const row of res.recordset) map[row.Anahtar] = row.Deger ?? "";
  return map;
}

export async function getSetting(key: string, fallback = ""): Promise<string> {
  await ensureTable();
  const pool = await poolPromise;
  const res  = await pool.request()
    .input("K", key)
    .query("SELECT Deger FROM PortalAyarlar WHERE Anahtar = @K");
  return res.recordset[0]?.Deger ?? fallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await ensureTable();
  const pool = await poolPromise;
  if (isPostgres) {
    // PG upsert — ON CONFLICT
    await pool.request()
      .input("K", key)
      .input("V", value)
      .query(`
        INSERT INTO PortalAyarlar (Anahtar, Deger) VALUES (@K, @V)
        ON CONFLICT (Anahtar) DO UPDATE SET Deger = EXCLUDED.Deger
      `);
    return;
  }
  // MSSQL MERGE
  await pool.request()
    .input("K", key)
    .input("V", value)
    .query(`
      MERGE PortalAyarlar AS t
      USING (SELECT @K AS Anahtar) AS s ON t.Anahtar = s.Anahtar
      WHEN MATCHED     THEN UPDATE SET Deger = @V
      WHEN NOT MATCHED THEN INSERT (Anahtar, Deger) VALUES (@K, @V);
    `);
}

export async function setSettings(map: Record<string, string>): Promise<void> {
  for (const [k, v] of Object.entries(map)) await setSetting(k, v);
}
