const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
function compile(file, imports = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: mod, exports: mod.exports, require: name => imports[name] || {}, console, Buffer, Response, Request, File, URL });
  return mod.exports;
}
const products = compile('lib/kysProduct.ts');
const draft = { ...products.emptyKysProduct, kategori: 'Kolonlar', marka: 'Marka', urunAciklamasi: 'Teknik açıklama', satisFiyati: '1.234,56', kdvOrani: '20', webSecili: true };
let mysql = true, failInsert = false, state, work;
const png = Buffer.from([137,80,78,71,13,10,26,10]);
const pool = { async transaction() { return {
  async begin() { work = structuredClone(state); },
  async commit() { state = work; },
  async rollback() { work = null; },
  request() { const p = {}; return { input(k,v) { p[k] = v; return this; }, async query(sql) {
    if (/SELECT ID FROM KysStokKart/.test(sql)) return { recordset: [{ ID: 7 }] };
    if (sql.includes('SELECT ID,GorselDosyaAdi')) { if (work.original) work.photos.push({ ID: 1, DosyaAdi: 'original.png', StokID: 7, Sira: 0, Silindi: 0 }); return { rowsAffected: [1], recordset: [] }; }
    if (sql.includes('SET GorselData=NULL')) { work.original = false; return { rowsAffected: [1], recordset: [] }; }
    if (sql.includes('COUNT(*)')) { const active = work.photos.filter(x => !x.Silindi); return { recordset: [{ Total: active.length, LastOrder: active.length ? Math.max(...active.map(x => x.Sira)) : null }] }; }
    if (sql.includes('OUTPUT INSERTED.ID')) { if (failInsert) throw Error('write failed'); const ID = work.photos.length + 1; work.photos.push({ ID, StokID: p.ID, DosyaAdi: p.Name, Sira: p.Order, Silindi: 0 }); return { recordset: [{ ID }] }; }
    if (sql.includes('SET Sira=Sira+1')) { work.photos.filter(x => !x.Silindi).forEach(x => x.Sira++); return { recordset: [], rowsAffected: [work.photos.length] }; }
    if (sql.includes('SET AltMetin=')) { const photo = work.photos.find(x => x.ID === p.PhotoID && x.StokID === p.ID && !x.Silindi); if (!photo) return { rowsAffected: [0] }; Object.assign(photo, { AltMetin: p.Alt ?? photo.AltMetin, Sira: p.Order ?? photo.Sira, Silindi: p.Deleted }); return { rowsAffected: [1] }; }
    return { recordset: [], rowsAffected: [1] };
  } }; },
}; } };
const gallery = compile('lib/kysStockGallery.ts', { '@/lib/db': { cosmoPool: Promise.resolve(pool) }, '@/lib/mysqlCompat': { hasMysqlConfig: () => mysql }, '@/lib/kysStore': { ensureKysSchema: async () => {} } });
(async () => {
  assert.equal(products.normalizeKysProduct(draft, 'Root').satisFiyati, 1234.56);
  assert.equal(products.normalizeKysProduct({ ...draft, kdvOrani: 0 }, 'Spektrotek').kdvOrani, 0);
  for (const value of ['-1', 'NaN', 'Infinity', '1.234', '12abc', true]) assert.throws(() => products.normalizeKysProduct({ ...draft, satisFiyati: value }, 'Root'));
  for (const fields of [{ kategori: '' }, { marka: '' }, { urunAciklamasi: '' }, { satisFiyati: null }, { kdvOrani: null }, { kdvOrani: '101' }, { webSecili: 'true' }, { webSlug: '../bad' }, { listeFiyati: 1 }]) assert.throws(() => products.normalizeKysProduct({ ...draft, ...fields }, 'Root'));
  assert.throws(() => products.normalizeKysProduct(draft, 'Unique'));
  assert.equal(products.normalizeKysProduct({ ...draft, tedarikDurumu: 'Teklif ile', satisFiyati: null, kdvOrani: null }, 'Root').satisFiyati, null);
  assert.equal(products.readKysProduct(null).paraBirimi, 'EUR');
  assert.equal(products.readKysProduct(JSON.stringify(products.normalizeKysProduct(draft, 'Root'))).satisFiyati, 1234.56);
  gallery.validateStockPhoto(png, 'image/png');
  assert.throws(() => gallery.validateStockPhoto(Buffer.from('<svg onload="x"/>'), 'image/png'));
  assert.throws(() => gallery.validateStockPhoto(png, 'image/svg+xml'));
  assert.throws(() => gallery.validateStockPhoto(Buffer.alloc(5 * 1024 * 1024 + 1), 'image/png'));
  for (mysql of [true, false]) {
    state = { original: true, photos: [] }; failInsert = false;
    const id = await gallery.addKysStockPhoto(7, { fileName: 'new.png', mimeType: 'image/png', data: png });
    assert.equal(id, 2); assert.equal(state.original, false); assert.equal(state.photos[0].DosyaAdi, 'original.png');
    await gallery.editKysStockPhoto(7, 2, { kapak: true });
    assert.equal(state.photos[1].Sira, 0); assert.ok(state.photos[0].Sira > 0);
    await assert.rejects(gallery.editKysStockPhoto(999, 2, { silindi: true }), /bulunamadı/);
    assert.equal(state.photos[1].Silindi, 0);
    await gallery.editKysStockPhoto(7, 2, { silindi: true });
    assert.equal(state.photos[1].Silindi, 1); assert.equal(state.photos.length, 2);
    await assert.rejects(gallery.editKysStockPhoto(7, 1, { sira: -1 }));
    state = { original: true, photos: [] }; failInsert = true;
    await assert.rejects(gallery.addKysStockPhoto(7, { fileName: 'new.png', mimeType: 'image/png', data: png }), /write failed/);
    assert.equal(state.original, true); assert.equal(state.photos.length, 0);
    failInsert = false; state = { original: false, photos: Array.from({ length: 24 }, (_, i) => ({ ID: i + 1, StokID: 7, Sira: i, Silindi: 0 })) };
    await assert.rejects(gallery.addKysStockPhoto(7, { fileName: 'new.png', mimeType: 'image/png', data: png }), /en fazla 24/);
  }
  let user = { firmalar: ['Unique'] };
  const imageRoute = compile('app/api/kys/stoklar/[id]/gorseller/[photoId]/route.ts', { '@/lib/portalYetki': { getPortalUser: async () => user }, '@/lib/kysStockGallery': { getKysStockSource: async () => 'Root', getKysStockPhoto: async () => { throw Error('unauthorized data read'); } } });
  const context = { params: Promise.resolve({ id: '7', photoId: '2' }) };
  assert.equal((await imageRoute.GET(new Request('http://localhost'), context)).status, 403);
  assert.equal((await imageRoute.PATCH(new Request('http://localhost', { method: 'PATCH', body: '{}' }), context)).status, 403);
  user = null;
  assert.equal((await imageRoute.GET(new Request('http://localhost'), context)).status, 401);
  console.log('PASS: product money/VAT/web validation, legacy-photo preservation, rollback, cover/order, soft removal, capacity, file signatures and gallery source authorization.');
})().catch(error => { console.error(error); process.exitCode = 1; });
