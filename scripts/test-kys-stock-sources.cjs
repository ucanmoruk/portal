const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
function compile(file, imports) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: mod, exports: mod.exports, require: name => imports[name] || {}, console, Buffer, URL });
  return mod.exports;
}
const sources = compile('lib/kysStockSources.ts', {});
const products = compile('lib/kysProduct.ts', {});
let mysql = true;
let calls = [];
const storedProduct = { ...products.emptyKysProduct, kategori: 'Kolonlar', satisFiyati: 12.5 };
const pool = { request() { const params = {}; return { input(k, v) { params[k] = v; return this; }, async query(sql) {
  calls.push({ sql, params });
  return { recordset: sql.startsWith('SELECT Kaynak, UrunBilgileri') ? [{ Kaynak: 'Root', UrunBilgileri: JSON.stringify(storedProduct) }] : sql.includes('COUNT(*)') ? [{ total: 0 }] : sql.includes('OUTPUT INSERTED.ID') ? [{ ID: 1 }] : [], rowsAffected: [1] };
} }; } };
function store() { return compile('lib/kysStore.ts', { '@/lib/db': { cosmoPool: Promise.resolve(pool) }, '@/lib/mysqlCompat': { hasMysqlConfig: () => mysql }, '@/lib/kysStockSources': sources, '@/lib/kysProduct': products }); }
(async () => {
  assert.equal(sources.kysStockSource(undefined, 'Spektrotek'), 'Spektrotek');
  assert.equal(sources.kysStockSource(undefined, 'Sarf'), 'Unique');
  assert.throws(() => sources.kysStockSource('Invalid'), /Geçersiz/);
  for (mysql of [true, false]) {
    calls = [];
    const api = store();
    await api.ensureKysSchema();
    const backfill = calls.find(c => c.sql.startsWith('UPDATE KysStokKart SET Kaynak'));
    assert.ok(backfill.sql.includes("WHEN MalzemeTuru = 'Spektrotek' THEN 'Spektrotek' ELSE 'Unique'"));
    assert.ok(backfill.sql.includes("WHERE Kaynak IS NULL OR Kaynak = ''"));
    assert.equal(api.isValidEan13('8696650660163'), true);
    assert.equal(api.isValidEan13('8696650660164'), false);
    await assert.rejects(api.createKysStock({ kod: 'A', ad: 'Stock', barkod: '123', kaynak: 'Root', urun: storedProduct }), /EAN-13/);
    await api.createKysStock({ kod: 'A', ad: 'Stock', barkod: '8696650660163', kaynak: 'Root', urun: storedProduct });
    const insert = calls.find(c => c.sql.includes('INSERT INTO KysStokKart'));
    assert.equal(insert.params.Kaynak, 'Root');
    assert.equal(insert.params.Barkod, '8696650660163');
    assert.equal(JSON.parse(insert.params.UrunBilgileri).satisFiyati, 12.5);
    await api.createKysStock({ kod: 'B', ad: 'Stock', barkod: 'B-OLD', kaynak: 'Unique' });
    assert.equal(calls.filter(c => c.sql.includes('INSERT INTO KysStokKart')).at(-1).params.Barkod, 'B-OLD');
    await api.updateKysStock(1, { kod: 'A', ad: 'Stock' });
    const update = calls.find(c => c.sql.includes('SET UrunBilgileri ='));
    assert.ok(api.isValidEan13(update.params.Barkod), 'empty product barcode gets generated EAN-13');
    assert.equal(update.params.Kaynak, null);
    assert.equal(JSON.parse(update.params.UrunBilgileri).kategori, 'Kolonlar');
    await api.listKysStocks({ kaynak: 'Root', allowedFirmalar: ['Root'] });
    let list = calls.filter(c => c.sql.includes('COUNT(*)')).at(-1);
    assert.ok(list.sql.includes("Kaynak IN ('Root')"));
    assert.equal(list.params.kaynak, 'Root');
    await api.listKysStocks({ liste: 'stok', allowedFirmalar: ['Unique', 'Root', 'Spektrotek'] });
    list = calls.filter(c => c.sql.includes('COUNT(*)')).at(-1);
    assert.ok(list.sql.includes("AND Kaynak = 'Unique'"));
    await api.listKysStocks({ liste: 'urun', allowedFirmalar: ['Unique', 'Root', 'Spektrotek'] });
    list = calls.filter(c => c.sql.includes('COUNT(*)')).at(-1);
    assert.ok(list.sql.includes("AND Kaynak IN ('Root','Spektrotek')"));
    await api.listKysStocks({ allowedFirmalar: [] });
    list = calls.filter(c => c.sql.includes('COUNT(*)')).at(-1);
    assert.ok(list.sql.includes('AND 1 = 0'));
    await api.listKysStocks({ allowedFirmalar: ['Unique', 'Root', 'Spektrotek'] });
    list = calls.filter(c => c.sql.includes('COUNT(*)')).at(-1);
    assert.ok(!list.sql.includes("AND Kaynak = 'Unique'"));
    assert.ok(list.sql.includes("'Unique','Root','Spektrotek'"));
  }
  console.log('PASS: MySQL/MSSQL source backfill, same-record product persistence, stock/product separation, shared picker and fail-closed source access.');
})().catch(e => { console.error(e); process.exitCode = 1; });
