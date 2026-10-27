/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function load(relative, dependencies = {}) {
  const file = path.resolve(__dirname, "..", relative);
  const mod = new Module(file);
  mod.require = name => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    throw new Error(`Unexpected dependency: ${name}`);
  };
  mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, file);
  return mod.exports;
}
const types = load("lib/labAkisTypes.ts");
assert.deepEqual(types.intermediateDates("2026-10-01", "2026-10-28", [14, 1, 7, 7]), [
  { gun:1,tarih:"2026-10-01" }, { gun:7,tarih:"2026-10-07" }, { gun:14,tarih:"2026-10-14" },
]);
assert.equal(types.intermediateDates("2028-02-28", "2028-03-01", [2])[0].tarih, "2028-02-29");
assert.throws(() => types.validFlowDate("2026-02-30"));
assert.throws(() => types.validFlowDate("2026-10-01; DROP TABLE NKR"));
assert.throws(() => types.intermediateDates("2026-10-01", null, [7]));
assert.throws(() => types.intermediateDates("2026-10-01", "2026-10-07", [14]));
for (const days of [[], [0], [1.5], [""], Array(37).fill(1)]) assert.throws(() => types.intermediateDates("2026-10-01", "2026-10-28", days));

let statements = [];
let transactionWrites = [];
let commits = 0;
let rollbacks = 0;
let failQuality = false;
let denyAnalysis = false;
let completed = 0;
let laterMilestone = false;
let mysql = false;
const source = [
  { ID:11,RaporID:101,AnalizID:1,BirimID:1,BirimAd:"Mikrobiyoloji",Ad:"Challenge",RaporNo:"OZ-101",Grup:"Özel",Numune_Adi:"Numune A",Baslangic:"2026-10-01",Termin:"2026-10-28",Tamamlandi:0 },
  { ID:12,RaporID:102,AnalizID:2,BirimID:2,BirimAd:"Kimya",Ad:"Stabilite",RaporNo:"KD-102",Grup:"K.D.",Numune_Adi:"Numune B",Baslangic:"2026-10-02",Termin:"2026-10-29",Tamamlandi:0 },
];
function request(inTransaction = false) {
  const params = {};
  return {
    input(key, value) { params[key] = value; return this; },
    async query(sql) {
      statements.push({ sql,params });
      if (sql.includes("SELECT x1.ID, x1.RaporID")) return { recordset:source };
      if (sql.includes("SELECT ID,X1ID,Gun")) return { recordset:[{ ID:31,X1ID:11,Gun:7,Tarih:"2026-10-07",Tamamlandi:0 }] };
      if (sql.includes("SELECT ID,Baslik,Aciklama")) return { recordset:[{ ID:21,Baslik:"İç tetkik",Aciklama:"Plan",Tarih:"2026-10-10",Tamamlandi:0 }] };
      if (sql.includes("SELECT ID FROM LabAkisKalite")) {
        if (failQuality) throw new Error("Injected DB failure");
        return { recordset:[{ ID:params.id }] };
      }
      if (sql.includes("SELECT x1.ID, x1.Termin")) return { recordset:denyAnalysis ? [] : [{ ID:11,Baslangic:"2026-10-01",Termin:"2026-10-28",Tamamlandi:completed }] };
      if (sql.includes("SELECT ID FROM LabAkisAraGun WHERE X1ID")) return { recordset:laterMilestone ? [{ ID:31 }] : [] };
      if (inTransaction) transactionWrites.push({ sql,params });
      return { recordset:[] };
    },
  };
}
const pool = {
  request: () => request(),
  transaction: async () => ({ begin:async () => {}, request:() => request(true), commit:async () => { commits++; }, rollback:async () => { rollbacks++; transactionWrites = []; } }),
};
const store = load("lib/labAkisStore.ts", {
  "@/lib/db":{ cosmoPool:Promise.resolve(pool) },
  "@/lib/mysqlCompat":{ hasMysqlConfig:() => mysql },
  "@/lib/labResultAccess":{ labScopeSql:scope => scope.denied ? " AND 1=0" : " AND s.BolumID=4" },
  "@/lib/labAkisTypes":types,
});
const selectedAnalysis = [{ tur:"analiz",id:11 }];
const scope = { departmentId:4,admin:false };
async function run() {
  assert.throws(() => store.flowSelection([{ tur:"analiz",id:"11 OR 1=1" }]));
  assert.throws(() => store.flowSelection([null]));
  const flow = await store.listLabFlow(scope,"2026-10-01","2026-10-31");
  assert.equal(flow.analizler.length,2);
  assert.equal(flow.analizler[0].araGunler[0].gun,7);
  assert.equal(flow.kalite[0].baslik,"İç tetkik");
  const sourceQuery = statements.find(item => item.sql.includes("SELECT x1.ID, x1.RaporID")).sql;
  assert.match(sourceQuery,/N'Özel',N'K.D.'/);
  assert.match(sourceQuery,/s.BolumID=4/);
  assert.doesNotMatch(sourceQuery,/KysIletisim/);

  const React = require("react");
  let hookIndex = 0;
  let selectedDepartment = "";
  const component = load("app/(dashboard)/laboratuvar/kys/iletisim/LabAkisi.tsx", {
    react: {
      ...React,
      useState: initial => {
        const index = hookIndex++;
        const value = index === 0 ? new Date(2026,9,1) : index === 1 ? flow : index === 2 ? false : index === 8 ? selectedDepartment : typeof initial === "function" ? initial() : initial;
        return [value, () => {}];
      },
      useEffect: () => {}, useMemo: fn => fn(), useCallback: fn => fn, useRef: value => ({ current:value }),
    },
    "react/jsx-runtime":require("react/jsx-runtime"),
    "lucide-react":require("lucide-react"),
    "./labAkisi.module.css":{ default:new Proxy({}, { get:(_,key) => String(key) }) },
  }).default;
  const html = require("react-dom/server").renderToStaticMarkup(React.createElement(component));
  for (const text of ["Başlangıç", "Bitiş", "Challenge 7. gün", "İç tetkik", "OZ-101", "KD-102"]) assert.ok(html.includes(text), `Missing calendar content: ${text}`);
  assert.equal((html.match(/draggable="true"/g) || []).length,2, "Only analysis end cards should be draggable");
  assert.ok(html.includes("Analiz adı"));
  assert.ok(html.includes("Tüm birimler") && html.includes("Mikrobiyoloji") && html.includes("Kimya"));
  assert.equal(flow.analizler[0].birimId,1);
  selectedDepartment = "1"; hookIndex = 0;
  const filteredHtml = require("react-dom/server").renderToStaticMarkup(React.createElement(component));
  assert.ok(filteredHtml.includes("OZ-101") && filteredHtml.includes("Challenge 7. gün"));
  assert.ok(!filteredHtml.includes("KD-102") && !filteredHtml.includes("İç tetkik"));

  await store.changeLabFlow({ islem:"termin",secim:selectedAnalysis,tarih:"2026-11-02" },scope,"2");
  const deadlineWrite = transactionWrites.find(write => write.sql.includes("UPDATE NumuneX1 SET Termin"));
  assert.equal(deadlineWrite.params.end,"2026-11-02");
  assert.equal(deadlineWrite.params.id,11);
  assert.equal(transactionWrites.some(write => /UPDATE .*SET Baslangic/.test(write.sql)),false);
  await assert.rejects(store.changeLabFlow({ islem:"termin",secim:selectedAnalysis,tarih:"2026-09-30" },scope,"2"),/başlangıçtan önce/);
  laterMilestone = true;
  await assert.rejects(store.changeLabFlow({ islem:"termin",secim:selectedAnalysis,tarih:"2026-10-05" },scope,"2"),/ara günlerden önce/);
  laterMilestone = false;
  completed = 1;
  await assert.rejects(store.changeLabFlow({ islem:"termin",secim:selectedAnalysis,tarih:"2026-11-02" },scope,"2"),/Tamamlanmış/);
  completed = 0;
  denyAnalysis = true;
  await assert.rejects(store.changeLabFlow({ islem:"tamamla",secim:selectedAnalysis },scope,"2"),/erişim yetkiniz yok/);
  denyAnalysis = false;

  transactionWrites = [];
  await store.changeLabFlow({ islem:"ara-gun",secim:selectedAnalysis,gunler:[1,7,14] },scope,"2");
  assert.equal(transactionWrites.filter(write => write.sql.includes("INSERT INTO LabAkisAraGun")).length,3);
  assert.equal(transactionWrites.find(write => write.params.day===7).params.date,"2026-10-07");
  transactionWrites = [];
  await store.changeLabFlow({ islem:"tamamla",secim:[...selectedAnalysis,{ tur:"kalite",id:21 }] },scope,"2");
  assert.ok(transactionWrites.some(write => write.sql.includes("UPDATE LabAkisAnaliz SET Tamamlandi") && write.params.done===1));
  assert.ok(transactionWrites.some(write => write.sql.includes("UPDATE LabAkisAraGun SET Tamamlandi") && write.params.done===1));
  assert.ok(transactionWrites.some(write => write.sql.includes("UPDATE LabAkisKalite SET Tamamlandi") && write.params.done===1));
  assert.equal(transactionWrites.some(write => write.sql.includes("UPDATE NumuneX1")),false);
  const before = commits;
  failQuality = true;
  await assert.rejects(store.changeLabFlow({ islem:"tamamla",secim:[...selectedAnalysis,{ tur:"kalite",id:21 }] },scope,"2"),/Injected DB failure/);
  assert.equal(commits,before);
  assert.equal(transactionWrites.length,0);
  assert.ok(rollbacks>0);
  failQuality = false;
  mysql = true;
  transactionWrites = [];
  await store.changeLabFlow({ islem:"ara-gun",secim:selectedAnalysis,gunler:[7] },scope,"2");
  assert.ok(transactionWrites.some(write => write.sql.includes("INSERT IGNORE INTO LabAkisAraGun")));
  await store.saveQualityWork({ baslik:"YGG",tarih:"2026-10-20",aciklama:"Yıllık gözden geçirme" },"2");
  assert.ok(statements.some(write => write.sql.includes("INSERT INTO LabAkisKalite") && write.params.title==="YGG"));
  console.log("Lab Akışı: dates, live sources, department scope, deadline sync, intermediate days, quality entry, completion and atomic rollback passed.");
}
run().catch(error => { console.error(error); process.exitCode=1; });
