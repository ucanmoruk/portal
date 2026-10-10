/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let assignment = 7;
const units = [{ id: 7, legacyId: 103, ad: 'Mikrobiyoloji', durum: 'Aktif' }, { id: 8, legacyId: 104, ad: 'Kimyasal', durum: 'Aktif' }];
const services = [{ ID: 11, X1ID: 11, AnalizID: 1, department: 7 }, { ID: 12, X1ID: 12, AnalizID: 2, department: 8 }];
let writes = 0;
const pool = { request() { const params = {}; return { input(k,v) { params[k]=v; return this; }, async query(sql) {
  if (sql.includes('FROM RootKullanici')) return { recordset: assignment ? [{ LaboratuvarBirimID: assignment }] : [] };
  if (sql.includes('sys.columns')) return { recordset: [{ name: 'Sonuc' }, { name: 'Degerlendirme' }] };
  if (sql.includes('INFORMATION_SCHEMA.TABLES')) return { recordset: [] };
  if (sql.includes('UPDATE NumuneX1')) { writes++; return { recordset: [], rowsAffected: [1] }; }
  if (sql.includes('FROM NumuneX1')) {
    const department = /s.BolumID=(\d+)/.exec(sql);
    const ids = /x1.ID IN \(([^)]+)\)/.exec(sql);
    return { recordset: services.filter(s => (!department || s.department === Number(department[1])) && (!ids || ids[1].split(',').map(Number).includes(s.ID)) && !sql.includes('1=0')) };
  }
  return { recordset: [] };
} }; } };
function load(file, imports) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: mod, exports: mod.exports, console, Response, require: n => imports[n] || {} });
  return mod.exports;
}
(async () => {
  const access = load('lib/labResultAccess.ts', { './userStore': { getUserPool: async () => pool }, './kysStore': { listKysBirimler: async () => units }, './db': { cosmoPool: Promise.resolve(pool) }, './serviceDepartments': { ensureServiceDepartments: async () => {} } });
  const session = { user: { userId: '3', laboratuvarBirimId: 8 } };
  const scope = await access.getLabScope(session);
  assert.equal(scope.departmentId, 7); // Current DB assignment overrides stale login.
  await access.assertLabServices(scope, 1, [11]);
  await assert.rejects(access.assertLabServices(scope, 1, [11,12]), /kendi laboratuvar/);
  await assert.rejects(access.assertLabFormat(scope, 1, 'Challenge'), /kendi laboratuvar/);
  assignment = null; assert.equal((await access.getLabScope(session)).departmentId, null);
  assignment = 7;
  const route = load('app/api/rapor-takip/[nkrId]/hizmetler/route.ts', {
    '@/lib/labResultAccess': access, 'next-auth': { getServerSession: async () => session }, '@/lib/auth': {}, '@/lib/db': { cosmoPool: Promise.resolve(pool) },
    '@/lib/altParametre': { loadBilesenSonuclar: async () => ({}), saveBilesenSonuclar: async () => {} },
    '@/lib/raporServiceOrder': { applyManualServiceOrder: rows => rows },
  });
  const context = { params: Promise.resolve({ nkrId: '1' }) };
  const visible = await (await route.GET({ nextUrl: new URL('https://test?raporFormati=Genel') }, context)).json();
  assert.equal(visible.length, 1); assert.equal(visible[0].X1ID, 11);
  const rejected = await route.PATCH({ json: async () => ({ updates: [{ x1Id: 11 }, { x1Id: 12 }] }) }, context);
  assert.equal(rejected.status, 403); assert.equal(writes, 0);
  const saved = await route.PATCH({ json: async () => ({ updates: [{ x1Id: 11, sonuc: 'Uygun' }] }) }, context);
  assert.equal(saved.status, 200); assert.equal(writes, 1);
  assignment = null;
  assert.equal((await route.PATCH({ json: async () => ({ updates: [{ x1Id: 11 }] }) }, context)).status, 403);
  assert.equal((await (await route.GET({ nextUrl: new URL('https://test?raporFormati=Genel') }, context)).json()).length, 0);
  assert.equal((await access.getLabScope({ user: { userId: '2' } })).admin, true);
  console.log('PASS: current user assignment, legacy mapping, department visibility, mixed-batch rejection before writes, own result save, missing assignment and shared format isolation. No live data changed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
