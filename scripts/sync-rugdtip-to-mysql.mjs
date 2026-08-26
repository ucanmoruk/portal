import fs from "node:fs";
import mssql from "mssql";
import mysql from "mysql2/promise";

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith("#")) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

loadEnv(".env.local");
loadEnv(".env");

const sourceDb = process.env.MSSQL_ROOT_DB || process.env.DB_NAME || "massgrup_root";

const mssqlConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: sourceDb,
  server: process.env.DB_SERVER || "",
  port: Number(process.env.DB_PORT || 1433),
  requestTimeout: 60000,
  connectionTimeout: 10000,
  options: { encrypt: true, trustServerCertificate: true },
};

const mysqlConfig = {
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  charset: "utf8mb4_turkish_ci",
  namedPlaceholders: true,
  dateStrings: true,
};

const requiredEnv = [
  ["DB_SERVER", mssqlConfig.server],
  ["DB_USER", mssqlConfig.user],
  ["DB_PASSWORD", mssqlConfig.password],
  ["MYSQL_HOST", mysqlConfig.host],
  ["MYSQL_USER", mysqlConfig.user],
  ["MYSQL_DATABASE", mysqlConfig.database],
];

for (const [name, value] of requiredEnv) {
  if (!value) throw new Error(`${name} env degeri eksik.`);
}

const columns = [
  "ID",
  "Kategori",
  "UrunTipi",
  "YuzeyAlani",
  "UygulamaBolgesi",
  "Siklik",
  "GunlukMiktar",
  "ADegeri",
  "KategoriEn",
  "UrunTipiEn",
  "UygulamaBolgesiEn",
  "SiklikEn",
];

async function ensureMysqlSchema(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS rUGDTip (
      ID INT NOT NULL PRIMARY KEY,
      Kategori VARCHAR(200) NULL,
      UrunTipi VARCHAR(200) NULL,
      YuzeyAlani INT NULL,
      UygulamaBolgesi VARCHAR(500) NULL,
      Siklik VARCHAR(500) NULL,
      GunlukMiktar VARCHAR(100) NULL,
      ADegeri DECIMAL(18,6) NULL,
      KategoriEn VARCHAR(200) NULL,
      UrunTipiEn VARCHAR(200) NULL,
      UygulamaBolgesiEn VARCHAR(500) NULL,
      SiklikEn VARCHAR(500) NULL
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci
  `);

  const [existing] = await conn.execute(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rUGDTip'
  `);
  const names = new Set(existing.map((row) => row.COLUMN_NAME));
  const alterStatements = [
    ["YuzeyAlani", "ALTER TABLE rUGDTip ADD COLUMN YuzeyAlani INT NULL AFTER UrunTipi"],
    ["GunlukMiktar", "ALTER TABLE rUGDTip ADD COLUMN GunlukMiktar VARCHAR(100) NULL AFTER Siklik"],
    ["KategoriEn", "ALTER TABLE rUGDTip ADD COLUMN KategoriEn VARCHAR(200) NULL AFTER ADegeri"],
    ["UrunTipiEn", "ALTER TABLE rUGDTip ADD COLUMN UrunTipiEn VARCHAR(200) NULL AFTER KategoriEn"],
  ];

  for (const [column, sql] of alterStatements) {
    if (!names.has(column)) await conn.execute(sql);
  }
}

async function main() {
  const source = await new mssql.ConnectionPool(mssqlConfig).connect();
  const target = await mysql.createConnection(mysqlConfig);

  try {
    await ensureMysqlSchema(target);

    const result = await source.request().query(`
      SELECT ${columns.map((column) => `[${column}]`).join(", ")}
      FROM dbo.rUGDTip
      ORDER BY ID
    `);

    const rows = result.recordset;
    if (rows.length === 0) {
      console.log("MSSQL rUGDTip tablosunda aktarilacak satir yok.");
      return;
    }

    const placeholders = columns.map(() => "?").join(", ");
    const updateList = columns
      .filter((column) => column !== "ID")
      .map((column) => `\`${column}\` = VALUES(\`${column}\`)`)
      .join(", ");

    const upsertSql = `
      INSERT INTO rUGDTip (${columns.map((column) => `\`${column}\``).join(", ")})
      VALUES (${placeholders})
      ON DUPLICATE KEY UPDATE ${updateList}
    `;

    await target.beginTransaction();
    for (const row of rows) {
      await target.execute(upsertSql, columns.map((column) => row[column] ?? null));
    }
    await target.commit();

    const [after] = await target.execute("SELECT COUNT(*) AS total FROM rUGDTip");
    console.log(`rUGDTip aktarimi tamamlandi. Kaynak: ${rows.length}, MySQL toplam: ${after[0]?.total ?? 0}`);
  } catch (error) {
    try { await target.rollback(); } catch {}
    throw error;
  } finally {
    await target.end();
    await source.close();
  }
}

main().catch((error) => {
  console.error("rUGDTip aktarimi basarisiz:", error);
  process.exit(1);
});
