// Catalogue and transactional-write fixtures only: never changes a customer formula.
require('./register-local-ts.cjs');
const fs = require('node:fs'), ts = require('typescript'), assert = require('node:assert/strict');
function load(file, mocks) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const mod = { exports: {} }; new Function('require', 'module', 'exports', code)(name => name in mocks ? mocks[name] : require(name), mod, mod.exports); return mod.exports;
}
let queries = [];
const cataloguePool = { request() { return { input() { return this; }, async query(sql) {
  queries.push(sql);
  return { recordset: sql.includes('FROM rCosing') ? [
    { ID: 1, INCIName: 'AQUA', Cas: '7732-18-5', EC: 'E', Regulation: 'V/1', Kategori: 'Test' },
    { ID: 2, INCIName: 'GLYCERIN', Cas: '56-81-5' },
  ] : sql.includes('FROM rHammadde') ? [{ cID: 1, Noael2: 0, Fizikokimya: 'P', Toksikoloji: 'T', Kaynak: 'S' }] : [
    { ID: 1, INCI: 'SOME GLYCERIN DERIVATIVE', Maks: 'substring' },
    { ID: 2, INCI: 'AQUA', Maks: 'name' },
    { ID: 3, INCI: 'DIFFERENT', YonetmelikNo: 'V/1', Maks: 'regulation', YonetmelikUrunTipi: 'Scope' },
    { ID: 4, INCI: 'GLYCERIN', Maks: 'exact' },
  ] };
} }; } };
const engine = load('lib/ugdFormulaMatch.ts', { '@/lib/db': { __esModule: true, default: Promise.resolve(cataloguePool) } });
let working, committed = [{ INCIName: 'OLD' }], fail = false, inserts = 0, rollback = 0;
function request(tx) { const params = {}; return { input(k, v) { params[k] = v; return this; }, async query(sql) {
  if (sql.startsWith('CREATE')) return { recordset: [] };
  if (sql.startsWith('SELECT')) return { recordset: [{ ID: 123 }] };
  if (sql.startsWith('DELETE FROM NKR_Formul')) { assert(tx); working = []; }
  if (sql.startsWith('INSERT INTO NKR_Formul')) { inserts++; if (fail) throw Error('fixture failure'); for (let i = 0; `n${i}` in params; i++) working.push({ INCIName: params[`n${i}`], Noael: params[`a${i}`], DaP: params[`d${i}`] }); }
  return { recordset: [], rowsAffected: [1] };
} }; }
const writePool = { request: () => request(false), transaction() { return { async begin() { working = structuredClone(committed); }, request: () => request(true), async commit() { committed = working; }, async rollback() { rollback++; } }; } };
const persistence = load('lib/labUgdrFormulaSave.ts', { '@/lib/db': {}, '@/lib/mysqlCompat': { hasMysqlConfig: () => true } });
(async () => {
  const result = await engine.matchUgdFormula(Array.from({ length: 100 }, (_, i) => ({ name: ['aqua', '56-81-5', 'UNKNOWN'][i % 3], amount: '0,25' })));
  assert.equal(queries.length, 3); assert.equal(result.length, 100);
  assert.equal(result[0].INCIName, 'AQUA'); assert.equal(result[0].Maks, 'regulation'); assert.equal(result[0].noael, '0');
  assert.equal(result[1].INCIName, 'GLYCERIN'); assert.equal(result[1].Maks, 'exact'); assert.equal(result[1].inputAmount, '0.25');
  assert.equal(result[2].matched, false); assert.equal(result[2].inputName, 'UNKNOWN');
  assert(!engine.FormulaMatchInput.safeParse({ items: [] }).success);
  assert(!engine.FormulaMatchInput.safeParse({ items: Array.from({ length: 251 }, () => ({ name: 'A' })) }).success);
  const rows = persistence.LabFormulaInput.parse({ rows: Array.from({ length: 205 }, (_, i) => ({ cosingId: 1, INCIName: `Fixture ${i}`, inputAmount: '0,2', dap: 0, noael: '0' })) }).rows;
  fail = true; await assert.rejects(() => persistence.saveLabFormula(writePool, 123, rows)); assert.deepEqual(committed, [{ INCIName: 'OLD' }]); assert.equal(rollback, 1);
  fail = false; inserts = 0; await persistence.saveLabFormula(writePool, 123, rows); assert.equal(inserts, 3); assert.equal(committed.length, 205); assert.equal(committed[0].DaP, 0); assert.equal(committed[0].Noael, '0');
  console.log('PASS: 100 ingredients in three reads, CAS/name/decimal matching, regulation precedence, unknown preservation, bounded inputs, bulk formula writes and rollback. No DB used.');
})().catch(error => { console.error(error); process.exitCode = 1; });
