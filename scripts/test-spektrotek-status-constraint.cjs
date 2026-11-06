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

async function run() {
  // Run the real compatibility layer and schema initializer, with no network or live writes.
  const queries = [];
  const fake = { async query(options) {
    const sql = typeof options === 'string' ? options : options.sql;
    queries.push(sql);
    if (sql.includes('SELECT CHECK_CLAUSE')) return [[{ CHECK_CLAUSE: "Durum IN ('Bekliyor','Teklif Gönderildi')" }]];
    return [{ affectedRows: 0 }];
  } };
  const { MysqlCompatPool } = load('lib/mysqlCompat.ts', { 'mysql2/promise': { createPool: () => fake } });
  const pool = new MysqlCompatPool();
  const store = load('lib/spektrotekTalep.ts', {
    '@/lib/db': { cosmoPool: Promise.resolve(pool) },
    '@/lib/mysqlCompat': { hasMysqlConfig: () => true },
    '@/lib/spektrotekTalepRules': load('lib/spektrotekTalepRules.ts', {}),
  });
  // Only configuration presence is needed; the driver is replaced above.
  process.env.MYSQL_HOST ||= 'offline';
  process.env.MYSQL_USER ||= 'offline';
  process.env.MYSQL_DATABASE ||= 'offline';
  await store.ensureSpektrotekTalepSchema();
  const replacement = queries.find(sql => sql.includes('DROP CONSTRAINT CK_SpektrotekTalep_Durum'));
  assert.ok(replacement, 'Existing status CHECK must reach the MySQL driver');
  for (const status of ['Bekliyor', 'Teklif Gönderildi', 'Onaylandı', 'Uygun Değil', 'Ret']) assert.ok(replacement.includes(`'${status}'`));
  const count = queries.length;
  await pool.request().query('ALTER TABLE Legacy ADD UnsupportedColumn NVARCHAR(100)');
  assert.equal(queries.length, count, 'Legacy T-SQL DDL remains skipped');
  console.log('PASS: existing status CHECK replacement reaches the real MySQL compatibility driver; legacy DDL remains skipped. No live writes.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
