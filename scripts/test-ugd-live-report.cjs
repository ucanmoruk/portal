// Synthetic report fixtures only. Database and authentication are mocked.
require('./register-local-ts.cjs');
const fs = require('node:fs'), ts = require('typescript'), assert = require('node:assert/strict');
const live = require('../lib/ugdLiveReport.ts');
function load(file, mocks = {}) {
  const input = fs.readFileSync(file, 'utf8').replaceAll('import.meta.url', JSON.stringify(require('node:url').pathToFileURL(require('node:path').resolve(file)).href));
  const source = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => name in mocks ? mocks[name] : require(name), mod, mod.exports);
  return mod.exports;
}
const sections = [
  { key: 's1', title: 'Ürün', html: '<h1>EDITED_REPORT_42</h1><div class="company">MANUAL_COMPANY_42</div><table><tr><th>COMPONENT</th><th>SED</th></tr><tr><td>MANUAL_INGREDIENT_42</td><td>11.25</td></tr></table>' },
  { key: 's2', title: 'Boş', html: '' },
  { key: 's3', title: 'Ek', html: '<p>İçerik: Türkçe ıİşçöü 𝄞</p><img alt="fixture" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvZkAAAAASUVORK5CYII=">' },
];
const packed = live.packLiveReport(sections), key = { source: 'lab', recordId: 123, language: 'en', profile: 'lab' };
let authorized = true, writes = [], failWrite = false, selected = null;
const db = { config: { __mysql: true }, request() {
  const params = {};
  return { input(k, v) { params[k] = v; return this; }, async query(sql) {
    if (sql.startsWith('INSERT')) { if (failWrite) throw new Error('fixture write failure'); writes.push(params); return { rowsAffected: [1], recordset: [] }; }
    return { rowsAffected: [], recordset: selected ? [selected] : [] };
  } };
} };
const store = load('lib/ugdLiveReportStore.ts', { '@/lib/db': { __esModule: true, default: Promise.resolve(db) }, '@/lib/ugdLiveReport': live });
const auth = { 'next-auth': { getServerSession: async () => authorized ? { user: {} } : null }, '@/lib/auth': { authOptions: {} } };
const api = load('app/api/urunler/canli-rapor/route.ts', { ...auth, '@/lib/ugdLiveReportStore': store, '@/lib/ugdLiveReport': live });
const request = body => new Request('https://portal.example/api/urunler/canli-rapor', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
(async () => {
  assert.deepEqual(live.restoreLiveReportSections(packed.bodyHtml, packed.sections), sections);
  assert.deepEqual(live.restoreLiveReportSections(packed.bodyHtml, sections), sections);
  assert.equal(live.restoreLiveReportSections(packed.bodyHtml, [{ key: 'bad', start: 5, end: 999 }]).map(s => s.html).join(''), packed.bodyHtml);
  const large = live.packLiveReport([{ key: 's1', title: 'Photo', html: '<img src="data:image/png;base64,' + 'a'.repeat(2000000) + '">' }]);
  assert(JSON.stringify(large.sections).length < 200);
  authorized = false; assert.equal((await api.POST(request({ ...key, sections }))).status, 401); authorized = true;
  assert.equal((await api.POST(request({ ...key, sections, headHtml: '<style>table{border-collapse:collapse}</style>' }))).status, 200);
  assert.equal(writes.length, 1); assert.equal(writes[0].BodyHtml, packed.bodyHtml); assert(!writes[0].SectionsJson.includes('data:image'));
  failWrite = true; assert.equal((await api.POST(request({ ...key, sections }))).status, 500); failWrite = false;
  selected = { ID: 10, BodyHtml: packed.bodyHtml, HeadHtml: '<style>p{font-size:12px}</style>', SectionsJson: JSON.stringify(sections), CreatedAt: '2026-11-05' };
  const compact = await (await api.GET(new Request('https://portal.example/api/urunler/canli-rapor?source=lab&recordId=123&language=en&profile=lab&compact=1'))).json();
  assert.deepEqual(live.restoreLiveReportSections(compact.item.bodyHtml, compact.item.sections), sections);
  const legacy = await (await api.GET(new Request('https://portal.example/api/urunler/canli-rapor?source=lab&recordId=123&language=en&profile=lab'))).json();
  assert.deepEqual(legacy.item.sections, sections);
  let lookedUp = [], wordHtml = '';
  const render = load('app/api/urunler/rapor-sablon/route.ts', {
    ...auth, '@/lib/chromiumPdf': load('lib/chromiumPdf.ts', { '@/lib/loadDotenv': { loadDotenvOnce() {} } }), '@/lib/db': { __esModule: true, default: Promise.resolve(db), cosmoPool: Promise.resolve(db) },
    '@/lib/ugdLiveReportStore': { async loadLiveReport(k) { lookedUp.push(k); return selected ? { bodyHtml: packed.bodyHtml, headHtml: '<style>body{font-family:Arial}</style>' } : null; } },
    '@/lib/ugdRegulationLookup': { async enrichUgdFormulaRows() { throw new Error('Saved reports must not regenerate formula tables'); } },
    'html-to-docx': async html => { wordHtml = html; return Buffer.from('docx-fixture'); },
  });
  for (const language of ['tr', 'en', 'cpsr']) {
    const res = await render.POST(new Request(`https://portal.example/api/urunler/rapor-sablon?format=docx&language=${language}&profile=lab`, { method: 'POST', body: JSON.stringify({ form: { ID: 123, RaporNo: 'TEST' }, language, profile: 'lab' }) }));
    assert.equal(res.status, 200); assert(wordHtml.includes('MANUAL_COMPANY_42')); assert(wordHtml.includes('MANUAL_INGREDIENT_42')); assert(wordHtml.includes('11.25')); assert.equal(lookedUp.at(-1).language, language);
  }
  const explicitHtml = live.liveReportDocument('', packed.bodyHtml);
  const preview = await render.POST(new Request('https://portal.example/api/urunler/rapor-sablon?format=html&language=en&profile=lab', { method: 'POST', body: JSON.stringify({ form: {}, editedHtml: explicitHtml }) }));
  assert.equal(await preview.text(), explicitHtml);
  if (process.argv.includes('--pdf')) {
    const response = await render.POST(new Request('https://portal.example/api/urunler/rapor-sablon?format=pdf&language=en&profile=lab', { method: 'POST', body: JSON.stringify({ form: { ID: 123, RaporNo: 'TEST' } }) }));
    assert.equal(response.status, 200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    fs.mkdirSync('output/ugd-live-report', { recursive: true }); fs.writeFileSync('output/ugd-live-report/edited-fixture.pdf', bytes);
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdf = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;
    let text = ''; for (let i = 1; i <= pdf.numPages; i++) text += (await (await pdf.getPage(i)).getTextContent()).items.map(item => item.str).join(' ');
    assert(text.includes('MANUAL_COMPANY_42')); assert(text.includes('MANUAL_INGREDIENT_42')); assert(text.includes('11.25'));
    await pdf.destroy();
  }
  console.log('PASS: compact/legacy snapshots, Unicode and images, write failure, TR/EN/CPSR saved output, edited tables and optional real PDF text. No database writes.');
})().catch(error => { console.error(error); process.exitCode = 1; });
