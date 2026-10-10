/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const queries = [];
let pool = { request() { const params = {}; return {
  input(key, value) { params[key] = value; return this; },
  async query(sql) {
    queries.push({ sql, params });
    let recordset = [];
    if (sql.includes('INFORMATION_SCHEMA.TABLES')) recordset = ['NKR_LabKabul', 'NKR_RaporOnay', 'NKR_RaporDurumOverride'].map(TABLE_NAME => ({ TABLE_NAME }));
    else if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) recordset = ['SonucKayitTarihi', 'Sonuc'].map(COLUMN_NAME => ({ COLUMN_NAME }));
    else if (sql.includes('SELECT EffDurum, HasLabAccess, Grup')) recordset = [
      { HasLabAccess: 1, Grup: 'Özel', EffDurum: 'Bekliyor', NormFmt: 'GENEL', c: 3 },
      { HasLabAccess: 1, Grup: 'K.D.', EffDurum: 'Analiz Devam Ediyor', NormFmt: 'GENEL', c: 7 },
      { HasLabAccess: 1, Grup: 'Özel', EffDurum: 'Analiz Devam Ediyor', NormFmt: 'STABİLİTE', c: 2 },
      { HasLabAccess: 1, Grup: 'K.D.', EffDurum: 'Geri Gönderildi', NormFmt: 'GENEL', c: 4 },
      { HasLabAccess: 1, Grup: 'Belge', EffDurum: 'Bekliyor', NormFmt: 'GENEL', c: 1 },
      { HasLabAccess: 0, Grup: 'Özel', EffDurum: 'Bekliyor', NormFmt: 'GENEL', c: 9 },
    ];
    else if (sql.includes('SELECT Grup, COUNT(*)')) recordset = [{ HasLabAccess: 1, Grup: 'Özel', c: 2 }, { HasLabAccess: 1, Grup: 'K.D.', c: 5 }];
    return { recordset, recordsets: [recordset], rowsAffected: [0] };
  },
}; } };
function load(file) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: mod, exports: mod.exports, console, Response, URL, require: name => ({
      'next-auth': { getServerSession: async () => ({}) }, '@/lib/auth': { authOptions: {} }, '@/lib/db': { cosmoPool: Promise.resolve(pool) },
      '@/lib/labResultAccess': { getLabScope: async () => ({ admin: true }), labScopeSql: () => '' },
    })[name] || {} });
  return mod.exports;
}
(async () => {
  const counts = load('app/api/numune-takip-lab/counts/route.ts');
  const response = await counts.GET({ nextUrl: new URL('https://test/counts?year=2026&terminDate=2026-10-10') });
  const body = await response.json();
  assert.equal(body.errors, undefined);
  assert.deepEqual(body.byGroupLab['Özel'], { total: 5, daily: 2, byFormat: { GENEL: 3, STABILITE: 2 } });
  assert.deepEqual(body.byGroupLab['K.D.'], { total: 7, daily: 5, byFormat: { GENEL: 7 } });
  assert.equal(body.geri, 4);
  const api = load('app/api/rapor-takip/route.ts');
  for (const group of ['Özel', 'K.D.']) {
    queries.length = 0;
    const result = await api.GET({ url: `https://test/reports?phase=lab&acceptedOnly=1&grup=${encodeURIComponent(group)}` });
    assert.equal(result.status, 200);
    const list = queries.find(q => q.sql.includes('INTO #Rap'));
    assert.equal(list.params.grup, group);
    assert.match(list.sql, /AND LTRIM\(RTRIM\(n.Grup\)\) = @grup/);
  }
  assert.equal((await api.GET({ url: 'https://test/reports?grup=invalid' })).status, 400);
  console.log('PASS: independent Özel/K.D. format and daily counts, returned exclusions, parameterized list filters and invalid group rejection. No live database used.');
  if (process.argv.includes('--database')) {
    require('@next/env').loadEnvConfig(process.cwd());
    const mysql = require('mysql2/promise');
    let connection;
    const mod = { exports: {} };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/mysqlCompat.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText,
      { module: mod, exports: mod.exports, process, console, Buffer, require: n => n === 'mysql2/promise' ? { ...mysql, createPool(...args) { connection = mysql.createPool(...args); return connection; } } : require(n) });
    pool = new mod.exports.MysqlCompatPool();
    try {
      const real = load('app/api/numune-takip-lab/counts/route.ts');
      const result = await real.GET({ nextUrl: new URL('https://test/counts?year=2026&terminDate=2026-10-10') });
      const counts = await result.json();
      assert.equal(result.status, 200); assert.equal(counts.errors, undefined);
      console.log('PASS: real MySQL counts (read only):', JSON.stringify(counts.byGroupLab));
    } finally { await connection?.end(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
