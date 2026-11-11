/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
function load(source) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module, exports: module.exports });
  return module.exports;
}
const { approvalFormatSql } = load(fs.readFileSync('lib/raporApprovalFormatSql.ts', 'utf8'));
(async () => {
  let db;
  if (process.argv.includes('--database')) {
    require('@next/env').loadEnvConfig(process.cwd());
    db = await require('mysql2/promise').createConnection({ host: process.env.MYSQL_HOST, user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE });
  }
  try {
    for (const file of ['app/api/rapor-takip/route.ts', 'app/api/numune-takip-lab/counts/route.ts', 'app/api/numune-takip-lab/global-search/route.ts', 'app/api/numune-takip-lab/pending/route.ts']) {
      const source = fs.readFileSync(file, 'utf8');
      const constants = source.slice(source.indexOf('const normSql'), source.indexOf('export async function GET'));
      const { normSql } = load(constants + '\nmodule.exports = { normSql };');
      const expression = approvalFormatSql(normSql('RaporFormati'));
      assert.ok(expression.includes("WHEN N'DIGEREN' THEN N'DIGER'"));
      if (db) {
        const [rows] = await db.query(`SELECT NkrID, Durum, ${expression} AS BaseFormat FROM NKR_RaporOnay WHERE NkrID IN (41833,41834)`);
        assert.equal(rows.length, 2);
        for (const row of rows) { assert.equal(row.BaseFormat, 'DIGER'); assert.equal(row.Durum, 'Onaylandı'); }
        const [cases] = await db.query(`SELECT ${approvalFormatSql(normSql('?'))} AS BaseFormat`, ['DigerEn', 'DigerEn']);
        assert.equal(cases[0].BaseFormat, 'DIGER');
      }
    }
    console.log('PASS: English approvals map to the base workflow format in list, counts, search and pending queries, including Turkish collation.');
  } finally { if (db) await db.end(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
