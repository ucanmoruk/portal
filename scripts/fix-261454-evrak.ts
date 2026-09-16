import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { cosmoPool } = await import("../lib/db");
  const { syncNkrCommercialReferences } = await import("../lib/nkrCommercialReferenceSync");
  const pool = await cosmoPool;
  const tx = await pool.transaction();
  await tx.begin();
  try {
    const rows = (await tx.request().input("old", "261454").query(`
      SELECT ID, Evrak_No, RaporNo, Revno, Rapor_Durumu FROM NKR WHERE Evrak_No = @old ORDER BY ID
    `)).recordset;
    console.log(JSON.stringify({ records: rows }));
    if (!process.argv.includes("--apply")) { await tx.rollback(); return; }
    if (rows.length !== 3) throw new Error(`Beklenen 3 kayıt yerine ${rows.length} kayıt bulundu; işlem durduruldu.`);
    for (const row of rows) {
      await tx.request().input("id", row.ID).input("next", "261445").query(`UPDATE NKR SET Evrak_No = @next WHERE ID = @id`);
      await syncNkrCommercialReferences(tx, Number(row.ID),
        { evrakNo: row.Evrak_No, raporNo: row.RaporNo },
        { evrakNo: "261445", raporNo: row.RaporNo });
      const after = (await tx.request().input("id", row.ID).query(`SELECT RaporNo, Revno, Rapor_Durumu FROM NKR WHERE ID = @id`)).recordset[0];
      for (const key of ["RaporNo", "Revno", "Rapor_Durumu"]) {
        if (String(after[key] ?? "") !== String(row[key] ?? "")) throw new Error(`${row.ID}: ${key} değişti, işlem geri alındı.`);
      }
    }
    await tx.commit();
    console.log("3 kaydın Evrak No değeri 261445 olarak güncellendi.");
  } catch (error) { await tx.rollback(); throw error; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
