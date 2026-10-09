/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports = {}, env = process.env) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, { module: mod, exports: mod.exports, Buffer, console, process: { env }, URL, Response, require: name => imports[name] || require(name) });
  return mod.exports;
}
(async () => {
  const helper = load('lib/raporMailLogRows.ts');
  const base = { NkrID: 1, EvrakNo: '261509', FirmaAdi: 'Firma', RaporFormati: 'Genel', Aciklama: null, MailAdresi: 'a@example.com', GonderimTarihi: '2026-10-08', Durum: 'Başarılı', Gonderen: 'Test' };
  const rows = [{ ...base, LogID: 'a', MessageId: 'send-1' }, { ...base, LogID: 'b', MessageId: 'send-1', RaporFormati: 'Challenge' }, { ...base, LogID: 'c', MessageId: 'send-2' }, { ...base, LogID: 'd', MessageId: null }, { ...base, LogID: 'e', MessageId: null }];
  const result = helper.mailDeliveryRows(rows);
  assert.equal(result.length, 4); assert.equal(result[0].RaporSayisi, 2); assert.equal(result[0].EvrakNo, '261509'); assert.equal(result[0].RaporFormati, 'Genel, Challenge');
  const queries = [];
  const pool = { request() { return { input() { return this; }, async query(sql) { queries.push(sql); return { recordset: /COUNT/.test(sql) ? [{ Total: 4 }] : rows }; } }; } };
  const route = load('app/api/rapor-takip/mail-log/route.ts', { 'next-auth': { getServerSession: async () => ({ user: {} }) }, '@/lib/auth': { authOptions: {} }, '@/lib/db': { cosmoPool: Promise.resolve(pool) }, '@/lib/raporMailLog': { ensureRaporMailLogTable: async () => {} }, '@/lib/raporMailLogRows': helper });
  const response = await route.GET({ url: 'http://test?page=1&limit=10' }); const payload = await response.json();
  assert.equal(payload.total, 4); assert.equal(payload.data.length, 4); assert.match(queries[0], /COUNT\(DISTINCT/); assert.match(queries[1], /WITH Deliveries/); assert.match(queries[1], /INNER JOIN Deliveries/);
  let captured;
  const mysqlMock = { createPool: () => ({ query: async (options, params) => { captured = { sql: options.sql, params }; return [[], []]; } }) };
  const { MysqlCompatPool } = load('lib/mysqlCompat.ts', { 'mysql2/promise': mysqlMock }, { MYSQL_HOST: 'test', MYSQL_USER: 'test', MYSQL_DATABASE: 'test' });
  const compat = new MysqlCompatPool();
  await compat.request().input('search', '').input('searchLike', '%%').input('status', '').input('offset', 0).input('limit', 10).query(queries[1]);
  assert.match(captured.sql, /LIMIT :limit OFFSET :offset/);
  if (process.argv.includes('--database')) {
    require('@next/env').loadEnvConfig(process.cwd()); const mysql = require('mysql2/promise');
    const conn = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE, namedPlaceholders: true });
    try { const [actual] = await conn.query(captured.sql, captured.params); const deliveries = helper.mailDeliveryRows(actual); console.log(`PASS: actual MySQL ${actual.length} report logs → ${deliveries.length} email sends; no records changed.`); } finally { await conn.end(); }
  }
  console.log('PASS: same message grouped; separate sends retained; unknown message IDs remain distinct; group pagination SQL/MySQL translation.');
})().catch(e => { console.error(e); process.exitCode = 1; });
