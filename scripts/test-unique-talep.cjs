// Synthetic fixtures only. Never opens a mailbox, database, AI provider or SMTP connection.
require('./register-local-ts.cjs');
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
const rules = require('../lib/uniqueTalepRules.ts');
function compile(file, mocks) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => name in mocks ? mocks[name] : require(name), mod, mod.exports);
  return mod.exports;
}
const fixture = () => ({ id: 1, version: 1, source: 'test', date: new Date().toISOString(), name: 'Test Firma', email: 'customer@example.com', messageId: '<test@example.com>', subject: 'Analiz fiyat teklifi', text: 'İki ürün için pH analizi fiyatı rica ederiz.', ...rules.classifyUniqueMail('Analiz fiyat teklifi', '', 'customer@example.com'), status: 'Bekliyor', companyId: 5, companyName: 'Test Firma', offer: null, quoteId: null, mailState: 'Taslak', sentAt: null, sentMessageId: '', error: '' });
const offer = { recipient: 'Test Firma', email: 'customer@example.com', subject: 'pH analizi', replySubject: 'Re: Analiz fiyat teklifi', replyBody: '<script>test</script>\nTeklifimiz ektedir.', warnings: [], items: [{ serviceId: 9, name: 'pH', quantity: 2, price: 150, currency: 'TRY', method: 'ISO', accreditation: '' }] };
let row, authorized = true, sent = [], quotes = 0, updates = 0, badPdf = false, smtpError = false;
const pool = { request() { return { input() { return this; }, async query(sql) { if (sql.includes('Firma_Adi')) return { recordset: [{ Firma_Adi: 'Test Firma' }] }; updates++; return { recordset: [], rowsAffected: [1] }; } }; } };
const route = compile('app/api/unique-talep/[id]/route.ts', {
  '@/lib/portalYetki': { async getPortalUser() { return authorized ? { can: () => true } : null; } },
  '@/lib/uniqueTalepStore': {
    async getUniqueRequest() { return structuredClone(row); },
    async saveUniqueRequest(next) { if (next.version !== row.version) throw new Error('version conflict'); row = { ...structuredClone(next), version: next.version + 1 }; return structuredClone(row); },
  },
  '@/lib/uniqueTalepRules': rules, '@/lib/crmOffer': require('../lib/crmOffer.ts'),
  '@/lib/crmCatalog': { async getCrmCatalog() { return { services: [{ ID: 9, Ad: 'pH', Fiyat: 150, ParaBirimi: 'TRY', Metot: 'ISO', Akreditasyon: '' }], packages: [] }; } },
  '@/lib/crmKnowledgeStore': { async getCrmKnowledge() { return { content: {} }; } },
  '@/lib/crmKnowledgeRules': { crmKnowledgePrompt() { return ''; } }, '@/lib/crmPrompt': { CRM_SYSTEM_PROMPT: 'system' },
  '@/lib/crmAi': { crmAiConfig() { return {}; }, async requestCrmAnalysis() { return { answer: 'Taslak', offer: { ...offer, items: [{ serviceId: 9, quantity: 2 }] } }; } },
  '@/lib/db': { cosmoPool: Promise.resolve(pool) },
  '@/lib/settings': { async getAllSettings() { return { MAIL_USER: 'info@uniqueanalyse.com', MAIL_HOST: 'test.invalid', MAIL_PASS: 'fixture' }; } },
  '@/app/api/teklifler/route': { async POST(req) { const body = await req.json(); assert.equal(body.musteriId, 5); assert.equal(body.satirlar[0].fiyat, 150); quotes++; return Response.json({ id: 77 }); } },
  '@/app/api/teklifler/[id]/route': { async PUT() { return Response.json({ success: true }); } },
  '@/app/api/teklif-print/[id]/pdf/route': { async GET() { return badPdf ? Response.json({ error: 'pdf failure' }, { status: 500 }) : new Response('%PDF-1.7 fixture', { headers: { 'content-type': 'application/pdf' } }); } },
  '@/lib/kysSupplierMailPolicy': { mailEscape: value => value.replace(/</g, '&lt;').replace(/>/g, '&gt;') },
  nodemailer: { createTransport() { return { async sendMail(message) { if (smtpError) throw new Error('SMTP timeout'); sent.push(message); return { accepted: [message.to], rejected: [], messageId: 'sent-fixture' }; } }; } },
});
async function post(action, extra = {}) {
  return route.POST(new Request('https://portal.example/api/unique-talep/1', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, version: row.version, offer, ...extra }) }), { params: Promise.resolve({ id: '1' }) });
}
(async () => {
  const { NextRequest } = require('next/server');
  const proxy = compile('proxy.ts', { 'next-auth/jwt': { async getToken() { return null; } } }).default;
  const cronProxy = await proxy(new NextRequest('https://portal.example/api/cron/unique-talep'));
  assert.equal(cronProxy.headers.get('x-middleware-next'), '1');
  assert.equal((await proxy(new NextRequest('https://portal.example/api/unique-talep'))).status, 401);
  let cronCalls = 0;
  const cron = compile('app/api/cron/unique-talep/route.ts', { '@/lib/loadDotenv': { loadDotenvOnce() {} }, '@/lib/uniqueTalepMailbox': { async syncUniqueMailbox() { cronCalls++; return { added: 0 }; } } });
  assert.equal((await cron.GET(new Request('https://portal.example/api/cron/unique-talep'))).status, 401);
  assert.equal(cronCalls, 0);
  const oldSecret = process.env.KYS_TELEGRAM_CRON_SECRET;
  try {
    process.env.KYS_TELEGRAM_CRON_SECRET = 'fixture-key-for-cron-authorization-test';
    assert.equal((await cron.GET(new Request('https://portal.example/api/cron/unique-talep', { headers: { authorization: 'Bearer ' + process.env.KYS_TELEGRAM_CRON_SECRET } }))).status, 200);
    assert.equal(cronCalls, 1);
  } finally { if (oldSecret === undefined) delete process.env.KYS_TELEGRAM_CRON_SECRET; else process.env.KYS_TELEGRAM_CRON_SECRET = oldSecret; }
  assert.equal(rules.classifyUniqueMail('Analiz fiyat teklifi', 'pH testi rica ederiz', 'a@example.com').potential, true);
  assert.equal(rules.classifyUniqueMail('Laboratory quotation', 'Please quote cosmetic testing', 'a@example.com').category, 'Fiyat Teklifi');
  assert.equal(rules.classifyUniqueMail('Analiz kampanyası', 'unsubscribe price test', 'noreply@example.com').potential, false);
  assert.equal(rules.classifyUniqueMail('Merhaba', 'İyi günler', 'a@example.com').potential, false);
  row = fixture(); authorized = false; assert.equal((await post('send')).status, 401); authorized = true;
  assert.equal((await post('send', { version: 999 })).status, 409); assert.equal(sent.length, 0);
  assert.equal((await post('edit', { status: 'Teklif İletildi' })).status, 400);
  assert.equal((await post('analyze')).status, 200); assert.equal(row.offer.items[0].price, 150);
  assert.equal((await post('draft')).status, 200); assert.equal(quotes, 0); assert.equal(sent.length, 0);
  row.companyId = null; assert.equal((await post('send')).status, 400); row.companyId = 5;
  assert.equal((await post('send', { offer: { ...offer, items: [{ ...offer.items[0], quantity: -1 }] } })).status, 400);
  badPdf = true; assert.equal((await post('send')).status, 400); assert.equal(sent.length, 0); assert.equal(row.mailState, 'Taslak'); assert.equal(row.quoteId, 77);
  badPdf = false; assert.equal((await post('send')).status, 200); assert.equal(quotes, 1); assert.equal(sent.length, 1);
  assert.equal(row.status, 'Teklif İletildi'); assert.equal(row.mailState, 'Gönderildi'); assert.ok(row.sentAt); assert.equal(updates, 1);
  assert.equal(sent[0].attachments[0].contentType, 'application/pdf'); assert.equal(sent[0].to, offer.email); assert.ok(sent[0].text.includes('Oğuzhan Eker')); assert.ok(!sent[0].html.includes('<script>')); assert.equal(sent[0].inReplyTo, '<test@example.com>');
  assert.equal((await post('send')).status, 400); assert.equal(sent.length, 1);
  assert.equal((await post('edit', { status: 'Onaylandı' })).status, 200);
  row = fixture(); smtpError = true; assert.equal((await post('send')).status, 400); assert.equal(row.mailState, 'Belirsiz'); assert.equal(row.status, 'Bekliyor');
  smtpError = false; assert.equal((await post('send')).status, 400); assert.equal(sent.length, 1);
  console.log('PASS: classification, auth, version conflict, company, catalog price, quote reuse, PDF failure, signed PDF email, sent status and duplicate/uncertain send protection. No external calls.');
})().catch(error => { console.error(error); process.exitCode = 1; });
