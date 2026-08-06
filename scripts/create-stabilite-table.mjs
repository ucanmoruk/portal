// NKR_StabiliteVeri tablosunu MySQL'de oluşturur (Stabilite rapor matrisi JSON).
// MySQL compat "IF NOT EXISTS ... CREATE" ifadesini no-op'ladığı için tablo
// uygulamadan oluşturulamaz; bu script native MySQL DDL ile bir kez çalıştırılır.
import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const conn = await mysql.createConnection({
  host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});

await conn.query(`
  CREATE TABLE IF NOT EXISTS NKR_StabiliteVeri (
    ID           INT AUTO_INCREMENT PRIMARY KEY,
    NkrID        INT          NOT NULL,
    RaporFormati VARCHAR(80)  NOT NULL,
    VeriJson     LONGTEXT     NULL,
    UpdatedAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_nkr_format (NkrID, RaporFormati)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`);
const [chk] = await conn.query(
  `SELECT 1 FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='NKR_StabiliteVeri'`);
console.log("NKR_StabiliteVeri:", chk.length ? "OLUŞTU / mevcut ✓" : "OLUŞMADI ✗");
await conn.end();
