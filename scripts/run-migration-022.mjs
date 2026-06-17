// MSSQL massgrup_cosmo: NumuneX1AltParametre tablosunu oluşturur (per-rapor bileşen sonuçları).
import mssql from "mssql";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

try {
  for (const line of fs.readFileSync(path.resolve(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* env zaten set olabilir */ }

const sqlPath = path.resolve(__dirname, "..", "migrations", "022-cosmo-numune-x1-alt-parametre.sql");
const sql     = fs.readFileSync(sqlPath, "utf-8");

const db = process.env.MSSQL_COSMO_DB || "massgrup_cosmo";
const pool = await new mssql.ConnectionPool({
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: db, server: process.env.DB_SERVER, port: 1433,
  connectionTimeout: 30000, requestTimeout: 60000,
  options: { encrypt: true, trustServerCertificate: true },
}).connect();
console.log(`MSSQL ${db} baglanildi.`);

const batches = sql.split(/^\s*GO\s*$/im).map(b => b.trim()).filter(Boolean);
for (const batch of batches) await pool.request().batch(batch);

const chk = await pool.request().query(
  `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='NumuneX1AltParametre'`
);
console.log(`✓ Migration 022 uygulandi. NumuneX1AltParametre kolon sayisi: ${chk.recordset[0].c}`);
await pool.close();
