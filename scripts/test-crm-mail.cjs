// In-memory records and fake SMTP only. Never sends real mail or connects to a database.
require('./register-local-ts.cjs');
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), { randomUUID } = require('node:crypto');
const rules = require('../lib/crmRules.ts'), email = require('../lib/crmEmail.ts'), sanitize = require('../lib/htmlSanitize.ts');
function compile(file, mocks) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => name in mocks ? mocks[name] : require(name), mod, mod.exports);
  return mod.exports;
}
class CrmError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
let rows = [], signedIn = true, authorized = true, canSend = true, admin = true, configReady = true, smtpError = '', delaySend = null, failFinalize = false;
const messages = [], options = [];
const store = { CrmError, async findCrmRecord(id) { return structuredClone(rows.find(r => r.id === id) || null); }, async listCrmRecords(kind) { return structuredClone(rows.filter(r => kind ? r.kind === kind : r.kind !== 'mail')); },
  async insertCrmRecord(kind, data, by, id = randomUUID()) { if (rows.some(r => r.id === id)) throw Error('duplicate'); const record = { id, kind, data: structuredClone(data), version: 1, updatedBy: by, updatedAt: new Date().toISOString() }; rows.push(record); return structuredClone(record); },
  async saveCrmRecord(record, data, by) { const index = rows.findIndex(r => r.id === record.id); if (rows[index].version !== record.version) throw new CrmError('conflict', 409); if (failFinalize && data.state === 'Gönderildi') throw Error('db finalization unavailable'); rows[index] = { ...record, data: structuredClone(data), version: record.version + 1, updatedBy: by, updatedAt: new Date().toISOString() }; return structuredClone(rows[index]); }
};
const mailer = compile('lib/crmMailer.ts', {
  '@/lib/crmStore': store,
  '@/lib/settings': { async getAllSettings() { return configReady ? { MAIL_HOST: 'smtp.example.test', MAIL_PORT: '587', MAIL_SECURE: 'false', MAIL_USER: 'sender@example.test', MAIL_PASS: 'synthetic-secret', MAIL_FROM: 'Oğuzhan Eker <oguzhan@uniqueanalyse.com>' } : { MAIL_HOST: '', MAIL_USER: '', MAIL_PASS: '' }; } },
  nodemailer: { createTransport(config) { options.push(config); return { async sendMail(message) { if (delaySend) await delaySend; if (smtpError) throw Object.assign(Error('synthetic SMTP failure'), { code: smtpError }); messages.push(message); return { accepted: [message.envelope.to[0]], rejected: [], messageId: message.messageId }; }, close() {} }; } }
});
const route = compile('app/api/crm/mail/route.ts', {
  '@/lib/crmRules': rules, '@/lib/crmEmail': email, '@/lib/htmlSanitize': sanitize, '@/lib/crmStore': store, '@/lib/crmMailer': mailer,
  '@/lib/portalYetki': { async getPortalUser() { return signedIn ? { userName: 'Test Kullanıcı', isAdmin: admin, can: key => key === 'iletisim.crm' ? authorized : canSend } : null; } }
});
const post = body => route.POST(new Request('https://portal.example/api/crm/mail', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://portal.example' }, body: JSON.stringify(body) }));
async function ok(body) { const response = await post(body); assert.equal(response.status, 200, JSON.stringify(await response.clone().json())); return (await response.json()).record; }
let company;
async function draft(extra = {}) { return ok({ action: 'draft', id: randomUUID(), version: 0, companyId: company.id, subject: '{{firma}} için özel yanıt', body: '<h2>Sayın {{yetkili}}</h2><p>Özel açıklama</p>', format: 'html', ...extra }); }
const send = record => post({ action: 'send', id: record.id, version: record.version, confirmTo: record.data.to, confirmFrom: 'Oğuzhan Eker <oguzhan@uniqueanalyse.com>' });
const log = console.error;
(async () => {
  console.error = () => {};
  company = await store.insertCrmRecord('company', { ...rules.CompanyFields.parse({ name: 'Örnek Firma', email: 'customer@example.test', contact: 'Ayşe Hanım' }), customerId: null, source: 'Manuel' }, 'Test');
  const get = () => route.GET(new Request(`https://portal.example/api/crm/mail?companyId=${company.id}`));
  signedIn = false; assert.equal((await get()).status, 401); signedIn = true;
  authorized = false; assert.equal((await get()).status, 403); authorized = true;
  const config = await (await get()).json(); assert.equal(config.configured, true); assert(!JSON.stringify(config).includes('synthetic-secret'));
  assert.equal((await route.POST(new Request('https://portal.example/api/crm/mail', { method: 'POST', headers: { Origin: 'https://other.example' }, body: '{}' }))).status, 403);
  assert.equal((await post({ action: 'draft', id: randomUUID(), version: 0, companyId: company.id, subject: 'x', body: '<script>alert(1)</script>', format: 'html' })).status, 400);
  const creationId = randomUUID(); let record = await draft({ id: creationId });
  const original = await draft({ id: creationId }); assert.equal(record.id, original.id); assert.equal(rows.filter(r => r.kind === 'mail').length, 1);
  assert(record.data.html.includes('Sayın Ayşe Hanım')); assert(record.data.renderedSubject.includes('Örnek Firma'));
  canSend = false; assert.equal((await send(record)).status, 403); canSend = true;
  assert.equal((await post({ action: 'send', id: record.id, version: record.version, confirmTo: 'other@example.test', confirmFrom: 'Oğuzhan Eker <oguzhan@uniqueanalyse.com>' })).status, 409);
  assert.equal((await post({ action: 'send', id: record.id, version: record.version, confirmTo: record.data.to, confirmFrom: 'Different Sender <other@example.test>' })).status, 409);
  assert.equal((await post({ action: 'send', id: record.id, version: record.version, confirmTo: record.data.to, confirmFrom: 'Oğuzhan Eker <oguzhan@uniqueanalyse.com>', cc: 'other@example.test' })).status, 400);
  assert.equal((await post({ action: 'draft', id: randomUUID(), version: 0, companyId: company.id, subject: 'Test\r\nBcc: other@example.test', body: '<p>Test</p>', format: 'html' })).status, 400);
  configReady = false; assert.equal((await send(record)).status, 503); assert.equal(rows.find(r => r.id === record.id).data.state, 'Taslak'); configReady = true;
  // Concurrent identical send clicks result in one SMTP call.
  let release; delaySend = new Promise(resolve => { release = resolve; });
  const first = send(record); await new Promise(resolve => setTimeout(resolve, 25));
  const second = await send(record); assert.equal(second.status, 409); release(); assert.equal((await first).status, 200); delaySend = null;
  assert.equal(messages.length, 1); assert.deepEqual(messages[0].envelope.to, ['customer@example.test']); assert.equal(messages[0].cc, undefined); assert.equal(messages[0].bcc, undefined);
  assert.equal(options[0].disableFileAccess, true); assert.equal(options[0].disableUrlAccess, true); assert.equal(options[0].requireTLS, true);
  record = await store.findCrmRecord(record.id); assert.equal(record.data.state, 'Gönderildi'); assert.equal((await send(record)).status, 409);
  assert.equal((await post({ action: 'draft', id: record.id, version: record.version, companyId: company.id, subject: 'changed', body: '<p>changed</p>', format: 'html' })).status, 409);
  // A changed company invalidates the exact recipient/content review.
  record = await draft(); company = await store.saveCrmRecord(company, { ...company.data, email: 'new@example.test' }, 'Test'); assert.equal((await send(record)).status, 409);
  record = await draft(); const refusal = await store.insertCrmRecord('company', { ...company.data, permission: 'Ret', name: 'Başka CRM kaydı' }, 'Test'); refusal.deletedAt = new Date().toISOString(); rows.find(r => r.id === refusal.id).deletedAt = refusal.deletedAt;
  assert.equal((await send(record)).status, 409); rows = rows.filter(r => r.id !== refusal.id);
  // Certain failures can be retried, uncertain failures require an audited admin resolution.
  smtpError = 'EAUTH'; assert.equal((await send(record)).status, 502); record = await store.findCrmRecord(record.id); assert.equal(record.data.state, 'Hata');
  smtpError = 'ETIMEDOUT'; assert.equal((await send(record)).status, 409); record = await store.findCrmRecord(record.id); assert.equal(record.data.state, 'Belirsiz'); assert.equal((await send(record)).status, 409);
  admin = false; assert.equal((await post({ action: 'resolve', id: record.id, version: record.version, outcome: 'Gönderilmedi', note: 'SMTP logları kontrol edildi.' })).status, 403); admin = true;
  record = await ok({ action: 'resolve', id: record.id, version: record.version, outcome: 'Gönderilmedi', note: 'SMTP logları kontrol edildi; gönderim yok.' }); assert.equal(record.data.state, 'Taslak'); assert(record.data.history.at(-1).note.includes('SMTP logları'));
  smtpError = ''; assert.equal((await send(record)).status, 200);
  const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=';
  record = await draft({ body: `<p>Merhaba</p><img src="data:image/png;base64,${pixel}" alt="logo">` }); assert.equal((await send(record)).status, 200);
  const imageMessage = messages.at(-1); assert(imageMessage.html.includes('src="cid:')); assert(!imageMessage.html.includes('data:image')); assert(Buffer.isBuffer(imageMessage.attachments[0].content)); assert.equal(imageMessage.attachments[0].contentDisposition, 'inline');
  record = await draft(); failFinalize = true; assert.equal((await send(record)).status, 409); failFinalize = false; record = await store.findCrmRecord(record.id); assert.equal(record.data.state, 'Belirsiz'); assert.equal((await send(record)).status, 409);
  const missingEmail = await store.insertCrmRecord('company', { ...company.data, name: 'Mail yok', email: '' }, 'Test'); record = await draft({ companyId: missingEmail.id }); assert.equal((await send(record)).status, 400);
  rows.find(r => r.id === missingEmail.id).deletedAt = new Date().toISOString(); assert.equal((await send(record)).status, 400);
  record = await draft(); rows.find(r => r.id === company.id).deletedAt = new Date().toISOString(); assert.equal((await send(record)).status, 404);
  assert.equal(messages.length, 4);
  // Multi-address companies require an explicit choice; personalize and audit that person.
  const multiCompany = await store.insertCrmRecord('company', { ...rules.CompanyFields.parse({ name: 'Çoklu Firma', email: 'main@multi.test', contact: 'Ana Yetkili', contacts: [{ email: 'buyer@multi.test', name: 'Mehmet Bey', role: 'Satın alma' }] }), customerId: null, source: 'Manuel' }, 'Test');
  const multiBody = { action: 'draft', id: randomUUID(), version: 0, companyId: multiCompany.id, subject: '{{yetkili}} için', body: '<p>Sayın {{yetkili}}</p>', format: 'html' };
  assert.equal((await post(multiBody)).status, 400);
  assert.equal((await post({ ...multiBody, to: 'unknown@example.test' })).status, 409);
  let multiMail = await ok({ ...multiBody, to: 'buyer@multi.test' });
  assert.equal(multiMail.data.to, 'buyer@multi.test'); assert.equal(multiMail.data.toName, 'Mehmet Bey'); assert.equal(multiMail.data.toRole, 'Satın alma'); assert(multiMail.data.html.includes('Sayın Mehmet Bey'));
  assert.equal((await post({ ...multiBody, to: 'main@multi.test' })).status, 409, 'same creation key must not silently change recipients');
  const blocked = await store.insertCrmRecord('company', { ...rules.CompanyFields.parse({ name: 'Ret Kaydı', email: 'other@example.test', contacts: [{ email: 'buyer@multi.test' }], permission: 'Ret' }), customerId: null, source: 'Manuel' }, 'Test');
  assert.equal((await send(multiMail)).status, 409); rows = rows.filter(r => r.id !== blocked.id);
  assert.equal((await send(multiMail)).status, 200); assert.deepEqual(messages.at(-1).envelope.to, ['buyer@multi.test']); assert.equal(messages.at(-1).to.name, 'Mehmet Bey'); assert.equal(messages.at(-1).cc, undefined);
  const pendingMulti = await ok({ ...multiBody, id: randomUUID(), to: 'buyer@multi.test' });
  await store.saveCrmRecord(multiCompany, { ...multiCompany.data, contacts: [] }, 'Test'); assert.equal((await send(pendingMulti)).status, 409);
  const oldMulti = await store.insertCrmRecord('company', { ...multiCompany.data, name: 'Eski Çoklu', email: 'old1@example.test;old2@example.test', contacts: [] }, 'Test');
  assert.equal((await post({ ...multiBody, id: randomUUID(), companyId: oldMulti.id })).status, 400);
  const oldDraft = await ok({ ...multiBody, id: randomUUID(), companyId: oldMulti.id, to: 'old2@example.test' }); assert(oldDraft.data.html.includes('Sayın Yetkili')); assert.equal((await send(oldDraft)).status, 200); assert.deepEqual(messages.at(-1).envelope.to, ['old2@example.test']);
  assert.equal(messages.length, 6);
  console.log('PASS CRM direct mail: auth/send permission, private config, origin, drafts/idempotency, personalized snapshots, exact recipient review, concurrent send claim, no CC/BCC, SMTP TLS/access safety, changed/deleted companies, global refusal, certain/uncertain failure, audited admin recovery, CID images and DB finalization failure. Fake SMTP only.');
})().catch(error => { console.error = log; console.error(error); process.exitCode = 1; }).finally(() => { console.error = log; });
