const assert=require("node:assert/strict"),fs=require("node:fs"),ts=require("typescript"),vm=require("node:vm"),XLSX=require("xlsx");
function load(file,imports={}){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:mod,exports:mod.exports,require:n=>{if(n in imports)return imports[n];throw Error(n);}});return mod.exports;}
const api=load("lib/challengeImport.ts");
const sheet={T1:{v:"F.06.PR.19"}};
for(const row of [25,19,22,28,31])for(const column of ["L","M","N","O","P","Q","R"])sheet[column+row]={v:column+row};
sheet.L25={v:130000,w:"1.3E+05"};sheet.M31={v:"X"};sheet.P31={v:"X"};sheet.N22={v:""};sheet.Q28={v:0};
const data=api.importChallengeSheet(sheet,"test.xlsx","Sample");
assert.equal(data.rows[0].organism,"Pseudomonas aeruginosa");assert.equal(data.rows[0].inoculation,"1,3 x 10^5");assert.equal(data.rows[0].counts[0],"1,3 x 10^5");
for(const [index,row] of [25,19,22,28,31].entries()) {
  assert.equal(data.rows[index].counts[1],row===31?"-":"M"+row);
  assert.equal(data.rows[index].counts[2],row===22?"-":"N"+row);
  assert.equal(data.rows[index].counts[3],"O"+row);
  assert.equal(data.rows[index].reductions[0],row===31?"-":"P"+row);
  assert.equal(data.rows[index].reductions[1],row===28?"0":"Q"+row);
  assert.equal(data.rows[index].reductions[2],"R"+row);
}
sheet.M19={v:"X"};assert.equal(api.importChallengeSheet(sheet,"t.xlsx","S").rows[1].counts[1],"X");
sheet.P25={v:2.26};assert.equal(api.importChallengeSheet(sheet,"t.xlsx","S").rows[0].reductions[0],"2,26");
sheet.N25={f:"=1+1"};assert.throws(()=>api.importChallengeSheet(sheet,"t.xlsx","S"),/formülünün sonucu yok/);sheet.N25={t:"e",v:7};assert.throws(()=>api.importChallengeSheet(sheet,"t.xlsx","S"),/hesaplama hatası/);
assert.throws(()=>api.importChallengeSheet({},"t.xlsx","S"),/formatında değil/);
assert(api.isChallengeFormat("ChallengeEn"));assert(!api.isChallengeFormat("Genel"));assert(!api.isChallengeFormat("ChallengeFake"));
for(const assessment of api.CHALLENGE_ASSESSMENTS)api.validateChallengeData({...data,assessment});
assert.throws(()=>api.validateChallengeData({...data,assessment:"Pass"}));assert.throws(()=>api.validateChallengeData({...data,assessment:"Uygun",rows:data.rows.slice(1)}));
if(process.argv[2]){
 const workbook=XLSX.readFile(process.argv[2],{cellText:true,cellFormula:true});
 for(const name of workbook.SheetNames){const imported=api.importChallengeSheet(workbook.Sheets[name],"reference.xlsx",name);assert.equal(imported.rows.length,5);assert.equal(imported.rows[4].counts[1],"-");assert.equal(imported.rows[4].reductions[0],"-");console.log(name+": "+imported.rows[0].inoculation+"; log7="+imported.rows[0].reductions[0]);}
}
let state, mysql=true, failure=false;
const fixture=()=>({saved:null,services:[{ID:9}],sample:true,approved:false,updates:[],overrides:[]});
function request(working,schema=false){const params={};return{input(k,v){params[k]=v;return this;},async query(sql){if(schema)return{recordset:[]};let rows=[];
 if(sql.startsWith("SELECT ID FROM NKR ")) rows=working.sample?[{ID:1}]:[];
 else if(sql.startsWith("SELECT x.ID")) rows=working.services;
 else if(sql.startsWith("SELECT ID FROM NKR_RaporOnay")) rows=working.approved?[{ID:1}]:[];
 else if(sql.startsWith("SELECT NkrID")) rows=working.saved?[{NkrID:1}]:[];
 else if(sql.startsWith("INSERT INTO NKR_ChallengeVeri")||sql.startsWith("UPDATE NKR_ChallengeVeri"))working.saved=JSON.parse(params.Json);
 else if(sql.startsWith("UPDATE NumuneX1"))working.updates.push({...params});
 else if(sql.startsWith("DELETE FROM NKR_RaporDurumOverride")){if(failure)throw Error("injected failure");working.overrides.push({...params});}
 else if(sql.startsWith("SELECT 1 AS x"))rows=[];
 else throw Error("Unexpected SQL: "+sql);
 return{recordset:rows};}};}
const base={request:()=>request(null,true),async transaction(){let working;return{async begin(){working=structuredClone(state);},request:()=>request(working),async commit(){state=working;},async rollback(){}};}};
const store=load("lib/challengeData.ts",{"@/lib/mysqlCompat":{hasMysqlConfig:()=>mysql},"@/lib/challengeImport":api});
(async()=>{for(mysql of [true,false]){
 state=fixture();await store.saveChallengeData(base,1,{...data,assessment:"Uygun Değil"},"2",true);assert.equal(state.saved.assessment,"Uygun Değil");assert.equal(state.updates[0].AssessmentEn,"Fail");assert.equal(state.overrides.length,2);assert(state.overrides.every(o=>o.Status==="Onay Bekleniyor"));
 state=fixture();await store.saveChallengeData(base,1,{...data,assessment:"D.Y."},"2",false);assert.equal(state.updates[0].AssessmentEn,"N/A");assert(state.overrides.every(o=>o.Status==="Analiz Devam Ediyor"));
 for(const scenario of ["approved","missing","nonchallenge","rollback"]){state=fixture();if(scenario==="approved")state.approved=true;if(scenario==="missing")state.sample=false;if(scenario==="nonchallenge")state.services=[];failure=scenario==="rollback";const before=structuredClone(state);await assert.rejects(store.saveChallengeData(base,1,{...data,assessment:"Uygun"},"2",true));assert.deepEqual(state,before);failure=false;}
}console.log("PASS: Challenge cell mapping, scientific text, blank/X/zero/formula handling, format/data validation, MySQL/MSSQL atomic save/approval and rollback. No real results saved.");})().catch(e=>{console.error(e);process.exitCode=1;});
