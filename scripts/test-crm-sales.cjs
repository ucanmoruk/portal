// Real route handlers with in-memory persistence, fake AI and fake SMTP only.
require('./register-local-ts.cjs');
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), { randomUUID } = require('node:crypto');
const rules = require('../lib/crmRules.ts'), sales = require('../lib/crmSales.ts'), email = require('../lib/crmEmail.ts'), sanitize = require('../lib/htmlSanitize.ts');
function compile(file, mocks) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => name in mocks ? mocks[name] : require(name), mod, mod.exports);
  return mod.exports;
}
class CrmError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
let rows = [], signedIn = true, allowed = true, canSend = true, canIncoming = true, delaySend = null, smtpError = '', partial = false, aiCalls = 0;
const recipients = [];
const store = { CrmError,
  async findCrmRecord(id) { return structuredClone(rows.find(r => r.id === id) || null); },
  async listCrmRecords(kind) { return structuredClone(rows.filter(r => kind ? r.kind === kind : r.kind !== 'mail')); },
  async insertCrmRecord(kind, data, by, id = randomUUID()) { if (rows.some(r => r.id === id)) throw new CrmError('duplicate', 409); const record = { id, kind, data: structuredClone(data), version: 1, updatedBy: by, updatedAt: new Date().toISOString() }; rows.push(record); return structuredClone(record); },
  async saveCrmRecord(record, data, by) { const i = rows.findIndex(r => r.id === record.id); if (rows[i].version !== record.version) throw new CrmError('conflict', 409); rows[i] = { ...record, data: structuredClone(data), version: record.version + 1, updatedBy: by, updatedAt: new Date().toISOString() }; return structuredClone(rows[i]); }
};
const permissions = { async getPortalUser() { return signedIn ? { userName: 'Test User', isAdmin: false, can: key => key === 'iletisim.crm' ? allowed : key === 'iletisim.crm.mail-gonder' ? canSend : key === 'iletisim.unique-talep' ? canIncoming : true } : null; } };
const mailer = {
  crmSalesSignatureHtml: async () => require("../lib/uniqueMailSignature.ts").uniqueMailSignatureHtml("data:image/png;base64,aGVsbG8="),
  async crmMailConfig() { return { from: { name: 'Test', address: 'sender@example.test' }, replyTo: { address: 'sender@example.test' } }; },
  crmEmbeddedImages: (html) => ({ html, attachments: [] }),
  createCrmTransport() { return { async sendMail(message) { if (delaySend) await delaySend; if (smtpError) throw Object.assign(Error('SMTP uncertainty'), { code: smtpError }); recipients.push(message); return { accepted: partial ? message.envelope.to.slice(0, 1) : message.envelope.to, rejected: partial ? message.envelope.to.slice(1) : [], messageId: message.messageId }; }, close() {} }; }
};
const mailRoute = compile('app/api/crm/mail/route.ts', { '@/lib/crmStore': store, '@/lib/portalYetki': permissions, '@/lib/crmMailer': mailer, '@/lib/crmRules': rules, '@/lib/crmEmail': email, '@/lib/htmlSanitize': sanitize });
const incoming = { id: 45, source: 'imap-message', email: 'ayse@example.test', subject: 'Re: Laboratuvar', text: 'Teklifinizi bekliyoruz', date: new Date().toISOString() };
const route = compile('app/api/crm/sales/route.ts', {
  '@/lib/crmStore': store, '@/lib/portalYetki': permissions, '@/lib/crmMailer': mailer, '@/lib/crmRules': rules, '@/lib/crmSales': sales, '@/lib/crmSalesAi': { crmSalesAiConfig: async () => ({ provider: 'anthropic' }) },
  '@/app/api/crm/mail/route': mailRoute,
  '@/lib/crmAi': { crmAiConfig: () => ({ provider: 'anthropic' }), async requestCrmOutput(_config, system, messages, schema) { aiCalls++; assert.match(system, /uydurma/); const context = JSON.parse(messages[0].content); assert.equal(context.company.name, 'Test Kozmetik'); assert(context.notes.some(n => n.text === 'Stabilite testi konuşuldu')); assert(!JSON.stringify(context).includes('Other private company')); return schema.parse({ subject: 'Stabilite testleri', body: 'Sayın {{yetkili}}, stabilite ihtiyacınızı birlikte değerlendirebiliriz.', rationale: 'Görüşme notundaki ihtiyaca göre.' }); } },
  '@/lib/crmKnowledgeStore': { getCrmKnowledge: async () => ({ content: {} }) }, '@/lib/crmKnowledgeRules': { crmKnowledgePrompt: () => '' },
  '@/lib/uniqueTalepStore': { listUniqueRequests: async () => [incoming], getUniqueRequest: async id => { assert.equal(id, 45); return incoming; } }
});
const post = body => route.POST(new Request('https://portal.test/api/crm/sales', { method: 'POST', headers: { Origin: 'https://portal.test', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
const get = query => route.GET(new Request(`https://portal.test/api/crm/sales${query || ''}`));
async function ok(body) { const r = await post(body); assert.equal(r.status, 200, JSON.stringify(await r.clone().json())); return r.json(); }
(async () => {
  const fields = rules.CompanyFields.parse({ name: 'Test Kozmetik', email: 'ayse@example.test', contact: 'Ayşe', contacts: [{ email: 'mehmet@example.test', name: 'Mehmet', role: 'Ar-Ge' }, { email: '', name: 'E-postasız yetkili', role: 'Satın alma' }], website: 'https://example.test', categories: ['Kozmetik', 'Hammadde'], keywords: ['stabilite', 'ihracat'], priority: 'Yüksek' });
  assert.equal(rules.CompanyFields.safeParse({ ...fields, categories: ['wrong'] }).success, false);
  assert.equal(rules.CompanyFields.safeParse({ ...fields, website: 'javascript:alert(1)' }).success, false);
  const company = await store.insertCrmRecord('company', { ...fields, customerId: null, source: 'Manuel' }, 'Test');
  await store.insertCrmRecord('company', { ...fields, name: 'Other private company', email: 'other@example.test', contacts: [] }, 'Test');
  signedIn = false; assert.equal((await get()).status, 401); signedIn = true;
  allowed = false; assert.equal((await get()).status, 403); allowed = true;
  assert.equal((await route.POST(new Request('https://portal.test/api/crm/sales', { method: 'POST', headers: { Origin: 'https://evil.test' }, body: '{}' }))).status, 403);
  const noteId = randomUUID(); await ok({ action: 'note', id: noteId, companyId: company.id, text: 'Stabilite testi konuşuldu', type: 'Telefon' });
  await ok({ action: 'note', id: noteId, companyId: company.id, text: 'Stabilite testi konuşuldu', type: 'Telefon' });
  assert.equal(rows.filter(r => r.kind === 'note').length, 1);
  assert.equal((await post({ action: 'note', id: noteId, companyId: company.id, text: 'Farklı içerik', type: 'Not' })).status, 409);
  const ai = await ok({ action: 'generate', companyId: company.id, instruction: 'Kısa bir takip' }); assert.equal(ai.draft.subject, 'Stabilite testleri'); assert.equal(aiCalls, 1); assert.equal(recipients.length, 0);
  const saved = await ok({ action: 'saveDraft', id: randomUUID(), version: 0, companyId: company.id, subject: ai.draft.subject, body: ai.draft.body });
  assert.equal(saved.batch.data.state, 'Taslak'); assert.equal(recipients.length, 0);
  const review = async () => (await ok({ action: 'review', id: randomUUID(), companyId: company.id, subject: 'Merhaba {{firma}}', body: 'Sayın {{yetkili}}, ihtiyaçlarınızı görüşebiliriz.' })).batch;
  let batch = await review(); assert.equal(batch.data.recipients.length, 2); assert(batch.data.recipients.every(r => r.mailVersion === 1)); assert.equal(recipients.length, 0);
  assert.equal((await ok({ action: 'review', id: batch.id, companyId: company.id, subject: batch.data.subject, body: batch.data.body })).batch.id, batch.id);
  const send = b => post({ action: 'send', id: b.id, version: b.version, confirmTo: b.data.recipients.map(r => r.email), confirmFrom: b.data.sender });
  canSend = false; assert.equal((await send(batch)).status, 403); canSend = true;
  assert.equal((await post({ action: 'send', id: batch.id, version: batch.version, confirmTo: ['intruder@example.test'], confirmFrom: batch.data.sender })).status, 409);
  let release; delaySend = new Promise(resolve => { release = resolve; });
  const first = send(batch); await new Promise(resolve => setTimeout(resolve, 20)); assert.equal((await send(batch)).status, 409); release(); assert.equal((await first).status, 200); delaySend = null;
  assert.equal(recipients.length, 1); assert(recipients[0].html.includes('Ayşe')); assert(recipients[0].html.includes('Managing Director')); assert(recipients[0].html.includes('Oğuzhan')); assert.deepEqual(recipients[0].envelope.to, ['ayse@example.test','mehmet@example.test']); assert.equal(recipients[0].cc[0].address, 'mehmet@example.test'); assert(!recipients[0].bcc);
  assert.equal((await send(batch)).status, 409);
  let data = await (await get()).json(); assert.equal(data.stats[company.id].sent, 1); assert.equal(data.stats[company.id].touches, 1); assert.equal(data.mails[0].data.html, '');
  batch = await review(); const changed = await store.findCrmRecord(batch.data.recipients[0].mailId); await store.saveCrmRecord(changed, { ...changed.data, body: 'Changed after review' }, 'Other user');
  assert.equal((await send(batch)).status, 200); assert.equal(recipients.length, 1, 'a changed reviewed group draft must not send');
  batch = await review(); smtpError = 'ETIMEDOUT'; const originalLog = console.error; console.error = () => {}; assert.equal((await send(batch)).status, 200); console.error = originalLog; smtpError = '';
  const uncertain = (await store.findCrmRecord(batch.id)).data; assert(uncertain.results.every(r => r.state === 'Belirsiz')); assert.equal((await send(batch)).status, 409);
  batch = await review();
  const groupMail = await store.findCrmRecord(batch.data.recipients[0].mailId);
  const tampered = await mailRoute.POST(new Request('https://portal.test/api/crm/mail', {method:'POST',headers:{Origin:'https://portal.test'},body:JSON.stringify({action:'send',id:groupMail.id,version:groupMail.version,confirmTo:groupMail.data.to,confirmCc:['intruder@example.test'],confirmFrom:batch.data.sender})}));
  assert.equal(tampered.status,409);
  const refusal = await store.insertCrmRecord('company',{...fields,name:'CC refusal',email:'mehmet@example.test',contacts:[],permission:'Ret',customerId:null,source:'Manuel'},'Test');
  assert.equal((await send(batch)).status,200); assert.equal(recipients.length,1,'CC refusal must block the whole message'); rows=rows.filter(r=>r.id!==refusal.id);
  batch = await review(); partial=true; const silent=console.error; console.error=()=>{}; assert.equal((await send(batch)).status,200); console.error=silent; partial=false;
  const partialMail=await store.findCrmRecord(batch.data.recipients[0].mailId); assert.equal(partialMail.data.state,'Belirsiz'); assert.deepEqual(partialMail.data.acceptedRecipients,['ayse@example.test']); assert.deepEqual(partialMail.data.rejectedRecipients,['mehmet@example.test']); assert.equal((await send(batch)).status,409);
  batch = await review(); const latest = await store.findCrmRecord(company.id); await store.saveCrmRecord(latest, { ...latest.data, priority: 'Düşük' }, 'Other'); assert.equal((await send(batch)).status, 409);
  canIncoming = false; assert.equal((await get('?incoming=1')).status, 403); canIncoming = true;
  await ok({ action: 'matchReply', companyId: company.id, sourceId: 45 }); await ok({ action: 'matchReply', companyId: company.id, sourceId: 45 });
  data = await (await get()).json(); assert.equal(data.stats[company.id].replies, 1); assert.equal((await (await get('?incoming=1')).json()).incoming.length, 0);
  const currentCompany = await store.findCrmRecord(company.id); await ok({ action: 'status', companyId: company.id, version: currentCompany.version, status: 'Telefon / ziyaret' }); assert.equal((await post({ action: 'status', companyId: company.id, version: currentCompany.version, status: 'Olumsuz' })).status, 409);
  const templates = [ {id:'general',data:{name:'Genel',subject:'Hizmetler',body:'Merhaba'}}, {id:'cosmetics',data:{name:'Kozmetik',subject:'Stabilite',body:'Kozmetik analizleri'}} ];
  assert.equal(sales.recommendSalesTemplate(templates, company.data).id, 'cosmetics');
  const signature = '<div>Oğuzhan EKER Managing Director www.uniqueanalyse.com</div>';
  assert.equal(email.appendCrmSignature(signature, signature), signature);
  assert(email.appendCrmSignature('<p>Merhaba</p>', signature).includes('Managing Director'));
  console.log('PASS AI sales: company fields, permissions/origin, durable idempotent notes/drafts, scoped AI context, review without send, primary + CC grouping, shared signature, concurrency/replay safety, changed draft/company blocking, uncertain SMTP preservation, counts/touches, reply deduplication and status conflict. Fake AI/SMTP/database only.');
})().catch(error => { console.error(error); process.exitCode = 1; });
