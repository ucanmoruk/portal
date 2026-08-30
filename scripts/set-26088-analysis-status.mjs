import mysql from "mysql2/promise";

const db = await mysql.createConnection({
  host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE, charset: "utf8mb4",
});
try {
  await db.query(`CREATE TABLE IF NOT EXISTS Evrak26088RaporDurumBackup (
    NkrID BIGINT PRIMARY KEY, OldRaporDurumu VARCHAR(100) NULL,
    NewRaporDurumu VARCHAR(100) NOT NULL, ChangedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.beginTransaction();
  await db.query(`INSERT IGNORE INTO Evrak26088RaporDurumBackup (NkrID,OldRaporDurumu,NewRaporDurumu)
    SELECT ID,Rapor_Durumu,'Analiz Aşamasında' FROM NKR WHERE Evrak_No=26088 AND Durum='Aktif'`);
  const [result] = await db.query("UPDATE NKR SET Rapor_Durumu='Analiz Aşamasında' WHERE Evrak_No=26088 AND Durum='Aktif'");
  await db.commit();
  const [check] = await db.query("SELECT COUNT(*) total, SUM(Rapor_Durumu='Analiz Aşamasında') analysisCount FROM NKR WHERE Evrak_No=26088 AND Durum='Aktif'");
  console.log({ changedRows: result.affectedRows, ...check[0] });
} catch (error) { await db.rollback(); throw error; }
finally { await db.end(); }
