// Offline regression tests: no database connection and no real records changed.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");

let state, failDelete = false, mysql = true;
const activity = [];
function result(rows = []) { return { recordset: rows, rowsAffected: [1] }; }
function request(data, schema = false) {
  const params = {};
  return { input(key, value) { params[key] = value; return this; }, async query(raw) {
    const sql = raw.replace(/\s+/g, " ").trim();
    if (schema) return result(sql.includes("TABLE_COLLATION") ? [{ TABLE_COLLATION: "utf8mb4_turkish_ci" }] : []);
    activity.push(sql);
    if (sql.startsWith("SELECT * FROM KysTalep ")) return result(data.parent ? [data.parent] : []);
    if (sql.startsWith("SELECT * FROM KysTalepKabul ")) return result(data.accepted.filter(k => k.ID === params.ID && params.TalepID === 1));
    if (sql.startsWith("SELECT * FROM KysStokHareket ")) return result(data.accepted.filter(k => k.HareketID === params.ID).map(k => ({ ...k })));
    if (sql.startsWith("SELECT * FROM KysTalepKalem ")) return result(params.TalepID === 1 && data.item?.ID === params.ID ? [data.item] : []);
    if (sql.startsWith("SELECT * FROM KysStokKart ")) return result(data.stocks[params.ID] == null ? [] : [{ StokMiktari: data.stocks[params.ID] }]);
    if (sql.startsWith("UPDATE KysTalepKalem ")) { data.item.KabulMiktari = params.Q; return result(); }
    if (sql.startsWith("UPDATE KysTalep SET")) { data.parent.Durum = data.item.KabulMiktari === 0 ? "Onaylandı" : "Kısmi Kabul"; return result(); }
    if (sql.startsWith("SELECT k.ID")) return result(data.accepted);
    if (sql.startsWith("SELECT StokMiktari FROM")) return result(data.stocks[params.ID] == null ? [] : [{ StokMiktari: data.stocks[params.ID] }]);
    if (sql.startsWith("UPDATE KysStokKart")) { data.stocks[params.ID] += params.D; return result(); }
    if (sql.startsWith("SELECT ID,Miktar FROM KysStokBirimMiktar")) return result(data.units[`${params.S}:${params.U}`] == null ? [] : [{ ID: 1, Miktar: data.units[`${params.S}:${params.U}`] }]);
    if (sql.startsWith("UPDATE KysStokBirimMiktar")) { data.units[`${params.S}:${params.U}`] += params.D; return result(); }
    if (sql.startsWith("DELETE FROM")) {
      if (failDelete && sql.startsWith("DELETE FROM KysTalepKabul")) throw new Error("injected failure");
      if (sql.startsWith("DELETE FROM KysTalepKabul WHERE ID=")) data.accepted = data.accepted.filter(k => k.ID !== params.ID);
      data.deleted.push(sql.split(" ")[2]);
      if (sql.startsWith("DELETE FROM KysTalep WHERE")) data.parent = null;
      return result();
    }
    if (sql.startsWith("INSERT INTO KysTalepDuzeltmeLog")) return result();
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
}
const pool = { request: () => request(null, true), async transaction() {
  let working;
  return {
    async begin() { working = structuredClone(state); activity.push("BEGIN"); },
    request: () => request(working),
    async commit() { state = working; activity.push("COMMIT"); },
    async rollback() { activity.push("ROLLBACK"); },
  };
} };
const moduleObject = { exports: {} };
const compiled = ts.transpileModule(fs.readFileSync("lib/kysPurchaseWorkflow.ts", "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
vm.runInNewContext(compiled, {
  module: moduleObject, exports: moduleObject.exports, Buffer, console,
  require: name => {
    if (name === "@/lib/db") return { cosmoPool: Promise.resolve(pool) };
    if (name === "@/lib/mysqlCompat") return { hasMysqlConfig: () => mysql };
    if (name === "@/lib/kysStore") return { ensureKysSchema: async () => {} };
    throw new Error(`Unexpected import: ${name}`);
  },
});
const remove = moduleObject.exports.deleteKysRequest;
const fixture = () => ({ parent: { ID: 1, Durum: "Kısmi Kabul" }, stocks: { 4: 20, 5: 12 }, units: { "4:2": 15, "5:2": 12 }, deleted: [], accepted: [
  { ID: 1, StokID: 4, HareketID: 10, GelenMiktar: 3, Miktar: 3, HareketTipi: "Kabul", HedefBirimID: 2 },
  { ID: 2, StokID: 4, HareketID: 11, GelenMiktar: 5, Miktar: 5, HareketTipi: "Kabul", HedefBirimID: 2 },
  { ID: 3, StokID: 5, HareketID: 12, GelenMiktar: 2, Miktar: 2, HareketTipi: "Kabul", HedefBirimID: null },
] });
async function rejectsUnchanged(pattern) {
  const before = structuredClone(state);
  await assert.rejects(remove(1, "test"), pattern);
  assert.deepEqual(state, before);
  assert.equal(activity.at(-1), "ROLLBACK");
}
(async () => {
  for (mysql of [true, false]) {
    state = fixture(); activity.length = 0;
    await remove(1, "test");
    assert.equal(state.parent, null);
    assert.deepEqual(state.stocks, { 4: 12, 5: 10 });
    assert.deepEqual(state.units, { "4:2": 7, "5:2": 12 });
    assert.deepEqual(state.deleted, ["KysTalepBelge", "KysStokSertifika", "KysStokHareket", "KysTalepKabul", "KysTalepKalem", "KysTalepDuzeltmeLog", "KysTalep"]);
    assert.equal(activity.at(-1), "COMMIT");
    assert(activity.some(sql => mysql ? sql.includes("FOR UPDATE") : sql.includes("UPDLOCK,HOLDLOCK")));
    state = fixture(); state.stocks[4] = 7; await rejectsUnchanged(/stok kullanılmış/);
    state = fixture(); state.units["4:2"] = 7; await rejectsUnchanged(/negatife/);
    state = fixture(); state.accepted[0].Miktar = 2; await rejectsUnchanged(/eşleşmiyor/);
    state = fixture(); state.accepted[1].HareketID = 10; await rejectsUnchanged(/eşleşmiyor/);
    state = fixture(); state.parent = null; await rejectsUnchanged(/bulunamadı/);
    state = fixture(); failDelete = true; await rejectsUnchanged(/injected failure/); failDelete = false;
    const single = () => {
      const data = fixture(); data.item = { ID: 9, KabulMiktari: 8, Miktar: 10 };
      data.accepted = data.accepted.slice(0, 2).map(k => ({ ...k, KalemID: 9 })); return data;
    };
    state = single(); await moduleObject.exports.deleteKysAcceptance(1, 1, "test");
    assert.equal(state.stocks[4], 17); assert.equal(state.units["4:2"], 12);
    assert.equal(state.item.KabulMiktari, 5); assert.equal(state.accepted.length, 1);
    assert.equal(state.parent.Durum, "Kısmi Kabul");
    await moduleObject.exports.deleteKysAcceptance(1, 2, "test");
    assert.equal(state.item.KabulMiktari, 0); assert.equal(state.parent.Durum, "Onaylandı");
    assert.equal(state.stocks[4], 12); assert.equal(state.accepted.length, 0);
    for (const scenario of ["used", "unit", "missing", "mismatch", "failure"]) {
      state = single(); if (scenario === "used") state.stocks[4] = 2;
      if (scenario === "unit") state.units["4:2"] = 2;
      if (scenario === "mismatch") state.accepted[0].Miktar = 2;
      failDelete = scenario === "failure"; const before = structuredClone(state);
      await assert.rejects(moduleObject.exports.deleteKysAcceptance(1, scenario === "missing" ? 999 : 1, "test"));
      assert.deepEqual(state, before); failDelete = false;
    }
    state = single(); state.parent.Durum = "İptal"; await moduleObject.exports.deleteKysAcceptance(1, 1, "test"); assert.equal(state.parent.Durum, "İptal");
    state = fixture(); state.accepted = []; await remove(1, "test"); assert.deepEqual(state.stocks, { 4: 20, 5: 12 });
  }
  console.log("PASS: MySQL/MSSQL deletion, multiple acceptances, unit balances, no-acceptance deletion, consumed stock, mismatched movements, missing request and atomic rollback.");
})().catch(error => { console.error(error); process.exitCode = 1; });
