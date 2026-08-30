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

try {
  const [documents] = await db.query(`
    SELECT
      CAST(Evrak_No AS CHAR) AS oldNo,
      MIN(Tarih) AS firstDate,
      COUNT(*) AS sampleCount
    FROM NKR
    WHERE Tarih >= '2026-01-01'
      AND Tarih < '2027-01-01'
      AND TRIM(Grup) = 'Özel'
    GROUP BY Evrak_No
    ORDER BY CAST(Evrak_No AS UNSIGNED), Evrak_No
  `);

  const mapping = documents.map((row, index) => ({
    oldNo: String(row.oldNo),
    newNo: String(26001 + index),
    firstDate: row.firstDate,
    sampleCount: Number(row.sampleCount),
  }));

  const [mixedRows] = await db.query(`
    SELECT COUNT(*) AS count
    FROM (
      SELECT Evrak_No
      FROM NKR
      WHERE Tarih >= '2026-01-01' AND Tarih < '2027-01-01'
      GROUP BY Evrak_No
      HAVING SUM(TRIM(Grup) = 'Özel') > 0 AND SUM(TRIM(Grup) = 'K.D.') > 0
    ) mixed
  `);

  const [paymentRows] = await db.query(`
    SELECT CAST(Evrak_No AS CHAR) AS evrakNo, COUNT(*) AS count
    FROM Odeme
    WHERE CAST(Evrak_No AS CHAR) IN (?)
    GROUP BY Evrak_No
  `, [mapping.map((row) => row.oldNo)]);
  const payments = new Map(paymentRows.map((row) => [String(row.evrakNo), Number(row.count)]));

  let csv = "Eski Evrak No,Yeni Evrak No,Ilk Tarih,Numune Sayisi,Odeme Kaydi Sayisi\n";
  for (const row of mapping) {
    const date = row.firstDate ? new Date(row.firstDate).toISOString().slice(0, 10) : "";
    csv += `${row.oldNo},${row.newNo},${date},${row.sampleCount},${payments.get(row.oldNo) || 0}\n`;
  }
  const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
  if (outputArg) await writeFile(outputArg.slice("--output=".length), `\uFEFF${csv}`, "utf8");
  else process.stdout.write(csv);
  process.stderr.write(JSON.stringify({
    documentCount: mapping.length,
    firstNewNo: mapping.at(0)?.newNo || null,
    lastNewNo: mapping.at(-1)?.newNo || null,
    mixedDocumentCount: Number(mixedRows[0]?.count || 0),
    documentsWithPayments: mapping.filter((row) => payments.has(row.oldNo)).length,
    paymentRowCount: [...payments.values()].reduce((sum, count) => sum + count, 0),
  }) + "\n");
} finally {
  await db.end();
}
