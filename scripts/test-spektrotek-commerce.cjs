// Offline: real business logic with transaction-aware database double; no live writes.
require('./register-local-ts.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const mock = (name, exports) => { require.cache[require.resolve(path.resolve(name))] = { id: name, filename: name, loaded: true, exports }; };
let state = { orders: [], maps: [], requests: [], lines: [] };
let failLine = false;
let stockQuantity = 10;
const stocks = [{ ID: 123, Kaynak: 'Spektrotek', Kod: 'SKU', Ad: 'Vial', Birim: 'Adet' }, { ID: 124, Kaynak: 'Root' }];
const query = async (s, sql, p) => {
  if (/CREATE TABLE|OBJECT_ID/.test(sql)) return { recordset: [] };
  if (sql.startsWith('UPDATE KysStokKart SET UrunBilgileri')) return { recordset: [] };
  if (sql.startsWith('SELECT COUNT(*) AS total FROM KysStokKart')) return { recordset: [{ total: 1 }] };
  if (sql.includes('CASE WHEN GorselData IS NULL')) return { recordset: [{ ...stocks[0], StokMiktari: stockQuantity, UrunBilgileri: JSON.stringify({ satisFiyati: 100, icNotlar: 'secret', referansFiyat: 'secret' }), HasLegacyImage: 1 }] };
  if (sql.startsWith('SELECT ID, StokID, AltMetin')) return { recordset: [] };
  if (sql.startsWith('SELECT StokID,WebID,Slug')) return { recordset: s.maps };
  if (sql.startsWith('SELECT w.TalepID,t.TalepNo,t.Durum')) return { recordset: s.orders.filter(r => r.OrderID === p.Order).map(r => ({ TalepID: r.TalepID, TalepNo: 'S1001', Durum: 'Onay Bekliyor' })) };
  if (sql.startsWith('SELECT StokID,Miktar,KabulMiktari')) return { recordset: s.lines.map(r => ({ StokID: r.Stock, Miktar: r.Qty, KabulMiktari: 0 })) };
  if (sql.startsWith('SELECT * FROM KysStokKart')) return { recordset: stocks.filter(r => r.ID === p.ID && r.Kaynak === 'Spektrotek') };
  if (sql.startsWith('SELECT * FROM SpektrotekProductMap')) return { recordset: s.maps.filter(r => r.StokID === p.ID || r.WebID === p.Web) };
  if (sql.startsWith('INSERT INTO SpektrotekProductMap')) { s.maps.push({ StokID: p.ID, WebID: p.Web, Slug: p.Slug }); return { recordset: [] }; }
  if (sql.startsWith('UPDATE SpektrotekProductMap')) { s.maps.find(r => r.StokID === p.ID).Slug = p.Slug; return { recordset: [] }; }
  if (sql.startsWith('SELECT WebID')) return { recordset: s.maps.filter(r => r.StokID === p.ID) };
  if (sql.startsWith('INSERT INTO SpektrotekWebOrder')) {
    if (s.orders.some(r => r.OrderID === p.Order)) throw new Error('duplicate key');
    s.orders.push({ OrderID: p.Order, PayloadHash: p.Hash, Payload: p.Payload }); return { recordset: [] };
  }
  if (sql.startsWith('INSERT INTO KysTalep ')) { s.requests.push({ ID: s.requests.length + 1, TalepNo: p.No, ...p }); return { recordset: [{ ID: s.requests.length }] }; }
  if (sql.startsWith('INSERT INTO KysTalepKalem')) { if (failLine) throw new Error('simulated line failure'); s.lines.push(p); return { recordset: [] }; }
  if (sql.startsWith('UPDATE SpektrotekWebOrder')) { s.orders.find(r => r.OrderID === p.Order).TalepID = p.ID; return { recordset: [] }; }
  if (sql.startsWith('SELECT w.PayloadHash')) return { recordset: s.orders.filter(r => r.OrderID === p.Order).map(r => ({ ...r, TalepNo: s.requests.find(t => t.ID === r.TalepID)?.TalepNo })) };
  throw new Error('Unexpected SQL: ' + sql);
};
const executor = get => ({ request() { const p = {}; return { input(k, v) { p[k] = v; return this; }, query(sql) { return query(get(), sql, p); } }; } });
const base = { ...executor(() => state), transaction() { let draft; return { ...executor(() => draft), async begin() { draft = structuredClone(state); }, async commit() { state = draft; }, async rollback() {} }; } };
mock('lib/db.ts', { cosmoPool: Promise.resolve(base) });
mock('lib/mysqlCompat.ts', { hasMysqlConfig: () => process.argv.includes('--mysql') });
mock('lib/kysStore.ts', { ensureKysSchema: async () => {} });
mock('lib/kysRequestNumbers.ts', { ensureKysRequestNumbers: async () => {}, nextSpektrotekRequestNumber: async () => 'S1001' });
const { receiveSpektrotekOrder, saveSpektrotekMapping } = require('../lib/spektrotekCommerce.ts');
const { spektrotekOrderSchema } = require('../lib/spektrotekContracts.ts');
const { spektrotekJson } = require('../lib/spektrotekHttp.ts');
const { assertSpektrotekKey, listSpektrotekProducts } = require('../lib/spektrotekIntegration.ts');
const order = { orderId: 'order-1', orderNumber: 'WEB-1', placedAt: '2026-10-19T14:30:00+03:00', currency: 'EUR',
  customer: { name: 'Test', email: 'test@example.com', phone: '123', billingAddress: 'Test billing', shippingAddress: 'Test shipping' },
  items: [{ portalProductId: 123, webProductId: 'web-1', quantity: 2, unitPrice: 100, vatRate: 20 }], shippingTotal: 10, discountTotal: 0, grandTotal: 250, paymentStatus: 'paid' };
(async () => {
  process.env.SPEKTROTEK_INTEGRATION_KEY = 'k'.repeat(40);
  assert.throws(() => assertSpektrotekKey(new Request('http://test')), e => e.status === 401);
  assert.doesNotThrow(() => assertSpektrotekKey(new Request('http://test', { headers: { 'x-api-key': 'k'.repeat(40) } })));
  assert.doesNotThrow(() => assertSpektrotekKey(new Request('http://test', { headers: { authorization: 'Bearer ' + 'k'.repeat(40) } })));
  assert.equal(spektrotekOrderSchema.safeParse({ ...order, grandTotal: 251 }).success, false);
  assert.equal(spektrotekOrderSchema.safeParse({ ...order, items: [order.items[0], order.items[0]] }).success, false);
  assert.equal(spektrotekOrderSchema.safeParse({ ...order, items: [{ ...order.items[0], quantity: -1 }] }).success, false);
  await assert.rejects(receiveSpektrotekOrder(order), e => e.status === 409);
  assert.equal(state.orders.length, 0); assert.equal(state.requests.length, 0);
  await assert.rejects(saveSpektrotekMapping({ portalProductId: 124, webProductId: 'root' }), e => e.status === 404);
  await saveSpektrotekMapping({ portalProductId: 123, webProductId: 'web-1' });
  await saveSpektrotekMapping({ portalProductId: 123, webProductId: 'web-1', webSlug: 'vial' });
  assert.equal(state.maps.length, 1);
  await assert.rejects(saveSpektrotekMapping({ portalProductId: 123, webProductId: 'different' }), e => e.status === 409);
  failLine = true; await assert.rejects(receiveSpektrotekOrder(order)); failLine = false;
  assert.equal(state.orders.length, 0); assert.equal(state.requests.length, 0);
  const first = await receiveSpektrotekOrder(order);
  const again = await receiveSpektrotekOrder(order);
  assert.equal(first.duplicate, false); assert.equal(again.duplicate, true);
  assert.equal(first.portalOrderId, again.portalOrderId);
  assert.equal(state.requests.length, 1); assert.equal(state.lines.length, 1);
  assert.equal(state.lines[0].Stock, 123); assert.match(state.lines[0].Note, /100 EUR/);
  const feed = await listSpektrotekProducts({ origin: 'https://lab.example' });
  assert.equal(feed.data[0].webUrunId, 'web-1');
  assert.equal(feed.data[0].createStatus, 'draft');
  assert.equal(feed.data[0].icNotlar, undefined); assert.equal(feed.data[0].referansFiyat, undefined);
  assert.match(feed.data[0].images[0].url, /\/products\/123\/images\/0$/);
  stockQuantity = 9;
  const changed = await listSpektrotekProducts({ origin: 'https://lab.example' });
  assert.notEqual(changed.data[0].revision, feed.data[0].revision);
  const { GET } = require('../app/api/integrations/spektrotek/orders/[orderId]/route.ts');
  const request = new Request('http://test', { headers: { 'x-api-key': 'k'.repeat(40) } });
  const response = await GET(request, { params: Promise.resolve({ orderId: 'order-1' }) });
  const status = await response.json();
  assert.equal(status.items[0].quantity, 2); assert.equal(status.items[0].shippedQuantity, 0);
  assert.equal((await GET(request, { params: Promise.resolve({ orderId: 'missing' }) })).status, 404);
  await assert.rejects(receiveSpektrotekOrder({ ...order, note: 'changed' }), e => e.status === 409);
  const post = (body, headers = {}) => new Request('http://test', { method: 'POST', headers: { 'x-api-key': 'k'.repeat(40), 'content-type': 'application/json', ...headers }, body });
  assert.equal((await spektrotekJson(post('{'), receiveSpektrotekOrder)).status, 400);
  assert.equal((await spektrotekJson(post('{}'), receiveSpektrotekOrder)).status, 400);
  assert.equal((await spektrotekJson(post('x'.repeat(131073)), receiveSpektrotekOrder)).status, 413);
  assert.equal((await spektrotekJson(post('{}', { 'content-type': 'text/plain' }), receiveSpektrotekOrder)).status, 415);
  console.log('PASS: auth, mapping isolation/conflicts, totals, order idempotency, rollback/retry and HTTP validation (' + (process.argv.includes('--mysql') ? 'MySQL' : 'MSSQL') + ' SQL branches).');
})().catch(error => { console.error(error); process.exitCode = 1; });
