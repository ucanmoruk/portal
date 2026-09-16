const assert = require("node:assert/strict"), fs = require("node:fs"), ts = require("typescript"), vm = require("node:vm");
const source = ts.transpileModule(fs.readFileSync("lib/kysRequestNumbers.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
async function run(mysql) {
  let records = [{ ID: 2, OlusturmaTarihi: "2026-01-02", TalepNo: "KYS-OLD2" }, { ID: 1, OlusturmaTarihi: "2026-01-01", TalepNo: "KYS-OLD1" }], counters = {}, locked;
  const request = () => { const p = {}; return { input(k, v) { p[k] = v; return this; }, async query(sql) {
    let rows = [];
    if (sql.startsWith("SELECT ID,OlusturmaTarihi")) rows = records.slice().sort((a,b) => a.ID-b.ID);
    else if (sql.startsWith("INSERT IGNORE") || sql.startsWith("IF NOT EXISTS")) counters[p.Y] ||= { SonNo: 1000, Hazir: 0 };
    else if (sql.startsWith("SELECT SonNo")) { locked = sql; rows = [counters[p.Y]]; }
    else if (sql.startsWith("UPDATE KysTalepSayac")) counters[p.Y] = { SonNo: p.N, Hazir: 1 };
    else if (sql.startsWith("UPDATE KysTalep SET")) records.find(r => r.ID === p.ID).TalepNo = p.No;
    return { recordset: rows };
  } }; };
  const base = { request, async transaction() { return { request, async begin() {}, async commit() {}, async rollback() {} }; } };
  const mod = { exports: {} }; vm.runInNewContext(source, { module: mod, exports: mod.exports, require: () => ({ hasMysqlConfig: () => mysql }) });
  const api = mod.exports;
  assert.equal(api.requestYear("2025-12-31T22:00:00Z"), 2026);
  await api.ensureKysRequestNumbers(base);
  assert.equal(records.find(r=>r.ID===1).TalepNo, "2026-1001"); assert.equal(records.find(r=>r.ID===2).TalepNo, "2026-1002");
  assert.equal(await api.nextKysRequestNumber(base, 2026), "2026-1003");
  records = []; assert.equal(await api.nextKysRequestNumber(base, 2026), "2026-1004");
  assert.equal(await api.nextKysRequestNumber(base, 2027), "2027-1001");
  assert(locked.includes(mysql ? "FOR UPDATE" : "UPDLOCK,HOLDLOCK"));
  await api.ensureKysRequestNumbers(base); assert.equal(counters[2026].SonNo, 1004);
}
(async()=>{ await run(true); await run(false); console.log("PASS: annual request numbers, legacy migration, durable counter after deletion and MySQL/MSSQL locking."); })().catch(e=>{console.error(e);process.exitCode=1;});
