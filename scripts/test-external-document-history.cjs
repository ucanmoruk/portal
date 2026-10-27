/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

function load(file, dependencies) {
  const filename = path.resolve(__dirname,"..",file);
  const mod = new Module(filename);
  mod.require = name => {
    if (name === "node:crypto") return require(name);
    if (Object.hasOwn(dependencies,name)) return dependencies[name];
    throw new Error(`Unexpected dependency: ${name}`);
  };
  mod._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"), {
    compilerOptions: { module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020 },
  }).outputText,filename);
  return mod.exports;
}
let documents = new Map([[1,{ ID:1,KontrolEdildi:0 }],[2,{ ID:2,KontrolEdildi:0 }]]);
let history = [];
let failLog = false;
let commits = 0;
let rollbacks = 0;
let clock = 0;
const statements = [];
function request() {
  const params = {};
  return {
    input(name,value) { params[name]=value; return this; },
    async query(sql) {
      statements.push(sql);
      if (sql.includes("SELECT ID FROM KysDisKaynakliDokuman WHERE")) return { recordset:documents.has(params.ID) ? [{ ID:params.ID }] : [] };
      if (sql.includes("UPDATE KysDisKaynakliDokuman SET KontrolEdildi")) {
        Object.assign(documents.get(params.ID),{ KontrolEdildi:1,KontrolTarihi:++clock,KontrolEdenAd:params.UserName });
      }
      if (sql.includes("INSERT INTO KysDisKaynakliDokumanLog") && sql.includes("@Key")) {
        if (failLog) throw new Error("Injected history failure");
        history.push({ ID:history.length+1,DokumanID:params.ID,Islem:params.Islem,KullaniciAd:params.UserName,Tarih:String(documents.get(params.ID).KontrolTarihi) });
      }
      if (sql.includes("FROM KysDisKaynakliDokumanLog WHERE DokumanID=@ID")) return { recordset:history.filter(row=>row.DokumanID===params.ID).slice().reverse() };
      return { recordset:[] };
    },
  };
}
const pool = { request,transaction:async () => {
  const beforeDocs = structuredClone(documents); const beforeHistory = structuredClone(history);
  return { request,begin:async () => {},commit:async () => { commits++; },rollback:async () => { rollbacks++; documents=beforeDocs; history=beforeHistory; } };
} };
const store = load("lib/kysDisKaynakliDokumanStore.ts",{
  "@/lib/db":{ cosmoPool:Promise.resolve(pool) }, "@/lib/mysqlCompat":{ hasMysqlConfig:()=>true },
});
async function run() {
  await store.markDisKaynakliDokumanChecked([1],{ userId:"2",userName:"İlk kontrol" });
  await store.markDisKaynakliDokumanChecked([1,1],{ userId:"3",userName:"İkinci kontrol" });
  let records = await store.listDisKaynakliDokumanHistory(1);
  assert.equal(records.length,2);
  assert.equal(records[0].kullaniciAd,"İkinci kontrol");
  assert.equal(records[1].kullaniciAd,"İlk kontrol");
  assert.notEqual(records[0].tarih,records[1].tarih);
  assert.equal(documents.get(1).KontrolEdenAd,"İkinci kontrol");
  const before = structuredClone(documents); const beforeCommits = commits;
  failLog = true;
  await assert.rejects(store.markDisKaynakliDokumanChecked([1,2],{ userId:"4",userName:"Başarısız" }),/Injected history failure/);
  assert.deepEqual(documents,before);
  assert.equal(commits,beforeCommits);
  assert.ok(rollbacks>0);
  failLog = false;
  await assert.rejects(store.markDisKaynakliDokumanChecked([1,999],{ userId:"4",userName:"Eksik kayıt" }),/bulunamadı/);
  assert.deepEqual(documents,before);
  records = await store.listDisKaynakliDokumanHistory(1);
  assert.equal(records.length,2);
  await assert.rejects(store.markDisKaynakliDokumanChecked(["1 OR 1=1"],{ userId:"4",userName:"Geçersiz" }),/Geçersiz/);
  assert.ok(statements.some(sql=>sql.includes("legacy-check:")),"Existing last checks must be migrated");

  let user = null; let reads = 0;
  const route = load("app/api/kys/dis-kaynakli-dokumanlar/[id]/route.ts",{
    crypto:require("node:crypto"),
    "@/lib/portalYetki":{ getPortalUser:async()=>user },
    "@/lib/kysDisKaynakliDokumanStore":{ getDisKaynakliDokuman:async()=>{ reads++; return { id:1 }; },listDisKaynakliDokumanHistory:async()=>records },
    "@/lib/kysDisKaynakliFtpUpload":{},
  });
  const params = { params:Promise.resolve({ id:"1" }) };
  assert.equal((await route.GET(new Request("http://localhost"),params)).status,401);
  user = { can:()=>false };
  assert.equal((await route.GET(new Request("http://localhost"),params)).status,403);
  assert.equal(reads,0);
  user = { can:()=>true };
  const result = await route.GET(new Request("http://localhost"),params);
  assert.equal(result.status,200);
  assert.equal((await result.json()).kayitlar.length,2);
  console.log("External document history: repeat checks, prior actor/date preservation, atomic rollback, missing IDs, migration and read permissions passed.");
}
run().catch(error=>{ console.error(error); process.exitCode=1; });
