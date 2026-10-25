/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, imports) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: mod, exports: mod.exports, Response, require: name => {
    assert.ok(name in imports, `Unexpected dependency: ${name}`);
    return imports[name];
  } });
  return mod.exports;
}

(async () => {
  let mysql = true;
  let schemaCalls = 0;
  let failSchema = true;
  const target = { request: () => ({ query: async () => {
    schemaCalls++;
    if (failSchema) throw new Error('temporary schema failure');
  } }) };
  const legacy = {};
  const store = load('lib/permissionStore.ts', {
    '@/lib/db': { __esModule: true, default: legacy, rootPool: Promise.resolve(target) },
    '@/lib/mysqlCompat': { hasMysqlConfig: () => mysql },
  });
  await assert.rejects(store.getPermissionPool(), /temporary schema failure/);
  failSchema = false;
  const pools = await Promise.all([store.getPermissionPool(), store.getPermissionPool()]);
  assert.ok(pools.every(pool => pool === target));
  assert.equal(schemaCalls, 2);
  mysql = false;
  assert.equal(await store.getPermissionPool(), legacy);

  let committed = 0;
  let rolledBack = 0;
  let failInsert = false;
  const tx = {
    begin: async () => {}, commit: async () => { committed++; }, rollback: async () => { rolledBack++; },
    request: () => ({ input() { return this; }, async query(sql) {
      if (failInsert && sql.includes('INSERT')) throw new Error('insert failed');
      return { recordset: [] };
    } }),
  };
  const route = load('app/api/admin/yetki/route.ts', {
    'next-auth': { getServerSession: async () => ({ user: { userId: '2' } }) },
    '@/lib/auth': { authOptions: {} },
    '@/lib/permissionStore': { getPermissionPool: async () => ({ transaction: async () => tx }) },
    '@/lib/menuConfig': { allMenuKeys: () => ['laboratuvar'] },
  });
  const request = { json: async () => ({ userId: 3, keys: ['laboratuvar'] }) };
  assert.equal((await route.POST(request)).status, 200);
  assert.equal(committed, 1);
  failInsert = true;
  assert.equal((await route.POST(request)).status, 500);
  assert.equal(rolledBack, 1);
  assert.equal(committed, 1);
  console.log('PASS: MySQL routing, schema retry/deduplication, legacy fallback, async transaction commit and rollback.');
})().catch(error => { console.error(error); process.exitCode = 1; });
