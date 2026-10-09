/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS regression runner. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports = {}, env = process.env) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, { module: mod, exports: mod.exports, process: { env }, console, Buffer, require: name => imports[name] || require(name) });
  return mod.exports;
}
(async () => {
  const { numuneSearchLike } = load('lib/numuneSearchSql.ts');
  let captured;
  const mockMysql = { createPool: () => ({ query: async (options, params) => { captured = { sql: options.sql, params }; return [[], []]; } }) };
  const { MysqlCompatPool } = load('lib/mysqlCompat.ts', { 'mysql2/promise': mockMysql }, { MYSQL_HOST: 'test', MYSQL_USER: 'test', MYSQL_DATABASE: 'test' });
  const pool = new MysqlCompatPool();
  await pool.request().input('searchLike', '%İğdır%').query(`SELECT 1 WHERE ${numuneSearchLike("ISNULL(CAST(n.Evrak_No AS NVARCHAR), '')", true)}`);
  assert.match(captured.sql, /CONVERT\(IFNULL\(CAST\(n.Evrak_No AS CHAR\), ''\) USING utf8mb4\) COLLATE utf8mb4_turkish_ci/i);
  assert.match(captured.sql, /CONVERT\(:searchLike USING utf8mb4\) COLLATE utf8mb4_turkish_ci/i);
  assert.equal(captured.params.searchLike, '%İğdır%');
  assert.equal(numuneSearchLike('f.Ad', false), 'LOWER(f.Ad) LIKE LOWER(@searchLike)');
  await pool.request().query("SELECT N'COLLATE Turkish_CI_AS' AS literal, Ad COLLATE Turkish_CI_AS FROM Firma");
  assert.match(captured.sql, /'COLLATE Turkish_CI_AS'/);
  assert.doesNotMatch(captured.sql, /Ad COLLATE Turkish_CI_AS/);
  console.log('PASS: MySQL conversion/parameter binding/native collation preservation and MSSQL compatibility.');

  if (process.argv.includes('--database')) {
    require('@next/env').loadEnvConfig(process.cwd());
    const mysql = require('mysql2/promise');
    const connection = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE, charset: 'utf8mb4_turkish_ci', namedPlaceholders: true });
    try {
      const [schema] = await connection.query("SELECT TABLE_NAME,COLUMN_NAME,CHARACTER_SET_NAME,COLLATION_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('NKR','Firma','EvrakNoMigration2026OzelDoc','NKR_RaporOnay') AND COLUMN_NAME IN ('Evrak_No','RaporNo','Numune_Adi','Ad','Firma_Adi','OldEvrakNo','DisRaporKodu')");
      console.log(JSON.stringify(schema));
      const cases = [
        ["CAST('legacy' AS CHAR CHARACTER SET latin1)", '%ş%', 0],
        ["CAST('legacy' AS CHAR CHARACTER SET latin1)", '%😀%', 0],
        ["'İSTANBUL'", '%istanbul%', 1],
        ["'IĞDIR'", '%ığdır%', 1],
      ];
      for (const [expression, searchLike, expected] of cases) {
        await pool.request().input('searchLike', searchLike).query(`SELECT ${numuneSearchLike(expression, true)} AS matched`);
        const [rows] = await connection.query(captured.sql, captured.params);
        assert.equal(Number(rows[0].matched), expected);
      }
      console.log('PASS: Actual MySQL latin1/UTF-8/Turkish/emoji comparisons; no records changed.');
    } finally { await connection.end(); }
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
