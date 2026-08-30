import mysql from "mysql2/promise";

const mode = process.argv[2] || "dry-run";
const KEY = "2026-ozel-rapor-v1";
if (!new Set(["dry-run", "apply", "verify", "rollback"]).has(mode)) throw new Error("Geçersiz mod");

const db = await mysql.createConnection({
  host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE, charset: "utf8mb4",
});

async function ensureTables() {
  await db.query(`CREATE TABLE IF NOT EXISTS EvrakNoMigrationAudit (
    MigrationKey VARCHAR(100) PRIMARY KEY, Status VARCHAR(30) NOT NULL,
    AppliedAt DATETIME NULL, RolledBackAt DATETIME NULL, Details JSON NULL
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS RaporNoMigration2026Ozel (
    NkrID BIGINT PRIMARY KEY, OldRaporNo VARCHAR(60) NOT NULL, NewRaporNo VARCHAR(60) NOT NULL UNIQUE,
    EvrakNo VARCHAR(50) NULL, OldEvrakNo VARCHAR(50) NULL,
    OldRaporDurumu VARCHAR(100) NULL, ProtectedHash CHAR(64) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const [hashColumn] = await db.query(`SELECT 1 FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name='RaporNoMigration2026Ozel' AND column_name='ProtectedHash'`);
  if (!hashColumn.length) await db.query("ALTER TABLE RaporNoMigration2026Ozel ADD ProtectedHash CHAR(64) NULL");
}

async function prepare() {
  await db.query("DELETE FROM RaporNoMigration2026Ozel");
  await db.query("SET @rapor_seq := 261055");
  await db.query(`
    INSERT INTO RaporNoMigration2026Ozel
      (NkrID, OldRaporNo, NewRaporNo, EvrakNo, OldEvrakNo, OldRaporDurumu, ProtectedHash)
    SELECT n.ID, CAST(n.RaporNo AS CHAR), CAST((@rapor_seq := @rapor_seq + 1) AS CHAR),
      CAST(n.Evrak_No AS CHAR), em.OldEvrakNo, n.Rapor_Durumu,
      SHA2(CONCAT_WS('|', IFNULL(CAST(n.Evrak_No AS CHAR),'<NULL>'), IFNULL(n.Rapor_Durumu,'<NULL>'),
        IFNULL(n.Grup,'<NULL>'), IFNULL(n.Durum,'<NULL>'), IFNULL(CAST(n.Firma_ID AS CHAR),'<NULL>'),
        IFNULL(n.Numune_Adi,'<NULL>'), IFNULL(DATE_FORMAT(n.Tarih,'%Y-%m-%d %H:%i:%s.%f'),'<NULL>')),256)
    FROM NKR n
    LEFT JOIN EvrakNoMigration2026OzelDoc em ON em.NewEvrakNo = CAST(n.Evrak_No AS CHAR)
    WHERE n.Tarih >= '2026-07-01' AND n.Tarih < '2027-01-01'
      AND TRIM(n.Grup) = 'Özel' AND n.Durum = 'Aktif'
    ORDER BY n.Tarih, n.ID
  `);
}

async function inspect() {
  const [rows] = await db.query(`SELECT COUNT(*) AS sampleCount, MIN(CAST(NewRaporNo AS UNSIGNED)) AS firstNo,
    MAX(CAST(NewRaporNo AS UNSIGNED)) AS lastNo FROM RaporNoMigration2026Ozel`);
  const [protectedRows] = await db.query(`
    SELECT
      SUM(NOT (n.Evrak_No <=> m.EvrakNo)) AS changedEvrak,
      SUM(BINARY m.ProtectedHash <> BINARY SHA2(CONCAT_WS('|',
        IFNULL(CAST(n.Evrak_No AS CHAR),'<NULL>'), IFNULL(n.Rapor_Durumu,'<NULL>'),
        IFNULL(n.Grup,'<NULL>'), IFNULL(n.Durum,'<NULL>'), IFNULL(CAST(n.Firma_ID AS CHAR),'<NULL>'),
        IFNULL(n.Numune_Adi,'<NULL>'), IFNULL(DATE_FORMAT(n.Tarih,'%Y-%m-%d %H:%i:%s.%f'),'<NULL>')),256)) AS changedProtectedFields
    FROM RaporNoMigration2026Ozel m INNER JOIN NKR n ON n.ID=m.NkrID
  `);
  return { ...rows[0], changedEvrak: Number(protectedRows[0].changedEvrak || 0), changedProtectedFields: Number(protectedRows[0].changedProtectedFields || 0) };
}

async function verify() {
  const summary = await inspect();
  const [mismatch] = await db.query(`SELECT COUNT(*) AS count FROM RaporNoMigration2026Ozel m
    INNER JOIN NKR n ON n.ID=m.NkrID WHERE CAST(n.RaporNo AS CHAR) <> m.NewRaporNo`);
  const [external] = await db.query(`SELECT
    (SELECT COUNT(*) FROM NKR_RaporOnay ro INNER JOIN RaporNoMigration2026Ozel m ON m.NkrID=ro.NkrID
      WHERE ro.DisRaporKodu LIKE 'ÜGAM%') AS ugamRows,
    (SELECT COUNT(*) FROM Odeme o INNER JOIN (SELECT DISTINCT EvrakNo FROM RaporNoMigration2026Ozel) m
      ON CAST(o.Evrak_No AS CHAR)=m.EvrakNo) AS paymentRows`);
  if (summary.changedEvrak || summary.changedProtectedFields || Number(mismatch[0].count || 0)) throw new Error("Korunan alan doğrulaması başarısız.");
  return { ...summary, reportNumberMismatch: 0, ...external[0] };
}

async function apply() {
  const [audit] = await db.query("SELECT Status FROM EvrakNoMigrationAudit WHERE MigrationKey=?", [KEY]);
  if (audit[0]?.Status === "applied") throw new Error("Rapor numarası dönüşümü zaten uygulanmış.");
  await db.beginTransaction();
  try {
    await db.query(`INSERT INTO EvrakNoMigrationAudit (MigrationKey,Status) VALUES (?,'applying')
      ON DUPLICATE KEY UPDATE Status='applying',AppliedAt=NULL,RolledBackAt=NULL,Details=NULL`, [KEY]);
    await prepare();
    const [collision] = await db.query(`SELECT COUNT(*) AS count FROM NKR n INNER JOIN RaporNoMigration2026Ozel m
      ON CAST(n.RaporNo AS CHAR)=m.NewRaporNo LEFT JOIN RaporNoMigration2026Ozel own ON own.NkrID=n.ID WHERE own.NkrID IS NULL`);
    if (Number(collision[0].count || 0)) throw new Error("Hedef rapor numaralarında çakışma var.");
    await db.query("UPDATE NKR n INNER JOIN RaporNoMigration2026Ozel m ON m.NkrID=n.ID SET n.RaporNo=m.NewRaporNo");
    const details = await verify();
    await db.query("UPDATE EvrakNoMigrationAudit SET Status='applied',AppliedAt=NOW(),Details=? WHERE MigrationKey=?", [JSON.stringify(details), KEY]);
    await db.commit();
    return details;
  } catch (error) { await db.rollback(); throw error; }
}

async function rollback() {
  await db.beginTransaction();
  try {
    await db.query("UPDATE NKR n INNER JOIN RaporNoMigration2026Ozel m ON m.NkrID=n.ID SET n.RaporNo=m.OldRaporNo");
    await db.query("UPDATE EvrakNoMigrationAudit SET Status='rolled_back',RolledBackAt=NOW() WHERE MigrationKey=?", [KEY]);
    await db.commit();
    return await inspect();
  } catch (error) { await db.rollback(); throw error; }
}

try {
  await ensureTables();
  if (mode === "dry-run") { await db.beginTransaction(); await prepare(); console.log(await inspect()); await db.rollback(); }
  else if (mode === "apply") console.log(await apply());
  else if (mode === "verify") console.log(await verify());
  else console.log(await rollback());
} finally { await db.end(); }
