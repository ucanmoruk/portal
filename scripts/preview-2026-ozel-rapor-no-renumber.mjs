import mysql from "mysql2/promise";
import { writeFile } from "node:fs/promises";

const db = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  charset: "utf8mb4",
});

const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;

try {
  const [rows] = await db.query(`
    SELECT
      n.ID,
      CAST(n.Evrak_No AS CHAR) AS EvrakNo,
      CAST(n.RaporNo AS CHAR) AS EskiRaporNo,
      DATE_FORMAT(n.Tarih, '%Y-%m-%d') AS Tarih,
      n.Numune_Adi AS NumuneAdi,
      f.Firma_Adi AS FirmaAdi
    FROM NKR n
    LEFT JOIN Firma f ON f.ID = n.Firma_ID
    WHERE n.Tarih >= '2026-07-01'
      AND n.Tarih < '2027-01-01'
      AND TRIM(n.Grup) = 'Özel'
      AND n.Durum = 'Aktif'
    ORDER BY n.Tarih ASC, n.ID ASC
  `);

  const mapping = rows.map((row, index) => ({
    ...row,
    YeniRaporNo: String(261056 + index),
  }));

  let csv = "Eski Rapor No,Yeni Rapor No,Evrak No,Tarih,Numune Adi,Firma,Kayit ID\n";
  for (const row of mapping) {
    const date = row.Tarih || "";
    csv += [row.EskiRaporNo, row.YeniRaporNo, row.EvrakNo, date, row.NumuneAdi, row.FirmaAdi, row.ID]
      .map(csvCell).join(",") + "\n";
  }

  const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
  if (outputArg) await writeFile(outputArg.slice("--output=".length), `\uFEFF${csv}`, "utf8");
  else process.stdout.write(csv);

  const oldNumbers = mapping.map((row) => String(row.EskiRaporNo || "").trim()).filter(Boolean);
  const duplicateOldNumbers = oldNumbers.length - new Set(oldNumbers).size;
  const [collisionRows] = mapping.length ? await db.query(`
    SELECT COUNT(*) AS count
    FROM NKR n
    WHERE CAST(n.RaporNo AS UNSIGNED) BETWEEN ? AND ?
      AND n.ID NOT IN (?)
  `, [261056, 261055 + mapping.length, mapping.map((row) => row.ID)]) : [[{ count: 0 }]];
  process.stderr.write(JSON.stringify({
    sampleCount: mapping.length,
    firstNewReportNo: mapping.at(0)?.YeniRaporNo || null,
    lastNewReportNo: mapping.at(-1)?.YeniRaporNo || null,
    duplicateOldReportNumberRows: duplicateOldNumbers,
    emptyOldReportNumberRows: mapping.filter((row) => !String(row.EskiRaporNo || "").trim()).length,
    targetNumberCollisionRows: Number(collisionRows[0]?.count || 0),
  }) + "\n");
} finally {
  await db.end();
}
