import mysql from "mysql2/promise";

const mode = process.argv[2] || "dry-run";
const MIGRATION_KEY = "2026-ozel-evrak-v1";
if (!new Set(["dry-run", "apply", "verify", "rollback"]).has(mode)) {
  throw new Error("Kullanım: node --env-file=.env.local scripts/migrate-2026-ozel-evrak-no.mjs [dry-run|apply|verify|rollback]");
}

const db = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  charset: "utf8mb4",
});

async function ensureTables() {
  await db.query(`CREATE TABLE IF NOT EXISTS EvrakNoMigrationAudit (
    MigrationKey VARCHAR(100) PRIMARY KEY, Status VARCHAR(30) NOT NULL,
    AppliedAt DATETIME NULL, RolledBackAt DATETIME NULL, Details JSON NULL
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS EvrakNoMigration2026OzelDoc (
    OldEvrakNo VARCHAR(50) PRIMARY KEY, NewEvrakNo VARCHAR(50) NOT NULL UNIQUE,
    FirstDate DATE NULL, CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS EvrakNoMigration2026OzelNkr (
    NkrID BIGINT PRIMARY KEY, OldEvrakNo VARCHAR(50) NOT NULL, NewEvrakNo VARCHAR(50) NOT NULL,
    INDEX IX_OzelNkr_New (NewEvrakNo)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS EvrakNoMigration2026OzelLink (
    TableName VARCHAR(64) NOT NULL, RowID BIGINT NOT NULL,
    OldEvrakNo VARCHAR(50) NOT NULL, NewEvrakNo VARCHAR(50) NOT NULL,
    PaymentSnapshot JSON NULL, PaymentHash CHAR(64) NULL, PRIMARY KEY (TableName, RowID)
  )`);
  const [hashColumn] = await db.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'EvrakNoMigration2026OzelLink' AND column_name = 'PaymentHash'
  `);
  if (hashColumn.length === 0) {
    await db.query("ALTER TABLE EvrakNoMigration2026OzelLink ADD PaymentHash CHAR(64) NULL");
  }
}

async function inspect() {
  const [summary] = await db.query(`
    SELECT COUNT(*) AS documentCount, MIN(NewEvrakNo) AS firstNewNo, MAX(NewEvrakNo) AS lastNewNo
    FROM EvrakNoMigration2026OzelDoc
  `);
  const [payment] = await db.query(`
    SELECT COUNT(*) AS paymentRows
    FROM EvrakNoMigration2026OzelLink WHERE TableName = 'Odeme'
  `);
  return { ...summary[0], paymentRows: Number(payment[0].paymentRows || 0) };
}

async function prepareMapping() {
  await db.query("DELETE FROM EvrakNoMigration2026OzelLink");
  await db.query("DELETE FROM EvrakNoMigration2026OzelNkr");
  await db.query("DELETE FROM EvrakNoMigration2026OzelDoc");
  await db.query("SET @ozel_seq := 26000");
  await db.query(`
    INSERT INTO EvrakNoMigration2026OzelDoc (OldEvrakNo, NewEvrakNo, FirstDate)
    SELECT d.OldEvrakNo, CAST((@ozel_seq := @ozel_seq + 1) AS CHAR), d.FirstDate
    FROM (
      SELECT CAST(Evrak_No AS CHAR) AS OldEvrakNo, MIN(Tarih) AS FirstDate
      FROM NKR
      WHERE Tarih >= '2026-01-01' AND Tarih < '2027-01-01' AND TRIM(Grup) = 'Özel'
      GROUP BY Evrak_No
      ORDER BY CAST(Evrak_No AS UNSIGNED), Evrak_No
    ) d
  `);
  await db.query(`
    INSERT INTO EvrakNoMigration2026OzelNkr (NkrID, OldEvrakNo, NewEvrakNo)
    SELECT n.ID, CAST(n.Evrak_No AS CHAR), d.NewEvrakNo
    FROM NKR n
    INNER JOIN EvrakNoMigration2026OzelDoc d ON d.OldEvrakNo = CAST(n.Evrak_No AS CHAR)
    WHERE n.Tarih >= '2026-01-01' AND n.Tarih < '2027-01-01' AND TRIM(n.Grup) = 'Özel'
  `);
  await db.query(`
    INSERT INTO EvrakNoMigration2026OzelLink (TableName, RowID, OldEvrakNo, NewEvrakNo)
    SELECT 'ProformaNkr', p.ID, CAST(p.EvrakNo AS CHAR), n.NewEvrakNo
    FROM ProformaNkr p INNER JOIN EvrakNoMigration2026OzelNkr n ON n.NkrID = p.NkrID
  `);
  for (const [table, column] of [["NKR_EvrakEslestirme", "EvrakNo"], ["ProformaBaslik", "EvrakNo"]]) {
    await db.query(`
      INSERT INTO EvrakNoMigration2026OzelLink (TableName, RowID, OldEvrakNo, NewEvrakNo)
      SELECT ?, t.ID, CAST(t.${column} AS CHAR), d.NewEvrakNo
      FROM ${table} t INNER JOIN EvrakNoMigration2026OzelDoc d ON d.OldEvrakNo = CAST(t.${column} AS CHAR)
    `, [table]);
  }
  await db.query(`
    INSERT INTO EvrakNoMigration2026OzelLink
      (TableName, RowID, OldEvrakNo, NewEvrakNo, PaymentSnapshot, PaymentHash)
    SELECT 'Odeme', o.ID, CAST(o.Evrak_No AS CHAR), d.NewEvrakNo,
      JSON_OBJECT(
        'Odeme_Durumu', o.Odeme_Durumu, 'Fatura_ID', o.Fatura_ID,
        'Banka', o.Banka, 'Tarih', o.Tarih, 'Teklif', o.Teklif
      ), SHA2(CONCAT_WS('|',
        IFNULL(o.Odeme_Durumu, '<NULL>'), IFNULL(CAST(o.Fatura_ID AS CHAR), '<NULL>'),
        IFNULL(o.Banka, '<NULL>'), IFNULL(DATE_FORMAT(o.Tarih, '%Y-%m-%d %H:%i:%s.%f'), '<NULL>'),
        IFNULL(o.Teklif, '<NULL>')
      ), 256)
    FROM Odeme o INNER JOIN EvrakNoMigration2026OzelDoc d ON d.OldEvrakNo = CAST(o.Evrak_No AS CHAR)
  `);
}

async function validatePayments() {
  const [rows] = await db.query(`
    SELECT COUNT(*) AS changedRows
    FROM EvrakNoMigration2026OzelLink l
    INNER JOIN Odeme o ON o.ID = l.RowID
    WHERE l.TableName = 'Odeme' AND BINARY l.PaymentHash <> BINARY SHA2(CONCAT_WS('|',
      IFNULL(o.Odeme_Durumu, '<NULL>'), IFNULL(CAST(o.Fatura_ID AS CHAR), '<NULL>'),
      IFNULL(o.Banka, '<NULL>'), IFNULL(DATE_FORMAT(o.Tarih, '%Y-%m-%d %H:%i:%s.%f'), '<NULL>'),
      IFNULL(o.Teklif, '<NULL>')
    ), 256)
  `);
  if (Number(rows[0].changedRows || 0) !== 0) throw new Error("Ödeme alanı doğrulaması başarısız; işlem geri alınacak.");
}

async function apply() {
  const [audit] = await db.query("SELECT Status FROM EvrakNoMigrationAudit WHERE MigrationKey = ?", [MIGRATION_KEY]);
  if (audit[0]?.Status === "applied") throw new Error("Özel evrak dönüşümü zaten uygulanmış.");
  await db.beginTransaction();
  try {
    await db.query(`INSERT INTO EvrakNoMigrationAudit (MigrationKey, Status) VALUES (?, 'applying')
      ON DUPLICATE KEY UPDATE Status='applying', AppliedAt=NULL, RolledBackAt=NULL, Details=NULL`, [MIGRATION_KEY]);
    await prepareMapping();
    await db.query("UPDATE NKR n INNER JOIN EvrakNoMigration2026OzelNkr m ON m.NkrID=n.ID SET n.Evrak_No=m.NewEvrakNo");
    await db.query("UPDATE ProformaNkr t INNER JOIN EvrakNoMigration2026OzelLink m ON m.TableName='ProformaNkr' AND m.RowID=t.ID SET t.EvrakNo=m.NewEvrakNo");
    await db.query("UPDATE NKR_EvrakEslestirme t INNER JOIN EvrakNoMigration2026OzelLink m ON m.TableName='NKR_EvrakEslestirme' AND m.RowID=t.ID SET t.EvrakNo=m.NewEvrakNo");
    await db.query("UPDATE ProformaBaslik t INNER JOIN EvrakNoMigration2026OzelLink m ON m.TableName='ProformaBaslik' AND m.RowID=t.ID SET t.EvrakNo=m.NewEvrakNo");
    await db.query("UPDATE Odeme t INNER JOIN EvrakNoMigration2026OzelLink m ON m.TableName='Odeme' AND m.RowID=t.ID SET t.Evrak_No=m.NewEvrakNo");
    await validatePayments();
    const details = await inspect();
    await db.query("UPDATE EvrakNoMigrationAudit SET Status='applied', AppliedAt=NOW(), Details=? WHERE MigrationKey=?", [JSON.stringify(details), MIGRATION_KEY]);
    await db.commit();
    return details;
  } catch (error) {
    await db.rollback();
    throw error;
  }
}

async function rollback() {
  const [audit] = await db.query("SELECT Status FROM EvrakNoMigrationAudit WHERE MigrationKey = ?", [MIGRATION_KEY]);
  if (audit[0]?.Status !== "applied") throw new Error("Geri alınabilecek uygulanmış Özel evrak dönüşümü bulunamadı.");
  await db.beginTransaction();
  try {
    await db.query("UPDATE Odeme t INNER JOIN EvrakNoMigration2026OzelLink m ON m.TableName='Odeme' AND m.RowID=t.ID SET t.Evrak_No=m.OldEvrakNo");
    await db.query("UPDATE ProformaBaslik t INNER JOIN EvrakNoMigration2026OzelLink m ON m.TableName='ProformaBaslik' AND m.RowID=t.ID SET t.EvrakNo=m.OldEvrakNo");
    await db.query("UPDATE NKR_EvrakEslestirme t INNER JOIN EvrakNoMigration2026OzelLink m ON m.TableName='NKR_EvrakEslestirme' AND m.RowID=t.ID SET t.EvrakNo=m.OldEvrakNo");
    await db.query("UPDATE ProformaNkr t INNER JOIN EvrakNoMigration2026OzelLink m ON m.TableName='ProformaNkr' AND m.RowID=t.ID SET t.EvrakNo=m.OldEvrakNo");
    await db.query("UPDATE NKR n INNER JOIN EvrakNoMigration2026OzelNkr m ON m.NkrID=n.ID SET n.Evrak_No=m.OldEvrakNo");
    await validatePayments();
    await db.query("UPDATE EvrakNoMigrationAudit SET Status='rolled_back', RolledBackAt=NOW() WHERE MigrationKey=?", [MIGRATION_KEY]);
    await db.commit();
    return await inspect();
  } catch (error) {
    await db.rollback();
    throw error;
  }
}

try {
  await ensureTables();
  if (mode === "dry-run") {
    await db.beginTransaction();
    await prepareMapping();
    console.log(await inspect());
    await db.rollback();
  } else if (mode === "verify") {
    await validatePayments();
    const [audit] = await db.query("SELECT Status, AppliedAt, Details FROM EvrakNoMigrationAudit WHERE MigrationKey=?", [MIGRATION_KEY]);
    const [nkrMismatch] = await db.query(`SELECT COUNT(*) AS count FROM EvrakNoMigration2026OzelNkr m INNER JOIN NKR n ON n.ID=m.NkrID WHERE CAST(n.Evrak_No AS CHAR) <> m.NewEvrakNo`);
    console.log({ audit: audit[0] || null, nkrMismatch: Number(nkrMismatch[0].count || 0), ...(await inspect()) });
  } else console.log(mode === "apply" ? await apply() : await rollback());
} finally {
  await db.end();
}
