/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS regression runner. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const queries = [];
const pool = { request() {
  const inputs = {};
  return { input(name, value) { inputs[name] = value; return this; }, async query(sql) {
    queries.push({ sql, inputs });
    return { recordset: [{ NextNo: inputs.minEvrakNo ?? inputs.minRaporNo }] };
  } };
} };
const imports = { 'next-auth': { getServerSession: async () => ({ user: {} }) }, '@/lib/auth': { authOptions: {} }, '@/lib/db': { cosmoPool: Promise.resolve(pool) } };
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/numune-form/next-no/route.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { module: mod, exports: mod.exports, Response, Date, console, require: name => imports[name] || require(name) });
(async () => {
  const numbers = {};
  for (const group of ['Özel', 'Belge', 'K.D.']) {
    queries.length = 0;
    const response = await mod.exports.GET({ nextUrl: new URL('http://localhost/api/numune-form/next-no?grup=' + encodeURIComponent(group)) });
    assert.equal(response.status, 200);
    numbers[group] = await response.json();
    if (group === 'K.D.') assert.match(queries[1].sql, /Grup = @grup/);
    else assert.match(queries[1].sql, /Grup IN \(N'Özel', N'Belge'\)/);
  }
  assert.deepEqual(numbers.Belge, numbers['Özel']);
  assert.notEqual(numbers.Belge.evrakNo, numbers['K.D.'].evrakNo);
  console.log('PASS: Belge/Özel shared numbering and unchanged K.D. sequence; no records saved.');
})().catch(error => { console.error(error); process.exitCode = 1; });
