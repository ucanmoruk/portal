/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const rows = new Map(); const messages = []; const notifications = new Map();
let failQueue = false; let httpStatus = 200; const deliveries = [];
const pool = { request() { const params = {}; return { input(key, value) { params[key] = value; return this; }, async query(sql) {
  if (/CREATE TABLE/.test(sql)) return { recordset: [] };
  if (/CustomerRequestNotifications/.test(sql)) {
    if (/INSERT INTO/.test(sql)) {
      if (failQueue) throw new Error('Queue insert failed');
      notifications.set(params.id, { ID: params.id, Payload: params.payload, Attempts: 0, NextAttempt: params.now, SentAt: null });
    } else if (/UPDATE/.test(sql)) {
      const row = notifications.get(params.id);
      if (sql.includes('SET LeaseID')) { if (!row.SentAt && (!row.LeaseUntil || row.LeaseUntil <= params.now)) { row.LeaseID = params.lease; row.LeaseUntil = params.until; } }
      else if (row.LeaseID === params.lease) {
        if (sql.includes('SET SentAt')) row.SentAt = params.now;
        else { row.Attempts = params.attempts; row.NextAttempt = params.next; row.LastError = params.error; }
        row.LeaseID = null; row.LeaseUntil = null;
      }
    } else {
      const result = [...notifications.values()].filter(row => params.id ? row.ID === params.id && row.LeaseID === params.lease && !row.SentAt : !row.SentAt && row.NextAttempt <= params.now && (!row.LeaseUntil || row.LeaseUntil <= params.now));
      return { recordset: result };
    }
    return { recordset: [], rowsAffected: [1] };
  }
  if (/INSERT INTO CustomerRequests /.test(sql)) {
    if (rows.has(params.number)) throw Object.assign(new Error('Duplicate'), { code: 'ER_DUP_ENTRY' });
    rows.set(params.number, { Number: params.number, Source: params.source, ExternalID: params.external, Status: params.status, Payload: params.payload, CreatedAt: params.created, TokenHash: params.hash, TokenExpires: params.expires });
    return { recordset: [] };
  }
  if (/INSERT INTO CustomerRequestMessages/.test(sql)) { messages.push({ ID: params.id, RequestNumber: params.number, Payload: params.payload, CreatedAt: params.created }); return { recordset: [] }; }
  if (/UPDATE CustomerRequests/.test(sql)) { const row = rows.get(params.number); if (params.status) { if (params.previous && row.Status !== params.previous) return { recordset: [], rowsAffected: [0] }; row.Status = params.status; } else { row.TokenHash = params.hash; row.TokenExpires = params.expires; } return { recordset: [], rowsAffected: [1] }; }
  if (/FROM CustomerRequestMessages/.test(sql)) return { recordset: messages.filter(m => m.RequestNumber === params.number && (!params.id || m.ID === params.id)) };
  let result = [...rows.values()];
  if (params.number) result = result.filter(r => r.Number === params.number);
  if (params.external) result = result.filter(r => r.ExternalID === params.external && r.Source === params.source);
  if (params.hash) result = result.filter(r => r.TokenHash === params.hash && r.Source === params.source && r.TokenExpires > params.now);
  return { recordset: result };
} }; } };
pool.transaction = async () => {
  let snapshot;
  return { request: () => pool.request(), async begin() { snapshot = { rows: structuredClone(rows), messages: structuredClone(messages), notifications: structuredClone(notifications) }; }, async commit() {}, async rollback() { rows.clear(); for (const [k,v] of snapshot.rows) rows.set(k,v); messages.splice(0, messages.length, ...snapshot.messages); notifications.clear(); for (const [k,v] of snapshot.notifications) notifications.set(k,v); } };
};
const env = { CUSTOMER_REQUEST_SPEKTROTEK_API_KEY: 's'.repeat(64), CUSTOMER_REQUEST_UNIQUEANALYSE_API_KEY: 'u'.repeat(64) };
function load(file, imports = {}) { const mod = { exports: {} }; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: mod, exports: mod.exports, process: { env }, console, Buffer, URL, Request, Response, File, FormData, AbortSignal, setInterval, fetch: async (url, options) => { deliveries.push({ url, ...options, payload: JSON.parse(options.body) }); return new Response(null, { status: httpStatus }); }, require: n => imports[n] || require(n) }); return mod.exports; }
(async () => {
  const types = load('lib/customerRequestTypes.ts');
  const notifier = load('lib/customerRequestNotifications.ts', { '@/lib/db': { cosmoPool: Promise.resolve(pool) }, '@/lib/mysqlCompat': { hasMysqlConfig: () => true } });
  const store = load('lib/customerRequests.ts', { '@/lib/db': { cosmoPool: Promise.resolve(pool) }, '@/lib/mysqlCompat': { hasMysqlConfig: () => true }, './customerRequestTypes': types, './customerRequestNotifications': notifier });
  assert.throws(() => store.integrationSource(new Request('http://test')), /anahtar/);
  assert.equal(store.integrationSource(new Request('http://test', { headers: { 'x-api-key': env.CUSTOMER_REQUEST_SPEKTROTEK_API_KEY } })), 'spektrotek');
  const fields = store.validateFields({ type: 'Teklif', company: 'İğdır Firma', name: 'Ayşe', email: 'a@example.com', phone: '555', subject: 'Ölçüm', body: 'Türkçe 😀' });
  assert.throws(() => store.validateFields({ ...fields, email: 'invalid' }));
  const created = await store.createRequest('spektrotek', fields, crypto.randomUUID());
  assert.match(created.number, /^\d{10}$/); assert.equal(await store.tokenNumber(created.token, 'spektrotek'), created.number);
  await assert.rejects(store.tokenNumber(created.token, 'uniqueanalyse'), /geçersiz/);
  rows.get(created.number).TokenExpires = '2000-01-01T00:00:00.000Z';
  await assert.rejects(store.tokenNumber(created.token, 'spektrotek'), /geçersiz/);
  rows.get(created.number).TokenExpires = '2099-01-01T00:00:00.000Z';
  const external = [...rows.values()][0].ExternalID;
  assert.equal((await store.createRequest('spektrotek', fields, external)).created, false); assert.equal(rows.size, 1);
  const form = new FormData(); form.set('text', 'Yanıt'); form.append('files', new File(['İçerik'], 'test.txt'));
  await store.addMessage(created.number, new Request('http://test', { method: 'POST', body: form }), 'staff');
  assert.equal(notifications.size, 1);
  await notifier.dispatchNotifications();
  assert.equal(deliveries.length, 1); assert.equal(deliveries[0].payload.eventType, 'staff_message');
  assert.equal(deliveries[0].payload.email, fields.email); assert.equal(deliveries[0].payload.text, 'Yanıt');
  assert.equal(deliveries[0].headers['x-api-key'], env.CUSTOMER_REQUEST_SPEKTROTEK_API_KEY);
  await notifier.dispatchNotifications(); assert.equal(deliveries.length, 1);
  failQueue = true;
  const failedForm = new FormData(); failedForm.set('text', 'Rollback');
  await assert.rejects(store.addMessage(created.number, new Request('http://test', { method: 'POST', body: failedForm }), 'staff'), /Queue/);
  assert.equal(messages.length, 1); failQueue = false;
  const detail = await store.getRequest(created.number); assert.equal(detail.messages[0].text, 'Yanıt'); assert.equal(detail.messages[0].files[0].name, 'test.txt');
  const download = await store.downloadFile(created.number, detail.messages[0].id, 0); assert.equal(await download.text(), 'İçerik'); assert.equal(download.headers.get('X-Content-Type-Options'), 'nosniff');
  await assert.rejects(store.downloadFile(created.number, crypto.randomUUID(), 0), /bulunamadı/);
  const bad = new FormData(); bad.append('files', new File(['x'], 'script.html'));
  await assert.rejects(store.addMessage(created.number, new Request('http://test', { method: 'POST', body: bad }), 'customer'), /Desteklenen/); assert.equal(messages.length, 1);
  await store.updateRequest(created.number, 'İşleme Alındı'); assert.equal((await store.getRequest(created.number)).request.status, 'İşleme Alındı');
  assert.equal(notifications.size, 2);
  await store.updateRequest(created.number, 'İşleme Alındı'); assert.equal(notifications.size, 2);
  httpStatus = 503; await notifier.dispatchNotifications();
  const pending = [...notifications.values()].find(n => !n.SentAt);
  assert.equal(pending.Attempts, 1); const lastId = deliveries.at(-1).payload.eventId;
  const failedDeliveries = deliveries.length;
  await notifier.dispatchNotifications(); assert.equal(deliveries.length, failedDeliveries);
  pending.NextAttempt = '2000-01-01'; httpStatus = 200; await notifier.dispatchNotifications();
  assert.equal(deliveries.at(-1).payload.eventId, lastId); assert.ok(pending.SentAt);
  assert.equal(deliveries.at(-1).payload.eventType, 'status_changed');
  assert.equal(deliveries.at(-1).payload.status, 'İşleme Alındı');
  const customerForm = new FormData(); customerForm.set('text', 'Müşteri');
  await store.addMessage(created.number, new Request('http://test', { method: 'POST', body: customerForm }), 'customer');
  assert.equal(notifications.size, 2);
  const other = await store.createRequest('uniqueanalyse', fields, crypto.randomUUID());
  const otherForm = new FormData(); otherForm.set('text', 'Unique');
  await store.addMessage(other.number, new Request('http://test', { method: 'POST', body: otherForm }), 'staff');
  await store.updateRequest(other.number, 'Tamamlandı'); assert.equal(notifications.size, 2);
  await assert.rejects(store.updateRequest(created.number, 'Invalid'), /Geçersiz/);
  await store.updateRequest(created.number); await assert.rejects(store.tokenNumber(created.token, 'spektrotek'), /geçersiz/);
  assert.equal((await store.createRequest('spektrotek', fields, external)).token, null);
  await assert.rejects(store.boundedBody(new Request('http://test', { method: 'POST', body: '12345' }), 4), /sınırı/);
  const api = load('app/api/integrations/customer-requests/[[...path]]/route.ts', { '@/lib/customerRequests': store });
  assert.equal((await api.GET(new Request('http://test'), { params: Promise.resolve({}) })).status, 401);
  let user = null;
  const staff = load('app/api/musteri-talepleri/[[...path]]/route.ts', { '@/lib/customerRequests': store, '@/lib/portalYetki': { getPortalUser: async () => user }, 'next/server': { after: fn => fn() }, '@/lib/customerRequestNotifications': notifier });
  const context = { params: Promise.resolve({}) };
  assert.equal((await staff.GET(new Request('http://test'), context)).status, 401);
  user = { can: () => false }; assert.equal((await staff.GET(new Request('http://test'), context)).status, 403);
  user = { can: () => true }; assert.equal((await staff.POST(new Request('http://test', { method: 'POST', headers: { origin: 'https://other.test' } }), context)).status, 403);
  console.log('PASS: authentication, source isolation, requests, replies, private attachments, transactional notification rollback, staff/status events, same-ID 503 retries, duplicate suppression and customer/Unique exclusions. No live records created or emails sent.');
  if (process.argv.includes('--database')) {
    require('@next/env').loadEnvConfig(process.cwd());
    const realEnv = process.env;
    let connectionPool;
    const mysql = require('mysql2/promise');
    const wrappedMysql = { ...mysql, createPool(...args) { connectionPool = mysql.createPool(...args); return connectionPool; } };
    const mod = { exports: {} };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/mysqlCompat.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, { module: mod, exports: mod.exports, process: { env: realEnv }, console, Buffer, require: name => name === 'mysql2/promise' ? wrappedMysql : require(name) });
    const realPool = new mod.exports.MysqlCompatPool();
    const transaction = await realPool.transaction(); await transaction.begin();
    try {
      const wrapper = { request() { const req = transaction.request(); const original = req.query.bind(req); req.query = sql => /CREATE TABLE/.test(sql) ? Promise.resolve({ recordset: [] }) : original(sql); return req; } };
      // Keep all DB smoke-test writes inside the outer rollback transaction.
      wrapper.transaction = async () => ({ request: () => wrapper.request(), async begin() {}, async commit() {}, async rollback() {} });
      const live = load('lib/customerRequests.ts', { '@/lib/db': { cosmoPool: Promise.resolve(wrapper) }, '@/lib/mysqlCompat': { hasMysqlConfig: () => true }, './customerRequestTypes': types,
        './customerRequestNotifications': { async notificationSchema() {}, async enqueueNotification() {} } });
      const created = await live.createRequest('spektrotek', fields, crypto.randomUUID());
      assert.equal((await live.getRequest(created.number)).request.body, 'Türkçe 😀');
      assert.equal(await live.tokenNumber(created.token, 'spektrotek'), created.number);
      const form = new FormData(); form.set('text', 'Geçici test'); form.append('files', new File(['Türkçe ek'], 'test.txt'));
      await live.addMessage(created.number, new Request('http://test', { method: 'POST', body: form }), 'customer');
      const detail = await live.getRequest(created.number);
      assert.equal(await (await live.downloadFile(created.number, detail.messages[0].id, 0)).text(), 'Türkçe ek');
      await live.updateRequest(created.number, 'Tamamlandı');
      assert.equal((await live.getRequest(created.number)).request.status, 'Tamamlandı');
      console.log('PASS: actual MySQL request → customer reply → private attachment → status update. Transaction rolled back; no persistent test records.');
    } finally { await transaction.rollback(); await connectionPool.end(); }
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
