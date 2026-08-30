import mysql from "mysql2/promise";

const mode = process.argv[2] || "dry-run";
const MIGRATION_KEY = "2026-kd-payment-copy-v1";
if (!new Set(["dry-run", "apply", "rollback"]).has(mode)) {
  throw new Error("Kullanım: node --env-file=.env.local scripts/sync-2026-kd-payment-status.mjs [dry-run|apply|rollback]");
}

const db = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  charset: "utf8mb4",
});

async function candidates() {
  const [rows] = await db.query(`
    SELECT o.ID AS SourceID, d.OldEvrakNo, d.NewEvrakNo,
           o.Odeme_Durumu, o.Fatura_ID, o.Banka, o.Tarih, o.Teklif
    FROM EvrakNoMigration2026Doc d
    INNER JOIN Odeme o ON CAST(o.Evrak_No AS CHAR) = CAST(d.OldEvrakNo AS CHAR)
    WHERE d.IsMixed = 1
      AND NOT EXISTS (
        SELECT 1 FROM Odeme n
        WHERE CAST(n.Evrak_No AS CHAR) = CAST(d.NewEvrakNo AS CHAR)
          AND COALESCE(n.Odeme_Durumu, '') = COALESCE(o.Odeme_Durumu, '')
          AND COALESCE(n.Fatura_ID, 0) = COALESCE(o.Fatura_ID, 0)
          AND COALESCE(n.Banka, '') = COALESCE(o.Banka, '')
          AND COALESCE(n.Tarih, '1900-01-01') = COALESCE(o.Tarih, '1900-01-01')
          AND COALESCE(n.Teklif, '') = COALESCE(o.Teklif, '')
      )
    ORDER BY d.OldEvrakNo, o.ID
  `);
  return rows;
}

async function ensureBackup() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS EvrakNoMigration2026PaymentCopy (
      SourceID INT PRIMARY KEY,
      NewID INT NOT NULL UNIQUE,
      OldEvrakNo VARCHAR(50) NOT NULL,
      NewEvrakNo VARCHAR(50) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function apply() {
  await ensureBackup();
  const [audit] = await db.query("SELECT Status FROM EvrakNoMigrationAudit WHERE MigrationKey=?", [MIGRATION_KEY]);
  if (audit.length) throw new Error(`Ödeme eşlemesi daha önce çalıştırılmış: ${audit[0].Status}`);
  const rows = await candidates();
  await db.beginTransaction();
  try {
    await db.query("INSERT INTO EvrakNoMigrationAudit (MigrationKey,Status) VALUES (?,'applying')", [MIGRATION_KEY]);
    for (const row of rows) {
      const [result] = await db.query(
        `INSERT INTO Odeme (Evrak_No, Odeme_Durumu, Fatura_ID, Banka, Tarih, Teklif)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [String(row.NewEvrakNo), row.Odeme_Durumu, row.Fatura_ID, row.Banka, row.Tarih, row.Teklif],
      );
      await db.query(
        `INSERT INTO EvrakNoMigration2026PaymentCopy (SourceID,NewID,OldEvrakNo,NewEvrakNo)
         VALUES (?,?,?,?)`,
        [row.SourceID, result.insertId, String(row.OldEvrakNo), String(row.NewEvrakNo)],
      );
    }
    const details = { copiedRows: rows.length, affectedDocuments: new Set(rows.map(r => String(r.NewEvrakNo))).size };
    await db.query("UPDATE EvrakNoMigrationAudit SET Status='applied',AppliedAt=NOW(),Details=? WHERE MigrationKey=?", [JSON.stringify(details), MIGRATION_KEY]);
    await db.commit();
    return { status: "applied", ...details };
  } catch (error) {
    await db.rollback();
    throw error;
  }
}

async function rollback() {
  await ensureBackup();
  const [audit] = await db.query("SELECT Status FROM EvrakNoMigrationAudit WHERE MigrationKey=?", [MIGRATION_KEY]);
  if (!audit.length || audit[0].Status !== "applied") throw new Error("Rollback için applied durumda ödeme eşlemesi bulunamadı.");
  await db.beginTransaction();
  try {
    await db.query("DELETE o FROM Odeme o INNER JOIN EvrakNoMigration2026PaymentCopy b ON b.NewID=o.ID");
    await db.query("UPDATE EvrakNoMigrationAudit SET Status='rolled_back',RolledBackAt=NOW() WHERE MigrationKey=?", [MIGRATION_KEY]);
    await db.commit();
    return { status: "rolled_back" };
  } catch (error) {
    await db.rollback();
    throw error;
  }
}

try {
  const result = mode === "dry-run"
    ? { candidates: (await candidates()).length }
    : mode === "apply" ? await apply() : await rollback();
  console.log(JSON.stringify({ mode, ...result }, null, 2));
} finally {
  await db.end();
}
