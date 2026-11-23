// Synthetic records only. No database, IMAP, AI, quote or SMTP calls.
require('./register-local-ts.cjs');
const fs = require('node:fs'), ts = require('typescript'), assert = require('node:assert/strict'), { randomUUID } = require('node:crypto');
const rules = require('../lib/uniqueTalepRules.ts');
function compile(file, mocks) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const mod = { exports: {} }; new Function('require', 'module', 'exports', source)(name => name in mocks ? mocks[name] : require(name), mod, mod.exports); return mod.exports;
}
const rows = []; let signedIn = true, authorized = true, scans = 0;
const firms = [{ ID: 77, Firma_Adi: 'Kayıtlı Kozmetik', name: 'Kayıtlı Kozmetik', email: 'existing@example.com', contact: 'Mehmet Bey' }];
let dbCalls = 0;
const pool = { request() { const params = {}; return { input(key, value) { params[key] = value; return this; }, async query() { dbCalls++; return { recordset: params.ID ? firms.filter(f => f.ID === params.ID) : firms }; } }; } };
const auth = { async getPortalUser() { return signedIn ? { userName: 'Test Kullanıcı', can: () => authorized } : null; } };
const route = compile('app/api/unique-talep/route.ts', {
  '@/lib/db': { cosmoPool: Promise.resolve(pool) },
  '@/lib/uniqueTalepRules': rules,
  '@/lib/portalYetki': auth,
  '@/lib/uniqueTalepMailbox': { async syncUniqueMailbox() { scans++; return { examined: 0, added: 0 }; } },
  '@/lib/uniqueTalepStore': {
    async listUniqueRequests() { return rows.filter(r => !r.deletedAt); },
    async insertUniqueRequest(value) { if (rows.some(r => r.source === value.source)) return false; rows.push({ ...structuredClone(value), id: rows.length + 1, version: 1 }); return true; },
    async getUniqueRequestBySource(source) { return structuredClone(rows.find(r => r.source === source) || null); },
  },
});
const lookup = compile('app/api/unique-talep/companies/route.ts', { '@/lib/db': { cosmoPool: Promise.resolve(pool) }, '@/lib/portalYetki': auth });
const fixture = () => ({ action: 'manual', requestId: randomUUID(), companyName: 'Manuel Kozmetik', name: 'Örnek Yetkili', email: 'manual@example.com', subject: 'Challenge testi fiyat talebi', text: 'İki ürün için analiz ve fiyat bilgisi rica ediyoruz.', category: 'Fiyat Teklifi' });
const post = (body, origin = 'https://portal.example') => route.POST(new Request('https://portal.example/api/unique-talep', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }));
(async () => {
  signedIn = false; assert.equal((await post(fixture())).status, 401); signedIn = true;
  authorized = false; assert.equal((await post(fixture())).status, 403); authorized = true;
  assert.equal((await post(fixture(), 'https://other.example')).status, 403);
  for (const patch of [{ companyName: '' }, { email: 'not-an-email' }, { subject: '' }, { text: '' }, { text: 'x'.repeat(12001) }, { category: 'invalid' }, { status: 'Gönderildi' }]) assert.equal((await post({ ...fixture(), ...patch })).status, 400);
  assert.equal(rows.length, 0); assert.equal(scans, 0);
  const body = fixture(), responses = await Promise.all([post(body), post(body)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 201]); assert.equal(rows.length, 1);
  const row = rows[0]; assert.equal(row.potential, true); assert.equal(row.status, 'Bekliyor'); assert.equal(row.mailState, 'Taslak'); assert.equal(row.messageId, ''); assert.equal(row.offer, null); assert.equal(row.quoteId, null); assert.equal(row.companyId, null); assert.equal(row.createdBy, 'Test Kullanıcı'); assert.equal(scans, 0);
  assert.equal((await post({ ...body, text: 'Different request' })).status, 409); assert.equal(rows.length, 1);
  row.deletedAt = new Date().toISOString(); assert.equal((await post(body)).status, 409); assert.equal(rows.length, 1);
  const response = await post({ ...fixture(), name: '' }); assert.equal(response.status, 201); assert.equal(rows[1].name, rows[1].companyName);
  const listing = await (await route.GET()).json(); assert.equal(listing.data.length, 1); assert.equal(listing.data[0].hasOffer, false); assert.equal(listing.data[0].text, undefined); assert(listing.data[0].summary.includes('İki ürün'));
  signedIn = false; assert.equal((await lookup.GET(new Request('https://portal.example/api/unique-talep/companies?q=Kayıtlı'))).status, 401); signedIn = true;
  authorized = false; assert.equal((await lookup.GET(new Request('https://portal.example/api/unique-talep/companies?q=Kayıtlı'))).status, 403); authorized = true;
  assert.deepEqual(await (await lookup.GET(new Request('https://portal.example/api/unique-talep/companies?q=K'))).json(), { data: [] }); assert.equal(dbCalls, 0);
  const found = await (await lookup.GET(new Request('https://portal.example/api/unique-talep/companies?q=Kayıtlı'))).json(); assert.equal(found.data[0].id, 77); assert.equal(found.data[0].email, 'existing@example.com');
  const linked = { ...fixture(), companyId: 77, companyName: 'Untrusted name', name: 'Başka yetkili', email: 'different-contact@example.com' };
  const linkedResponse = await post(linked); assert.equal(linkedResponse.status, 201); const linkedItem = (await linkedResponse.json()).item; assert.equal(linkedItem.companyId, 77); assert.equal(linkedItem.companyName, 'Kayıtlı Kozmetik'); assert.equal(linkedItem.email, 'different-contact@example.com');
  assert.equal((await post(linked)).status, 200);
  assert.equal((await post({ ...fixture(), companyId: 999 })).status, 409);
  assert.equal((await post({ ...fixture(), companyId: -1 })).status, 400);
  assert.equal((await post()).status, 200); assert.equal(scans, 1);
  console.log('PASS Unique manual: auth/origin/input validation, safe initial state, creator, visible list summary, idempotent concurrent/repeated requests, changed/deleted token protection and unchanged empty-body mailbox scan. No external data or mail used.');
})().catch(error => { console.error(error); process.exitCode = 1; });
