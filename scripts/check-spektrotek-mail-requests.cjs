// Offline Spektrotek mail-request contract, persistence and access checks.
const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,mocks={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(n=>mocks[n]||require(n),m,m.exports);return m.exports;}
async function run(){
const mysql=!process.argv.includes('--mssql'),rules=load('lib/spektrotekTalepRules.ts');let rows=[],failSource='';const queries=[];
const result=(recordset=[],affected=0)=>({recordset,rowsAffected:[affected]});
const fields=p=>({Tarih:p.Date,MusteriAdi:p.Customer,KisiAdi:p.Person,Email:p.Email,Talep:p.Request,Ozet:p.Summary,Konu:p.Subject,Hesap:p.Account,Skor:p.Score});
function request(){const p={};return {input(k,v){p[k]=v;return this},async query(raw){const sql=raw.replace(/\s+/g,' ').trim();queries.push({sql,p});
 if(/^(CREATE|ALTER|IF OBJECT_ID|IF COL_LENGTH)/.test(sql))return result();
 if(sql.startsWith('SELECT Id FROM SpektrotekTalep'))return result(rows.filter(r=>r.KaynakId===p.Source).map(r=>({Id:r.Id})));
 if(sql.startsWith('INSERT INTO SpektrotekTalep')){if(p.Source===failSource)throw Error('simulated batch failure');const r={Id:rows.length+1,KaynakId:p.Source,...fields(p),Durum:p.Status||'Bekliyor',DurumTarihi:p.Actor?new Date():null,DurumKullanici:p.Actor||null,Surum:1};rows.push(r);return result(sql.includes('OUTPUT')?[{Id:r.Id}]:[],1)}
 if(sql.startsWith('UPDATE SpektrotekTalep')&&sql.includes('WHERE KaynakId')){assert(!/\bDurum(?:Tarihi|Kullanici)?\s*=/.test(sql));const r=rows.find(r=>r.KaynakId===p.Source);Object.assign(r,fields(p));r.Surum++;return result([],1)}
 if(sql.startsWith('UPDATE SpektrotekTalep')){const r=rows.find(r=>r.Id===p.ID&&r.Surum===p.Version);if(!r)return result();if('Customer' in p)Object.assign(r,fields(p));if(r.Durum!==p.Status){r.DurumTarihi=new Date();r.DurumKullanici=p.Actor}r.Durum=p.Status;r.Surum++;return result([],1)}
 if(sql.startsWith('SELECT DISTINCT Hesap'))return result([...new Set(rows.map(r=>r.Hesap))].sort().map(Hesap=>({Hesap})));
 if(sql.includes(' AS Pending,'))return result([{Total:rows.length,Pending:rows.filter(r=>r.Durum==='Bekliyor').length,Offered:rows.filter(r=>r.Durum==='Teklif Gönderildi').length,Manual:rows.filter(r=>r.KaynakId.startsWith('manual:')).length}]);
 let found=[...rows];if(p.ID)found=found.filter(r=>r.Id===p.ID);if(p.Status)found=found.filter(r=>r.Durum===p.Status);if(p.Account)found=found.filter(r=>r.Hesap===p.Account);if(p.Search&&p.Search!=='%%'){const text=p.Search.slice(1,-1).replace(/!(.)/g,'$1').toLocaleLowerCase('tr');found=found.filter(r=>[r.MusteriAdi,r.KisiAdi,r.Email,r.Talep].some(v=>String(v||'').toLocaleLowerCase('tr').includes(text)))}
 if(sql.startsWith('SELECT COUNT(*)'))return result([{Total:found.length}]);
 if(sql.startsWith('SELECT Id,KaynakId')){found.sort((a,b)=>new Date(b.Tarih)-new Date(a.Tarih)||b.Id-a.Id);return result(p.Limit?found.slice(p.Offset,p.Offset+p.Limit):found)}
 throw Error('Unhandled SQL '+sql);
}}}
const pool={request,async transaction(){const snapshot=structuredClone(rows);return {request,begin:async()=>{},commit:async()=>{},rollback:async()=>{rows=snapshot}}}};
const store=load('lib/spektrotekTalep.ts',{'@/lib/db':{cosmoPool:Promise.resolve(pool)},'@/lib/mysqlCompat':{hasMysqlConfig:()=>mysql},'@/lib/spektrotekTalepRules':rules});
const lead={kaynakId:'mailbot:385',tarih:'2026-10-19T11:06:35+00:00',musteriAdi:'Sakarya Üniversitesi',kisiAdi:'Örnek Kişi',email:'sample@example.com',talep:'Ozmometre',ozet:'Teklif talebi',konu:'Proforma',hesap:'info',skor:90};
assert.deepEqual(await store.upsertSpektrotekTalepler([lead]),{alinan:1,eklenen:1});let listed=await store.listSpektrotekTalepler(new URLSearchParams());assert.equal(listed.items[0].tarih,'2026-10-19T11:06:35.000Z');
let item=await store.updateSpektrotekTalep(1,{durum:'Teklif Gönderildi',surum:1},'Portal User',true);assert.equal(item.durumKullanici,'Portal User');const audit=item.durumTarihi;
assert.deepEqual(await store.upsertSpektrotekTalepler([{...lead,talep:'Güncel ürün'}]),{alinan:1,eklenen:0});assert.equal(rows.length,1);listed=await store.listSpektrotekTalepler(new URLSearchParams());item=listed.items[0];assert.equal(item.talep,'Güncel ürün');assert.equal(item.durum,'Teklif Gönderildi');assert.equal(item.durumTarihi,audit);
await assert.rejects(store.updateSpektrotekTalep(1,{durum:'Bekliyor',surum:1},'Old user',true),e=>e.status===409);assert.equal(rows[0].Durum,'Teklif Gönderildi');
const {kaynakId,...manual}=lead;item=await store.createSpektrotekTalep({...manual,musteriAdi:'Manuel müşteri'},'Creator');assert(item.kaynakId.startsWith('manual:'));assert.equal(rows.length,2);
item=await store.updateSpektrotekTalep(item.id,{...manual,musteriAdi:'Düzenlenen müşteri',durum:'Teklif Gönderildi',surum:item.surum},'Editor');assert.equal(item.musteriAdi,'Düzenlenen müşteri');assert.equal(item.durumKullanici,'Editor');
listed=await store.listSpektrotekTalepler(new URLSearchParams('q=Düzenlenen&hesap=info&durum=Teklif+Gönderildi'));assert.equal(listed.total,1);assert.deepEqual(listed.summary,{total:2,pending:0,offered:2,manual:1});
assert.equal((await store.listSpektrotekTalepler(new URLSearchParams({q:"' OR 1=1 --"}))).total,0);assert(!queries.some(q=>q.sql.includes("' OR 1=1 --")));
failSource='mailbot:999';await assert.rejects(store.upsertSpektrotekTalepler([{...lead,kaynakId:'mailbot:998'},{...lead,kaynakId:failSource}]));assert.equal(rows.length,2);failSource='';
const integration=load('lib/spektrotekIntegration.ts',{'@/lib/db':{cosmoPool:Promise.resolve(pool)},'@/lib/kysProduct':{readKysProduct(){}},'@/lib/kysStore':{ensureKysSchema:async()=>{}},'@/lib/loadDotenv':{loadDotenvOnce(){}}});
const http=load('lib/spektrotekHttp.ts',{'@/lib/spektrotekIntegration':integration});
const route=load('app/api/integrations/spektrotek/mail-requests/route.ts',{'@/lib/spektrotekHttp':http,'@/lib/spektrotekTalepRules':rules,'@/lib/spektrotekTalep':store});
const previous=process.env.SPEKTROTEK_INTEGRATION_KEY;process.env.SPEKTROTEK_INTEGRATION_KEY='k'.repeat(40);
const req=(body,key='k'.repeat(40))=>new Request('https://portal.test/api/integrations/spektrotek/mail-requests',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key},body:JSON.stringify(body)});
assert.equal((await route.POST(req({talepler:[lead]},''))).status,401);assert.equal((await route.POST(req({talepler:[lead]},'wrong'))).status,401);
for(const body of [{talepler:Array(101).fill(lead)},{talepler:[{...lead,durum:'Bekliyor'}]},{talepler:[{...lead,skor:101}]},{talepler:[{...lead,kaynakId:'manual:fake'}]},{talepler:[lead],unexpected:true}])assert.equal((await route.POST(req(body))).status,400);
assert.equal((await route.POST(req({talepler:[lead]}))).status,200);assert.equal(rows[0].Durum,'Teklif Gönderildi');
if(previous===undefined)delete process.env.SPEKTROTEK_INTEGRATION_KEY;else process.env.SPEKTROTEK_INTEGRATION_KEY=previous;
let user=null;const staff=load('app/api/spektrotek-talepleri/[[...path]]/route.ts',{'@/lib/portalYetki':{getPortalUser:async()=>user},'@/lib/spektrotekTalep':store});const ctx=path=>({params:Promise.resolve({path})});
assert.equal((await staff.GET(new Request('https://portal.test/api/spektrotek-talepleri'),ctx([]))).status,401);user={can:()=>false,userName:'Person'};assert.equal((await staff.GET(new Request('https://portal.test/api/spektrotek-talepleri'),ctx([]))).status,403);user={can:()=>true,userName:'Person'};
const staffReq=(method,body,origin='https://portal.test')=>new Request('https://portal.test/api/spektrotek-talepleri',{method,headers:{'Content-Type':'application/json',origin},body:JSON.stringify(body)});
assert.equal((await staff.POST(staffReq('POST',manual,'https://foreign.test'),ctx([]))).status,403);
assert.equal((await staff.POST(staffReq('POST',manual),ctx([]))).status,201);
assert.equal((await staff.PATCH(staffReq('PATCH',{durum:'Bekliyor',surum:1}),ctx(['1']))).status,409);
const response=await staff.GET(new Request('https://portal.test/api/spektrotek-talepleri'),ctx([]));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
assert(queries.some(q=>q.sql.includes(mysql?'FOR UPDATE':'UPDLOCK,HOLDLOCK')));
console.log('PASS '+(mysql?'MySQL':'MSSQL')+': strict feed contract, key/session/permission/origin checks, replay dedup + status/audit preservation, manual create/edit, version conflicts, filtering/UTC dates and batch rollback. No live writes.');
}
run().catch(e=>{console.error(e);process.exitCode=1});
