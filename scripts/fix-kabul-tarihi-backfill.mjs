// Toplu backfill ile yanlış dolan NKR_LabKabul.KabulTarihi'leri düzeltir.
// Kriter: NKR.Tarih ile KabulTarihi arasında > 30 gün fark var ve KabulTarihi
// daha yeni → KabulTarihi muhtemelen geç-backfill kaynaklı. NKR.Tarih ile değiştir.
// Idempotent — düzeltilmiş kayıtlar tekrar çalıştırılırsa atlanır.
import mssql from "mssql";

const APPLY = process.argv.includes("--apply");
const db = process.env.MSSQL_COSMO_DB || "massgrup_cosmo";
const config = {
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: db,
  server: process.env.DB_SERVER, port: 1433,
  connectionTimeout: 30000, requestTimeout: 60000,
  options: { encrypt: true, trustServerCertificate: true },
};
if (!config.server || !config.user) { console.error("DB_SERVER/USER/PASSWORD yok."); process.exit(1); }

const pool = await new mssql.ConnectionPool(config).connect();
console.log(`MSSQL ${db} | Mod: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);

// Etkilenecek kayıtlar — gap > 30 gün
const candidates = await pool.request().query(`
  SELECT lk.ID,
    lk.NkrID, lk.RaporFormati,
    CONVERT(varchar(10), lk.KabulTarihi, 23) AS EskiKabul,
    CONVERT(varchar(10), n.Tarih, 23) AS YeniKabul,
    DATEDIFF(day, n.Tarih, lk.KabulTarihi) AS GapGun
  FROM NKR_LabKabul lk
  INNER JOIN NKR n ON n.ID = lk.NkrID
  WHERE n.Tarih IS NOT NULL
    AND DATEDIFF(day, n.Tarih, lk.KabulTarihi) > 30
`);

console.log(`Düzeltilecek kayıt: ${candidates.recordset.length}`);
if (candidates.recordset.length === 0) {
  console.log("✅ Yapacak iş yok."); await pool.close(); process.exit(0);
}
console.log("\nÖrnek (ilk 5):");
console.table(candidates.recordset.slice(0, 5));

if (!APPLY) {
  console.log("\n[DRY-RUN] --apply ile uygula.");
  await pool.close(); process.exit(0);
}

const ids = candidates.recordset.map(r => r.ID);
const CHUNK = 500;
let done = 0;
for (let i = 0; i < ids.length; i += CHUNK) {
  const chunk = ids.slice(i, i + CHUNK);
  await pool.request().query(`
    UPDATE lk
    SET KabulTarihi = n.Tarih
    FROM NKR_LabKabul lk
    INNER JOIN NKR n ON n.ID = lk.NkrID
    WHERE lk.ID IN (${chunk.join(",")})
      AND n.Tarih IS NOT NULL
      AND DATEDIFF(day, n.Tarih, lk.KabulTarihi) > 30
  `);
  done += chunk.length;
  console.log(`  ${done}/${ids.length}`);
}
console.log(`\n✅ ${done} kayıt güncellendi.`);
await pool.close();
