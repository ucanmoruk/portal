/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
function load(file, mocks) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => mocks[name] || require(name), mod, mod.exports);
  return mod.exports;
}
const queries = [];
const pool = { request() {
  const inputs = {};
  return { input(key, value) { inputs[key] = value; return this; }, async query(sql) {
    queries.push({ sql, inputs });
    return { recordset: sql.includes('information_schema.columns') ? [{ present: 1 }] : [], rowsAffected: [0] };
  } };
} };
const store = load('lib/kysDokumanStore.ts', {
  '@/lib/db': { cosmoPool: Promise.resolve(pool) },
  '@/lib/mysqlCompat': { hasMysqlConfig: () => true },
  '@/lib/htmlSanitize': {}, '@/lib/kysTextCase': {}, '@/lib/kysDocumentSpacing': {},
});
async function run() {
  for (const [mode, expected] of [
    ['title-code', '(Kod LIKE @search OR Baslik LIKE @search)'],
    ['content', 'DuzMetin LIKE @search'],
  ]) {
    queries.length = 0;
    await store.listKysDokumanlar({ search: 'ölçüm', searchMode: mode, sort: 'kod-asc' });
    const searches = queries.filter(q => q.sql.includes('WHERE 1=1 AND'));
    assert.equal(searches.length, 2, 'Count and list must use the same search scope');
    for (const { sql, inputs } of searches) {
      const where = sql.split('WHERE 1=1')[1].split('ORDER BY')[0].trim();
      assert.equal(where, `AND ${expected}`);
      assert.equal(inputs.search, '%ölçüm%');
    }
  }
  console.log('PASS: code/title and content scopes remain separate in both list and count queries; search stays parameterized. No live DB used.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
