/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
const mod = { exports: {} };
let user = {};
let allowed = true;
let file = { type: 'application/pdf', name: 'test.pdf', buffer: Buffer.from('fixture'), size: 7 };
let document = { tur: 'Prosedür', kod: 'P001', baslik: 'Test' };
const mocks = {
  '@/lib/portalYetki': { getPortalUser: async () => user },
  '@/lib/kysDokumanYetki': { dokumanYetkileri: () => ({ goruntule: allowed }) },
  '@/lib/kysDokumanStore': { getKysDokuman: async () => document, getKysDokumanDosya: async () => file },
  '@/lib/officePdf': { isWordFile: type => type.includes('word') },
};
const code = ts.transpileModule(fs.readFileSync('app/api/kys/dokumanlar/[id]/dosya/route.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
new Function('require', 'module', 'exports', code)(name => mocks[name] || require(name), mod, mod.exports);
const get = url => mod.exports.GET(new Request(url), { params: Promise.resolve({ id: '72' }) });
async function run() {
  for (const origin of ['https://0.0.0.0:3000', 'http://localhost:1038', 'https://lab.uniqueanalyse.com']) {
    const response = await get(`${origin}/api/kys/dokumanlar/72/dosya`);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/laboratuvar/kys/dokuman-yonetimi/72/onizleme');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
  let response = await get('https://0.0.0.0:3000/api/kys/dokumanlar/72/dosya?download=1');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition'), /^attachment/);
  document = { ...document, tur: 'Form' };
  file = { ...file, type: 'application/msword', name: 'test.doc' };
  assert.equal((await get('https://0.0.0.0:3000/api/kys/dokumanlar/72/dosya')).status, 302);
  allowed = false;
  assert.equal((await get('https://portal.test/api/kys/dokumanlar/72/dosya')).status, 403);
  user = null;
  assert.equal((await get('https://portal.test/api/kys/dokumanlar/72/dosya')).status, 401);
  console.log('PASS: proxy/local/public preview redirects preserve browser origin; explicit download and access checks preserved. No live requests.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
