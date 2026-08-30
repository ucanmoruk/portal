import mysql from "mysql2/promise";

const mode = process.argv[2] || "dry-run";
const MIGRATION_KEY = "2026-kd-evrak-v1";

if (!new Set(["dry-run", "apply", "rollback"]).has(mode)) {
  throw new Error("Kullanım: node --env-file=.env.local scripts/migrate-2026-kd-evrak-no.mjs [dry-run|apply|rollback]");
}

const db = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  charset: "utf8mb4",
});

const targetExpression = "CAST(CONCAT(LEFT(CAST(n.Evrak_No AS CHAR), 2), '1', SUBSTRING(CAST(n.Evrak_No AS CHAR), 3)) AS UNSIGNED)";

async function inspect() {
  const [summary] = await db.query(`
    SELECT
      COUNT(*) AS kdRows,
      COUNT(DISTINCT n.Evrak_No) AS kdDocuments,
      COUNT(DISTINCT CASE WHEN EXISTS (
        SELECT 1 FROM NKR o WHERE o.Evrak_No = n.Evrak_No AND TRIM(o.Grup) = 'Özel'
      ) THEN n.Evrak_No END) AS mixedDocuments
    FROM NKR n
    WHERE n.Tarih >= '2026-01-01' AND n.Tarih < '2027-01-01'
      AND TRIM(n.Grup) = 'K.D.'
      AND CAST(n.Evrak_No AS CHAR) REGEXP '^[0-9]{5}$'
  `);
  const [collisions] = await db.query(`
    SELECT DISTINCT n.Evrak_No AS oldNo, ${targetExpression} AS newNo
    FROM NKR n
    WHERE n.Tarih >= '2026-01-01' AND n.Tarih < '2027-01-01'
      AND TRIM(n.Grup) = 'K.D.'
      AND CAST(n.Evrak_No AS CHAR) REGEXP '^[0-9]{5}$'
      AND EXISTS (SELECT 1 FROM NKR x WHERE x.Evrak_No = ${targetExpression})
    ORDER BY oldNo
  `);
  return { ...summary[0], collisionCount: collisions.length, collisions };
}

