// MSSQL massgrup_cosmo: TalepMesaj tablosunu olusturur.
// Idempotent.
import mssql from "mssql";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const sqlPath    = path.resolve(__dirname, "..", "migrations", "019-cosmo-talep-mesaj.sql");
const sql        = fs.readFileSync(sqlPath, "utf-8");

const db = process.env.MSSQL_COSMO_DB || "massgrup_cosmo";

const pool = await new mssql.ConnectionPool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: db,
  server: process.env.DB_SERVER,
  port: 1433,
  connectionTimeout: 30000,
  requestTimeout: 60000,
  options: { encrypt: true, trustServerCertificate: true },
}).connect();
console.log(`MSSQL ${db} baglanildi.`);

const batches = sql.split(/^\s*GO\s*$/im).map(b => b.trim()).filter(Boolean);
for (const batch of batches) await pool.request().batch(batch);
console.log(`✓ Migration 019 uygulandi (${batches.length} batch): TalepMesaj`);

const tbl = await pool.request().query(
  `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'TalepMesaj'`
);
const idx = await pool.request().query(
  `SELECT name FROM sys.indexes WHERE name = 'IX_TalepMesaj_TalepID'`
);
console.log(`  → TalepMesaj tablosu: ${tbl.recordset[0].cnt ? "VAR" : "YOK"}`);
console.log(`  → IX_TalepMesaj_TalepID: ${idx.recordset.length ? "VAR" : "YOK"}`);

await pool.close();
console.log("✅ Tamamlandi.");
