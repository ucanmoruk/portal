require('./register-local-ts.cjs');
const assert = require('node:assert/strict');
let renders = 0;
require.cache[require.resolve('next-auth')] = { exports: { getServerSession: async () => ({ user: { name: 'Test' } }) } };
require.cache[require.resolve('../lib/auth.ts')] = { exports: { authOptions: {} } };
require.cache[require.resolve('../lib/raporPdfBaseUrl.ts')] = { exports: { getRaporPdfBaseUrl: () => 'http://localhost:1038' } };
require.cache[require.resolve('../lib/chromiumPdf.ts')] = { exports: { renderUrlToPdf: async (url, options) => {
  assert.equal(url, 'http://localhost:1038/teklif-print/123?pdfMode=1');
  assert.equal(options.cookieHeader, 'session=test');
  assert.ok(options.readyExpression.includes('.quote-print-page'));
  renders++;
  return Buffer.from('%PDF-1.4 test');
} } };
require.cache[require.resolve('../lib/db.ts')] = { exports: { cosmoPool: Promise.resolve({ request() { return {
  input() { return this; }, async query(sql) {
    assert.match(sql.trim(), /^SELECT/);
    assert.doesNotMatch(sql, /\b(UPDATE|INSERT|DELETE|ALTER)\b/i);
    return { recordset: [{ FirmaAd: 'Örnek Firma' }] };
  }
}; } }) } };
const { GET } = require('../app/api/teklif-print/[id]/pdf/route.ts');
const { NextRequest } = require('next/server');
(async () => {
  for (const download of ['1', '0']) {
    const response = await GET(new NextRequest(`http://localhost:1038/api/teklif-print/123/pdf?download=${download}`, { headers: { cookie: 'session=test' } }), { params: Promise.resolve({ id: '123' }) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.match(response.headers.get('content-disposition'), download === '1' ? /^attachment/ : /^inline/);
    assert.match(await response.text(), /^%PDF-/);
  }
  assert.equal(renders, 2);
  console.log('PASS: PDF download/preview only read data, forward session, wait for content and return PDF');
})().catch(error => { console.error(error); process.exitCode = 1; });