async function ensureBackupTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS EvrakNoMigrationAudit (
      MigrationKey VARCHAR(80) PRIMARY KEY,
      Status VARCHAR(20) NOT NULL,
      AppliedAt DATETIME NULL,
      RolledBackAt DATETIME NULL,
      Details JSON NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS EvrakNoMigration2026Nkr (
      NkrID INT PRIMARY KEY,
      OldEvrakNo INT NOT NULL,
      NewEvrakNo INT NOT NULL,
      INDEX IX_EvrakNoMigration2026Nkr_Old (OldEvrakNo),
      INDEX IX_EvrakNoMigration2026Nkr_New (NewEvrakNo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS EvrakNoMigration2026Doc (
      OldEvrakNo INT PRIMARY KEY,
      NewEvrakNo INT NOT NULL,
      IsMixed TINYINT(1) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS EvrakNoMigration2026Link (
      TableName VARCHAR(40) NOT NULL,
      RowID INT NOT NULL,
      OldEvrakNo VARCHAR(40) NOT NULL,
      NewEvrakNo VARCHAR(40) NOT NULL,
      PRIMARY KEY (TableName, RowID)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function apply() {
  const check = await inspect();
  if (check.collisionCount) throw new Error(`Hedef evrak no çakışması var: ${JSON.stringify(check.collisions)}`);
  if (!Number(check.kdRows)) throw new Error("Taşınacak 2026 K.D. kaydı bulunamadı.");

  await ensureBackupTables();
  const [existing] = await db.query("SELECT Status FROM EvrakNoMigrationAudit WHERE MigrationKey = ?", [MIGRATION_KEY]);
  if (existing.length) throw new Error(`Migration daha önce çalıştırılmış: ${existing[0].Status}`);

  await db.beginTransaction();
  try {
    await db.query("INSERT INTO EvrakNoMigrationAudit (MigrationKey, Status) VALUES (?, 'applying')", [MIGRATION_KEY]);
    await db.query(`
      INSERT INTO EvrakNoMigration2026Nkr (NkrID, OldEvrakNo, NewEvrakNo)
      SELECT n.ID, n.Evrak_No, ${targetExpression}
      FROM NKR n
      WHERE n.Tarih >= '2026-01-01' AND n.Tarih < '2027-01-01'
        AND TRIM(n.Grup) = 'K.D.'
        AND CAST(n.Evrak_No AS CHAR) REGEXP '^[0-9]{5}$'
    `);
    await db.query(`
      INSERT INTO EvrakNoMigration2026Doc (OldEvrakNo, NewEvrakNo, IsMixed)
      SELECT b.OldEvrakNo, MIN(b.NewEvrakNo),
        EXISTS(SELECT 1 FROM NKR o WHERE o.Evrak_No = b.OldEvrakNo AND TRIM(o.Grup) = 'Özel')
      FROM EvrakNoMigration2026Nkr b
      GROUP BY b.OldEvrakNo
    `);

    await db.query(`
      INSERT INTO EvrakNoMigration2026Link (TableName, RowID, OldEvrakNo, NewEvrakNo)
      SELECT 'ProformaNkr', p.ID, p.EvrakNo, CAST(b.NewEvrakNo AS CHAR)
      FROM ProformaNkr p
      INNER JOIN EvrakNoMigration2026Nkr b ON b.NkrID = p.NkrID
    `);
    for (const [table, column] of [["NKR_EvrakEslestirme", "EvrakNo"], ["Odeme", "Evrak_No"], ["ProformaBaslik", "EvrakNo"]]) {
      await db.query(`
        INSERT INTO EvrakNoMigration2026Link (TableName, RowID, OldEvrakNo, NewEvrakNo)
        SELECT ?, t.ID, CAST(t.${column} AS CHAR), CAST(d.NewEvrakNo AS CHAR)
        FROM ${table} t
        INNER JOIN EvrakNoMigration2026Doc d ON CAST(t.${column} AS CHAR) = CAST(d.OldEvrakNo AS CHAR)
        WHERE d.IsMixed = 0
      `, [table]);
    }

    await db.query("UPDATE NKR n INNER JOIN EvrakNoMigration2026Nkr b ON b.NkrID = n.ID SET n.Evrak_No = b.NewEvrakNo");
    await db.query("UPDATE ProformaNkr p INNER JOIN EvrakNoMigration2026Link b ON b.TableName='ProformaNkr' AND b.RowID=p.ID SET p.EvrakNo=b.NewEvrakNo");
    await db.query("UPDATE NKR_EvrakEslestirme t INNER JOIN EvrakNoMigration2026Link b ON b.TableName='NKR_EvrakEslestirme' AND b.RowID=t.ID SET t.EvrakNo=b.NewEvrakNo");
    await db.query("UPDATE Odeme t INNER JOIN EvrakNoMigration2026Link b ON b.TableName='Odeme' AND b.RowID=t.ID SET t.Evrak_No=b.NewEvrakNo");
    await db.query("UPDATE ProformaBaslik t INNER JOIN EvrakNoMigration2026Link b ON b.TableName='ProformaBaslik' AND b.RowID=t.ID SET t.EvrakNo=b.NewEvrakNo");

    const [backupCounts] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM EvrakNoMigration2026Nkr) AS nkrRows,
        (SELECT COUNT(*) FROM EvrakNoMigration2026Doc) AS documents,
        (SELECT COUNT(*) FROM EvrakNoMigration2026Doc WHERE IsMixed=1) AS mixedDocuments,
        (SELECT COUNT(*) FROM EvrakNoMigration2026Link) AS linkedRows
    `);
    await db.query(
      "UPDATE EvrakNoMigrationAudit SET Status='applied', AppliedAt=NOW(), Details=? WHERE MigrationKey=?",
      [JSON.stringify(backupCounts[0]), MIGRATION_KEY],
    );
    await db.commit();
    return { status: "applied", ...backupCounts[0] };
  } catch (error) {
    await db.rollback();
    throw error;
  }
}

async function rollback() {
  await ensureBackupTables();
  const [audit] = await db.query("SELECT Status FROM EvrakNoMigrationAudit WHERE MigrationKey = ?", [MIGRATION_KEY]);
  if (!audit.length || audit[0].Status !== "applied") {
    throw new Error(`Rollback için applied durumda migration bulunamadı (durum: ${audit[0]?.Status || "yok"}).`);
  }

  await db.beginTransaction();
  try {
    await db.query("UPDATE ProformaBaslik t INNER JOIN EvrakNoMigration2026Link b ON b.TableName='ProformaBaslik' AND b.RowID=t.ID SET t.EvrakNo=b.OldEvrakNo");
    await db.query("UPDATE Odeme t INNER JOIN EvrakNoMigration2026Link b ON b.TableName='Odeme' AND b.RowID=t.ID SET t.Evrak_No=b.OldEvrakNo");
    await db.query("UPDATE NKR_EvrakEslestirme t INNER JOIN EvrakNoMigration2026Link b ON b.TableName='NKR_EvrakEslestirme' AND b.RowID=t.ID SET t.EvrakNo=b.OldEvrakNo");
    await db.query("UPDATE ProformaNkr p INNER JOIN EvrakNoMigration2026Link b ON b.TableName='ProformaNkr' AND b.RowID=p.ID SET p.EvrakNo=b.OldEvrakNo");
    await db.query("UPDATE NKR n INNER JOIN EvrakNoMigration2026Nkr b ON b.NkrID=n.ID SET n.Evrak_No=b.OldEvrakNo");
    await db.query("UPDATE EvrakNoMigrationAudit SET Status='rolled_back', RolledBackAt=NOW() WHERE MigrationKey=?", [MIGRATION_KEY]);
    await db.commit();
    return { status: "rolled_back" };
  } catch (error) {
    await db.rollback();
    throw error;
  }
}

try {
  const result = mode === "dry-run" ? await inspect() : mode === "apply" ? await apply() : await rollback();
  console.log(JSON.stringify({ mode, ...result }, null, 2));
} finally {
  await db.end();
}
