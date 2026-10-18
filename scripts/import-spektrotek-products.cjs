// Explicit one-off catalogue import. Dry run by default; --apply writes atomically.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Module = require("node:module");
const ts = require("typescript");
require("@next/env").loadEnvConfig(process.cwd());
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return resolve.call(this, name.startsWith("@/") ? path.resolve(process.cwd(), name.slice(2)) : name, ...args);
};
require.extensions[".ts"] = function (mod, filename) {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
};

const batchId = "spektrotek-2026-10-18";
const inputPath = path.resolve(`data/imports/${batchId}/products.json`);
const outputPath = path.resolve(`outputs/${batchId}`);
const sourceBytes = fs.readFileSync(inputPath);
const sourceHash = crypto.createHash("sha256").update(sourceBytes).digest("hex");
const rows = JSON.parse(sourceBytes.toString("utf8"));
const apply = process.argv.includes("--apply");
const { normalizeKysProduct, emptyKysProduct, readKysProduct } = require("../lib/kysProduct.ts");

function productInput(row) {
  return normalizeKysProduct({
    ...emptyKysProduct,
    kategori: row.category, marka: row.brand, urunAciklamasi: row.description,
    // Keep the original user price verbatim. No range midpoint, currency conversion or tax assumption.
    referansFiyat: row.originalPrice,
    icNotlar: row.internalNote,
    arastirmaKaynaklari: row.researchSources,
    aktarimKimligi: `${batchId}:${String(row.no).padStart(3, "0")}`,
    webSlug: row.slug, webSecili: false,
    paraBirimi: row.originalPrice.includes("$") ? "USD" : row.originalPrice.includes("TRY") ? "TRY" : "EUR",
  }, "Spektrotek");
}

function validate() {
  if (rows.length !== 67 || rows.some((row, index) => row.no !== index + 1)) throw Error("Expected 67 consecutively numbered parent products.");
  if (new Set(rows.map(row => row.code.toUpperCase())).size !== rows.length) throw Error("Duplicate stock code.");
  if (new Set(rows.map(row => row.slug)).size !== rows.length) throw Error("Duplicate web slug.");
  for (const row of rows) {
    if (row.source !== "Spektrotek" || !row.name || !row.turkishName || !row.code || row.researchStatus === "pending") throw Error(`Incomplete row ${row.no}`);
    if (!Number.isInteger(row.quantity) || row.quantity <= 0) throw Error(`Invalid quantity in row ${row.no}`);
    if (row.code.length > 80 || row.name.length > 220 || row.turkishName.length > 220 || row.location.length > 220) throw Error(`Stock column limit exceeded in row ${row.no}`);
    if (row.description && !row.researchSources.length && !row.kitContents) throw Error(`Description without evidence in row ${row.no}`);
    if (!row.description && row.turkishName !== row.name) throw Error(`Unverified product name changed in row ${row.no}`);
    productInput(row);
  }
  const children = rows.flatMap(row => row.kitContents || []);
  if (children.length !== 6 || rows.some(row => children.some(part => part.code === row.code))) throw Error("Kit components must stay inside the parent description.");
}

function planImport(current) {
  return rows.map(row => {
    const imported = current.find(stock => readKysProduct(stock.UrunBilgileri).aktarimKimligi === productInput(row).aktarimKimligi);
    const sameCode = current.find(stock => stock.Kod.toUpperCase() === row.code.toUpperCase());
    if (imported && (imported.Kod !== row.code || imported.Kaynak !== "Spektrotek")) throw Error(`Imported identity changed for row ${row.no}; manual review required.`);
    if (!imported && sameCode) throw Error(`Row ${row.no}: existing code collision; no existing stock will be overwritten.`);
    return { no: row.no, code: row.code, action: imported ? "skip" : "create", id: imported?.ID || null };
  });
}

