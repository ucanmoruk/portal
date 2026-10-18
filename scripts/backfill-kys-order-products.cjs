// Dry-run by default. Existing inventory quantities and historical shipments stay unchanged.
require("./register-local-ts.cjs");
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
async function main() {
  const store = require("../lib/kysStore.ts");
  const { hasMysqlConfig } = require("../lib/mysqlCompat.ts");
  await store.ensureKysSchema();
  const base = await require("../lib/db.ts").cosmoPool;
  const apply = process.argv.includes("--apply");
  const tx = apply ? await base.transaction() : null;
  if (tx) await tx.begin();
  const pool = tx || base;
  const output = path.resolve("outputs/kys-order-products-2026-10-18");
  fs.mkdirSync(output, { recursive: true });
  const file = path.join(output, `${apply ? "apply" : "plan"}-${Date.now()}.json`);
  let committed = false;
  try {
    if (tx) await tx.request().query(hasMysqlConfig() ? "SELECT ID FROM KysTalep WHERE Seri IN ('Spektrotek','Root') AND TalepTuru='Sipariş' AND Durum<>'Silindi' ORDER BY ID FOR UPDATE" : "SELECT ID FROM KysTalep WITH (UPDLOCK,HOLDLOCK) WHERE Seri IN ('Spektrotek','Root') AND TalepTuru='Sipariş' AND Durum<>'Silindi' ORDER BY ID");
    const before = (await pool.request().query("SELECT ID,Kod,Kaynak,StokMiktari FROM KysStokKart ORDER BY ID")).recordset;
    const lines = (await pool.request().query("SELECT t.ID AS TalepID,t.TalepNo,t.Seri,k.ID,k.StokID,k.Kod,k.MalzemeAdi,k.Birim,k.Ozellik,k.Marka,s.ID AS ExistingID FROM KysTalepKalem k JOIN KysTalep t ON t.ID=k.TalepID LEFT JOIN KysStokKart s ON s.ID=k.StokID WHERE t.Seri IN ('Spektrotek','Root') AND t.TalepTuru='Sipariş' AND t.Durum<>'Silindi' AND (s.ID IS NULL OR s.Kaynak NOT IN ('Spektrotek','Root')) ORDER BY t.ID,k.ID")).recordset;
    const audit = { status: "planned", apply, before, lines, results: [] };
    fs.writeFileSync(file, JSON.stringify(audit, null, 2));
    if (tx) {
      for (const line of lines) {
        const product = await store.ensureKysOrderProduct(tx, line.Seri, { stokId: line.ExistingID, kod: line.Kod, malzemeAdi: line.MalzemeAdi, birim: line.Birim, ozellik: line.Ozellik, marka: line.Marka }, `${line.Seri === "Root" ? "ROOT" : "SPK"}-ORDER-${line.TalepID}-${line.ID}`);
        await tx.request().input("ID", line.ID).input("Stock", product.id).input("Code", product.kod).query("UPDATE KysTalepKalem SET StokID=@Stock,Kod=@Code WHERE ID=@ID");
        // Historical manual acceptances have no stock movement; retain that audit fact.
        audit.results.push({ lineId: line.ID, orderNo: line.TalepNo, ...product });
      }
      const after = (await tx.request().query("SELECT ID,Kod,Kaynak,StokMiktari FROM KysStokKart ORDER BY ID")).recordset;
      for (const stock of before) assert.equal(Number(after.find(row => row.ID === stock.ID).StokMiktari), Number(stock.StokMiktari));
      for (const stock of after.filter(row => !before.some(old => old.ID === row.ID))) assert.equal(Number(stock.StokMiktari), 0);
      audit.status = "verified-before-commit";
      fs.writeFileSync(file, JSON.stringify(audit, null, 2));
      await tx.commit(); committed = true;
      audit.status = "committed";
      fs.writeFileSync(file, JSON.stringify(audit, null, 2));
    }
    console.log(JSON.stringify({ applied: apply, affectedLines: lines.length, createdProducts: audit.results.filter(row => row.created).length, linkedLines: audit.results.length, auditFile: file }, null, 2));
  } catch (error) { if (tx && !committed) await tx.rollback(); throw error; }
}
const timer = setTimeout(() => process.exit(1), 180000);
main().then(() => { clearTimeout(timer); process.exit(0); }).catch(error => { console.error(error.message); clearTimeout(timer); process.exit(1); });
