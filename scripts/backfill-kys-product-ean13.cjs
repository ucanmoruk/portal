// Dry-run by default. Ürün kartlarında (Spektrotek/Root) EAN-13 olmayan barkodları yeni EAN-13 ile değiştirir.
// Eski barkod ürün kodunun aynısı olduğundan kod ile arama etkilenmez; eski değerler denetim dosyasında saklanır.
require("./register-local-ts.cjs");
const fs = require("node:fs"), path = require("node:path");
async function main() {
  const { isValidEan13 } = require("../lib/kysStore.ts");
  const base = await require("../lib/db.ts").cosmoPool;
  const apply = process.argv.includes("--apply");
  const tx = apply ? await base.transaction() : null;
  if (tx) await tx.begin();
  const pool = tx || base;
  const output = path.resolve("outputs/kys-product-ean13-2026-10-18");
  fs.mkdirSync(output, { recursive: true });
  const file = path.join(output, `${apply ? "apply" : "plan"}-${Date.now()}.json`);
  let committed = false;
  try {
    const rows = (await pool.request().query("SELECT ID,Kaynak,Kod,Barkod FROM KysStokKart ORDER BY ID")).recordset;
    const used = new Set(rows.map(row => row.Barkod).filter(Boolean));
    const changes = [];
    for (const row of rows.filter(r => r.Kaynak !== "Unique" && !isValidEan13(String(r.Barkod || "")))) {
      let next;
      do {
        const digits = `869${String(Date.now()).slice(-7)}${String(Math.floor(Math.random() * 100)).padStart(2, "0")}`;
        let sum = 0;
        for (let i = 0; i < 12; i += 1) sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3);
        next = `${digits}${(10 - (sum % 10)) % 10}`;
      } while (used.has(next));
      used.add(next);
      changes.push({ id: row.ID, kaynak: row.Kaynak, kod: row.Kod, eskiBarkod: row.Barkod, yeniBarkod: next });
    }
    const audit = { status: "planned", apply, changes };
    fs.writeFileSync(file, JSON.stringify(audit, null, 2));
    if (tx) {
      for (const change of changes) {
        await tx.request().input("ID", change.id).input("Old", change.eskiBarkod).input("New", change.yeniBarkod)
          .query("UPDATE KysStokKart SET Barkod=@New, UpdatedAt=GETDATE() WHERE ID=@ID AND Barkod=@Old");
      }
      await tx.commit(); committed = true;
      audit.status = "committed";
      fs.writeFileSync(file, JSON.stringify(audit, null, 2));
    }
    console.log(JSON.stringify({ applied: apply, changed: changes.length, auditFile: file }, null, 2));
  } catch (error) { if (tx && !committed) await tx.rollback(); throw error; }
}
main().then(() => process.exit(0)).catch(error => { console.error(error.message); process.exit(1); });
