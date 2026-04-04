import poolPromise from "./db";

const TABLE_INIT = `
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PortalAyarlar')
  CREATE TABLE PortalAyarlar (
    Anahtar NVARCHAR(100) NOT NULL PRIMARY KEY,
    Deger   NVARCHAR(MAX) NULL
  )`;

let tableEnsured = false;

async function ensureTable() {
  if (tableEnsured) return;
  const pool = await poolPromise;
  await pool.request().query(TABLE_INIT);
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