async function main() {
  validate();
  const store = require("../lib/kysStore.ts");
  const { cosmoPool } = require("../lib/db.ts");
  const { hasMysqlConfig } = require("../lib/mysqlCompat.ts");
  await store.ensureKysSchema();
  const pool = await cosmoPool;
  const tx = apply ? await pool.transaction() : null;
  if (tx) await tx.begin();
  const executor = tx || pool;
  let committed = false;
  try {
    const select = "SELECT ID,Kod,Kaynak,Ad,Name,Birim,StokMiktari,StokDurumu,MalzemeTuru,SaklamaKosullari,UrunBilgileri FROM KysStokKart";
    const current = (await executor.request().query(!tx ? `${select} ORDER BY ID` : hasMysqlConfig() ? `${select} ORDER BY ID FOR UPDATE` : `${select} WITH (UPDLOCK,HOLDLOCK) ORDER BY ID`)).recordset;
    const plan = planImport(current);
    const deposit = (await executor.request().query("SELECT ID FROM KysLaboratuvarBirim WHERE Ad='Depo' AND Durum='Aktif'")).recordset;
    if (deposit.length !== 1) throw Error("Expected one active Depo inventory unit.");
    fs.mkdirSync(outputPath, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const auditFile = path.join(outputPath, `${apply ? "apply" : "plan"}-${stamp}.json`);
    const audit = { batchId, sourceHash, createdAt: new Date().toISOString(), apply, status: apply ? "pending" : "planned", before: current, plan };
    fs.writeFileSync(auditFile, JSON.stringify(audit, null, 2));
    if (tx) {
      for (const entry of plan) {
        if (entry.action === "skip") continue;
        const row = rows[entry.no - 1];
        const id = await store.createKysStock({
          kaynak: "Spektrotek", kod: row.code, ad: row.turkishName, name: row.name,
          malzemeTuru: row.category, saklamaKosullari: row.location,
          stokDurumu: row.stockStatus, birim: "Adet", urun: productInput(row),
        }, tx);
        if (!id) throw Error(`No ID returned for row ${row.no}`);
        entry.id = id;
        await store.createKysStockMovement(id, {
          hareketTipi: "Giriş", miktar: row.quantity, birim: "Adet", marka: row.brand,
          hedefBirimId: Number(deposit[0].ID),
          aciklama: `${batchId} / satır ${row.no}: kullanıcı envanteri başlangıç miktarı; paket içi adetle çarpılmamıştır.`,
          kullaniciAd: "Spektrotek envanter aktarımı",
        }, tx);
      }
      // Verify totals, source and original Name before committing any row.
      const verified = (await tx.request().query("SELECT ID,Kod,Kaynak,Name,StokMiktari,UrunBilgileri FROM KysStokKart WHERE Kaynak='Spektrotek'")).recordset;
      for (const entry of plan) {
        const row = rows[entry.no - 1];
        const stock = verified.find(item => item.ID === entry.id);
        if (!stock || stock.Name !== row.name || stock.Kaynak !== "Spektrotek" || readKysProduct(stock.UrunBilgileri).webSlug !== row.slug) throw Error(`Verification failed for row ${row.no}`);
        if (entry.action === "create" && Number(stock.StokMiktari) !== row.quantity) throw Error(`Inventory quantity mismatch at row ${row.no}`);
      }
      // Save assigned identities before commit, so an interrupted response can be reconciled.
      audit.status = "verified-before-commit";
      fs.writeFileSync(auditFile, JSON.stringify(audit, null, 2));
      await tx.commit();
      committed = true;
      audit.status = "committed";
      fs.writeFileSync(auditFile, JSON.stringify(audit, null, 2));
    }
    const summary = { batchId, sourceHash, applied: apply, created: plan.filter(item => item.action === "create").length, skipped: plan.filter(item => item.action === "skip").length, parentProducts: rows.length, kitComponents: 6, quantityTotal: rows.reduce((sum, row) => sum + row.quantity, 0), auditFile };
    fs.writeFileSync(path.join(outputPath, "latest-result.json"), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    if (tx && !committed) await tx.rollback();
    throw error;
  }
}

if (require.main === module) {
  const timer = setTimeout(() => { console.error("IMPORT_TIMEOUT"); process.exit(1); }, 180000);
  main().then(() => { clearTimeout(timer); process.exit(0); }).catch(error => { console.error(error.message); clearTimeout(timer); process.exit(1); });
}

module.exports = { validate, productInput, planImport, rows };
