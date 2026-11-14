/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports) { const m={exports:{}}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:m,exports:m.exports,require:name=>imports[name]||require(name),Date,console});return m.exports; }
const config=load('lib/kysWorkspaceConfig.ts',{});
let records=[], audits=[];
function request(){const inputs={};return {input(k,v){inputs[k]=v;return this},async query(sql){if(sql.startsWith('SELECT Payload FROM KysWorkspaceRecord'))return {recordset:records.filter(r=>!inputs.Module||r.module===inputs.Module).map(r=>({Payload:JSON.stringify(r)}))};if(sql.startsWith('SELECT Payload FROM KysWorkspaceAudit'))return {recordset:audits.filter(a=>a.recordId===inputs.ID).map(a=>({Payload:JSON.stringify(a)}))};if(sql.startsWith('INSERT INTO KysWorkspaceRecord')) records.push(JSON.parse(inputs.Payload));if(sql.startsWith('UPDATE KysWorkspaceRecord')){const i=records.findIndex(r=>r.id===inputs.ID&&r.version===inputs.Previous);if(i<0)return {rowsAffected:[0]};records[i]=JSON.parse(inputs.Payload)}if(sql.startsWith('INSERT INTO KysWorkspaceAudit'))audits.push(JSON.parse(inputs.Payload));return {rowsAffected:[1],recordset:[]}}}}
const pool={request,transaction(){let oldRecords,oldAudits;return {request,async begin(){oldRecords=structuredClone(records);oldAudits=structuredClone(audits)},async commit(){},async rollback(){records=oldRecords;audits=oldAudits}}}};
const store=load('lib/kysWorkspaceStore.ts',{'@/lib/db':{cosmoPool:Promise.resolve(pool)},'@/lib/mysqlCompat':{hasMysqlConfig:()=>true},'./kysWorkspaceConfig':config});
const user={userId:'test',userName:'Test User'};
const save=(module,data,status,record)=>store.saveWorkspaceRecord(module,{data,status,version:record?.version||0},user,record?.id);
(async()=>{
assert.throws(()=>store.validateWorkspaceInput('cihaz-listesi',{status:'Kullanımda',data:{}}),/zorunludur/);
assert.throws(()=>store.validateWorkspaceInput('kalibrasyon-belirsizlikleri',{status:'Taslak',data:{deviceId:'x',calibrationId:'x',point:'1',uncertainty:'1',coverage:'0',unit:'g',certificate:'C',validUntil:'2027-01-01'}}),/k sıfırdan/);
const d=await save('cihaz-listesi',{code:'C-01',name:'Terazi',unit:'Kimya',owner:'User',calibrationRequired:'Gerekli'},'Kullanımda');
await assert.rejects(save('cihaz-listesi',{...d.data,code:'c-01'},'Kullanımda'),/zaten/);
const updated=await save('cihaz-listesi',{...d.data,location:'Oda 1'},'Kullanımda',d);
await assert.rejects(save('cihaz-listesi',d.data,'Kullanımda',d),/başka biri/);
assert.equal((await store.workspaceHistory(d.id)).length,2);assert.equal(updated.updatedBy,user.userName);assert.equal(audits[1].before.data.location,'');
const c=await save('kalibrasyon-kontrol',{kind:'Kalibrasyon',deviceId:d.id,dueDate:'2026-12-01',performedAt:'2026-11-01',nextDate:'2027-11-01',criteria:'±0.2 g',evaluation:'Uygun',certificate:'CERT',reviewer:'Reviewer',owner:'User'},'Uygun');
const u=await save('kalibrasyon-belirsizlikleri',{deviceId:d.id,calibrationId:c.id,point:'10',uncertainty:'0.1',coverage:'2',unit:'g',certificate:'CERT',validUntil:'2027-11-01'},'Onaylandı');assert.equal(config.standardUncertainty(u),0.05);
await assert.rejects(save('kalibrasyon-belirsizlikleri',{...u.data,deviceId:'missing'},'Taslak'),/bulunamadı/);
const plan=await save('yazilim-dogrulama',{software:'Portal',version:'abc',title:'Doğrulama',requirements:'R1',criteria:'Doğru',dueDate:'2026-12-01',owner:'User'},'Taslak');
await assert.rejects(save('yazilim-dogrulama',{...plan.data,conclusion:'Uygun'},'Onaylandı',plan),/testlerin/);
const t=await save('yazilim-testleri',{validationId:plan.id,requirement:'R1',title:'Hesap',steps:'2+2',expected:'4',actual:'4',date:'2026-11-13',evidence:'https://example.test/evidence',owner:'User'},'Başarılı');
await save('yazilim-dogrulama',{...plan.data,conclusion:'Uygun'},'Onaylandı',plan);
await assert.rejects(save('yazilim-testleri',{...t.data,actual:'5'},'Başarısız',t),/yeniden teste/);
await assert.rejects(save('degisiklik-kontrolu',{title:'Değişiklik',version:'wrong',reason:'İyileştirme',impact:'Düşük',rollback:'Geri dön',validationId:plan.id,owner:'User',dueDate:'2026-12-01',releasedAt:'2026-11-13'},'Yayında'),/eşleşen/);
assert.equal(records.filter(r=>r.module==='degisiklik-kontrolu').length,0);
assert.equal((await store.listWorkspaceRecords('cihaz-listesi')).length,1);
console.log('PASS: required fields, unique devices, stale writes, audit history, calibration relations, U/k, approval gates, locked test evidence and release version checks.');
})().catch(e=>{console.error(e);process.exitCode=1});
