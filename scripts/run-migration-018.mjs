// MSSQL massgrup_cosmo: NKR_RaporOnay'a DisRaporKodu kolonu + unique index ekler.
// Idempotent — daha önce çalıştırılmışsa fark etmeden geçer.
import mssql from "mssql";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const sqlPath    = path.resolve(__dirname, "..", "migrations", "018-cosmo-nkr-rapor-onay-dis-kod.sql");
const sql        = fs.readFileSync(sqlPath, "utf-8");

const db = process.env.MSSQL_COSMO_DB || "massgrup_cosmo";

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: db,
  server: process.env.DB_SERVER,
  port: 1433,
  connectionTimeout: 30000,
  requestTimeout: 60000,
  options: { encrypt: true, trustServerCertificate: true },
};

if (!config.server || !config.user) {
  console.error("DB_SERVER/DB_USER/DB_PASSWORD ortam degiskenleri yok.");
  process.exit(1);
}

const pool = await new mssql.ConnectionPool(config).connect();
console.log(`MSSQL ${db} baglanildi.`);

// MSSQL: `GO` batch ayraci. Tedious bunu parse etmez, manuel split ediyoruz.
const batches = sql.split(/^\s*GO\s*$/im).map(b => b.trim()).filter(Boolean);
for (const batch of batches) {
  await pool.request().batch(batch);
}
console.log(`✓ Migration 018 uygulandi (${batches.length} batch): NKR_RaporOnay.DisRaporKodu`);

// Dogrulama
const col = await pool.request().query(
  `SELECT COL_LENGTH('NKR_RaporOnay','DisRaporKodu') AS len`
);
const idx = await pool.request().query(
  `SELECT name FROM sys.indexes WHERE name = 'UX_NKR_RaporOnay_DisRaporKodu'`
);
console.log(`  → DisRaporKodu kolon boyutu: ${col.recordset[0].len ?? "YOK"}`);
console.log(`  → Unique index: ${idx.recordset.length ? "VAR" : "YOK"}`);

await pool.close();
console.log("✅ Tamamlandi.");
