/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
let sent;
let serviceQueries = 0;
let missingServices = false;
const queries = [];
const pool = { request() { const params = {}; return {
  input(key, value) { params[key] = value; return this; },
  async query(sql) {
    queries.push({ sql, params });
    if (sql.includes('INNER JOIN ProformaKalem')) {
      serviceQueries++;
      return { recordset: missingServices ? [] : [
        { ProformaNo: 'PF-123', HizmetAdi: 'Analiz <A>', Adet: 2, BirimFiyat: 100, Iskonto: 10, Tutar: 180, ParaBirimi: 'TRY' },
        { ProformaNo: 'PF-123', HizmetAdi: 'Test & B', Adet: 1, BirimFiyat: 25, Iskonto: 0, Tutar: 25, ParaBirimi: 'USD' },
      ] };
    }
    if (sql.includes('FROM Fatura f')) return { recordset: [{ ID: 42, FaturaNo: 'FT-42', Tarih: '2026-10-12', VadeTarihi: '2026-11-12', Tutar: 1200, DirektOdenen: 200, Mahsup: 100, FirmaAd: 'Firma <A>', OdemeDurumu: 'Ödeme Bekliyor' }] };
    if (sql.includes('FROM Firma WHERE')) return { recordset: [{ FirmaAd: 'Firma <A>' }] };
    return { recordset: [] };
  },
}; } };
function load(file, imports = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, { module: mod, exports: mod.exports, process, console, Response, Date,
    require: name => { if (!(name in imports)) throw new Error('Unexpected import: ' + name); return imports[name]; },
  });
  return mod.exports;
}
const template = load('lib/laboratuvarMailTemplate.ts');
const content = load('lib/invoiceMailContent.ts');
const api = load('app/api/musteriler/cari-mail/route.ts', {
  'nodemailer': { createTransport: () => ({ sendMail: async mail => { sent = mail; } }) },
  'next-auth': { getServerSession: async () => ({ user: { userId: '2' } }) },
  '@/lib/auth': {}, '@/lib/db': { cosmoPool: Promise.resolve(pool) },
  '@/lib/settings': { getAllSettings: async () => ({ MAIL_HOST: 'smtp.test', MAIL_USER: 'test', MAIL_PASS: 'test' }) },
  '@/lib/laboratuvarMailTemplate': template, '@/lib/invoiceMailContent': content,
  'node:fs': { existsSync: () => false }, 'node:path': path,
});
const send = body => api.POST({ json: async () => ({ to: 'customer@example.test', faturaId: 42, firmaId: 7, ...body }) });
(async () => {
  assert.equal((await send({ mode: 'fatura' })).status, 200);
  assert.ok(sent.html.includes(content.invoiceMailMessage));
  assert.ok(sent.html.includes('Analiz &lt;A&gt;'));
  assert.ok(sent.html.includes('Test &amp; B'));
  for (const text of ['1.200,00 TL', '300,00 TL', '900,00 TL', '100,00 TRY', '180,00 TRY', '25,00 USD', '%10', 'PF-123', ...content.invoiceMailClosing]) assert.ok(sent.html.includes(text), text);
  assert.ok(sent.html.indexOf('Hizmet Detayları') < sent.html.indexOf('Yanlışlık olduğunu'));
  assert.ok(sent.html.indexOf('Yanlışlık olduğunu') < sent.html.indexOf('Ödeme için banka'));
  const serviceQuery = queries.find(q => q.sql.includes('INNER JOIN ProformaKalem'));
  assert.equal(serviceQuery.params.faturaId, 42);
  assert.match(serviceQuery.sql, /pb.ProformaNo=f.ProformaNo OR pb.EvrakNo=f.ProformaNo/);
  assert.match(serviceQuery.sql, /pb.SilindiMi=0/);
  const previous = serviceQueries;
  assert.equal((await send({ mode: 'firma' })).status, 200);
  assert.equal(serviceQueries, previous);
  assert.ok(!sent.html.includes('Ödeme için banka'));
  missingServices = true;
  assert.equal((await send({ mode: 'fatura', message: '<script>test</script>' })).status, 200);
  assert.ok(sent.html.includes('proforma hizmet detayı bulunamadı'));
  assert.ok(sent.html.includes('&lt;script&gt;test&lt;/script&gt;'));
  assert.ok(!sent.html.includes('<script>'));
  console.log('PASS: invoice services, discounts/currencies, authoritative invoice totals, bank details, reference matching, missing proforma, escaping and unchanged account statement. No email sent.');
})().catch(error => { console.error(error); process.exitCode = 1; });
