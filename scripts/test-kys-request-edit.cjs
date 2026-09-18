// Offline transaction tests; no production records are changed.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
let state, mysql = true, fail = false, rolledBack = false;
const fixture = () => ({ parent: { Durum: "Onay Bekliyor", OnayTarihi: null, TalepNo: "2026-1003" }, items: [{ name: "Old" }], accepted: [] });
const pool = { async transaction() {
  let work;
  return { async begin() { work = structuredClone(state); }, async commit() { state = work; }, async rollback() { rolledBack = true; },
    request() { const p = {}; return { input(k,v) { p[k]=v; return this; }, async query(sql) {
      if (sql.startsWith("SELECT * FROM KysTalep")) return { recordset: [work.parent] };
      if (sql.startsWith("SELECT ID FROM KysTalepKabul")) return { recordset: work.accepted };
      if (sql.startsWith("SELECT ID,Birim")) return { recordset: p.ID === 19 ? [{ Birim: "Kutu" }] : [] };
      if (sql.startsWith("UPDATE KysTalep")) { work.parent.TalepTuru=p.Tur;work.parent.Notlar=p.Not;work.parent.FirmaAdi=p.Firma; }
      else if (sql.startsWith("DELETE FROM")) work.items=[];
      else if (sql.startsWith("INSERT INTO")) { if (fail) throw Error("insert failed");work.items.push({...p}); }
      return { recordset: [] };
    } }; },
  };
} };
const source = fs.readFileSync("lib/kysStore.ts", "utf8");
const body = source.slice(source.indexOf("export async function editKysRequest"), source.indexOf("export async function getKysRequestDetail"));
const compiled = ts.transpileModule(body, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
vm.runInNewContext(compiled, { module:mod, exports:mod.exports, ensureKysSchema:async()=>{}, cosmoPool:Promise.resolve(pool), hasMysqlConfig:()=>mysql,
  text:v=>String(v??"").trim(), nullableText:v=>String(v??"").trim()||null,
  numberValue:(v,f=0)=>{const raw=String(v??"");const n=Number(raw.includes(",")?raw.replace(/\./g,"").replace(",","."):raw);return Number.isFinite(n)?n:f;},
});
const edit = mod.exports.editKysRequest;
const draft = { talepTuru:"Stok Malzeme",notlar:"Changed",kalemler:[{ stokId:19,malzemeAdi:"Pipet",miktar:"1,5",birim:"Adet",marka:"Keep",kullaniciNotu:"Keep note" }] };
(async()=>{
  for (mysql of [true,false]) {
    state=fixture();await edit(8,draft);
    assert.equal(state.parent.TalepNo,"2026-1003");assert.equal(state.parent.Durum,"Onay Bekliyor");
    assert.equal(state.items.length,1);assert.equal(state.items[0].Unit,"Kutu");assert.equal(state.items[0].Qty,1.5);assert.equal(state.items[0].Brand,"Keep");
    for(const status of ["Onaylandı","İşleme Alındı","Kısmi Kabul","Tamamlandı","İptal","Silindi"]) {
      state=fixture();state.parent.Durum=status;const before=structuredClone(state);rolledBack=false;
      await assert.rejects(edit(8,draft),/onaylanmamış/);assert.deepEqual(state,before);assert.ok(rolledBack);
    }
    state=fixture();state.accepted=[{ID:1}];await assert.rejects(edit(8,draft),/Kabul kaydı/);
    state=fixture();state.parent.TalepNo="S1001";await edit(8,{firmaAdi:"Supplier Ltd",kalemler:[{malzemeAdi:"Instrument",miktar:1,birim:"pcs"}]});assert.equal(state.parent.FirmaAdi,"Supplier Ltd");assert.equal(state.parent.TalepNo,"S1001");
    await assert.rejects(edit(8,{kalemler:[{malzemeAdi:"X",miktar:1}]}),/Firma adı/);
    await assert.rejects(edit(8,{...draft,firmaAdi:"Supplier Ltd"}),/manuel/);
    state=fixture();const before=structuredClone(state);fail=true;await assert.rejects(edit(8,draft),/insert failed/);fail=false;assert.deepEqual(state,before);
    await assert.rejects(edit(8,{kalemler:[]}),/talep kalemi/);
    await assert.rejects(edit(8,{kalemler:[{malzemeAdi:"Pipet",miktar:0}]}),/pozitif/);
  }
  console.log("PASS: pending edits, canonical units, status protection, validation, and atomic rollback (MySQL/SQL Server).");
})().catch(e=>{console.error(e);process.exitCode=1;});
