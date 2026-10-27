/* eslint-disable @typescript-eslint/no-require-imports */
// Executes the real API handlers against the isolated MySQL copy. All test writes roll back.
require('@next/env').loadEnvConfig(process.cwd());
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const pools=[];
const mysql=require('mysql2/promise');
const mysqlMock={...mysql,createPool(config){const pool=mysql.createPool(config);pools.push(pool);return pool;}};
const cache=new Map();let db;
function load(file) {
 const full=path.resolve(file);if(cache.has(full))return cache.get(full).exports;
 if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));
 const mod={exports:{}};cache.set(full,mod);
 const code=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module:mod,exports:mod.exports,console,Buffer,process,Response,URL,Headers,Request,setTimeout,clearTimeout,require:name=> {
   if(name==='mysql2/promise')return mysqlMock;
   if(name==='next-auth')return {getServerSession:async()=>({user:{id:'2',name:'Migration verification'}})};
   if(name==='@/lib/auth')return {authOptions:{}};
   if(name==='./neonMigrationState')return {isNeonMigrated:async()=>true,migrationMysqlPool:()=>pools[0]};
   if(name==='@/lib/db')return {__esModule:true,default:Promise.resolve(db),cosmoPool:Promise.resolve(db)};
   if(name.startsWith('@/')||name.startsWith('.')) {const next=name.startsWith('@/')?path.resolve(name.slice(2)):path.resolve(path.dirname(full),name);return load(/\.(ts|json)$/.test(next)?next:next+'.ts');}
   return require(name);
 }},{filename:full});return mod.exports;
}
async function get(file,url) {
 const route=load(file);const request={url:'http://localhost'+url,nextUrl:new URL('http://localhost'+url)};
 const result=await route.GET(request);const json=await result.json();assert.equal(result.status,200,JSON.stringify(json));console.log('PASS GET '+url);return json;
}
async function main() {
 db=load('lib/neonMysql.ts').neonMysqlPool;
 const list=await get('app/api/urunler/route.ts','/api/urunler?limit=5');assert.ok(Number(list.total)>0);
 const id=Number(list.data[0].ID);assert.ok(id>0);
 const detail=await load('app/api/urunler/[id]/route.ts').GET({url:'http://localhost/api/urunler/'+id},{params:Promise.resolve({id:String(id)})});
 assert.equal(detail.status,200,await detail.clone().text());console.log('PASS complete UGD product details and saved report text');
 await get('app/api/musteriler/route.ts','/api/musteriler?limit=5');
 await get('app/api/cosing/route.ts','/api/cosing?search=GLYCERIN&limit=5');
 await get('app/api/yonetmelik/route.ts','/api/yonetmelik?limit=5');
 await get('app/api/urunler/lookup/route.ts','/api/urunler/lookup');
 await get('app/api/urunler/formul/route.ts','/api/urunler/formul?urunId='+id);
 await get('app/api/urunler/canli-rapor/route.ts','/api/urunler/canli-rapor?source=ugd&recordId='+id);
 const finance=load('lib/financeStore.ts');assert.equal((await finance.listFinanceCompanies()).length,5);
 assert.equal((await finance.listFinanceEntries()).length,2);assert.equal((await finance.listFinancePayments()).length,1);console.log('PASS existing finance companies, entries and payments from isolated MySQL');
 const photoId=(await db.request().query('SELECT TOP 1 RaporID FROM NumuneFotoBlob')).recordset[0].RaporID;
 const photo=await load('lib/numunePhotoStore.ts').readNumunePhoto(Number(photoId));assert.ok(Buffer.isBuffer(photo.FotoData)&&photo.FotoData.length>0);console.log('PASS migrated sample photo blob');
 const match=await load('app/api/formul-kontrol/match/route.ts').POST({json:async()=>({items:[{name:'GLYCERIN',amount:'1,25'},{name:'PHENOXYETHANOL',amount:'0,5'}]})});
 const matched=await match.json();assert.equal(match.status,200,JSON.stringify(matched));assert.equal(matched.length,2);assert.ok(matched.every(x=>x.matched));assert.equal(matched[0].inputAmount,'1.25');console.log('PASS formula matching, ingredient profiles, regulation limits and decimal amounts');
 const baseline='outputs/neon-mysql-migration-2026-10-27/source-match.json';
 if(fs.existsSync(baseline)){assert.deepEqual(JSON.parse(JSON.stringify(matched)),JSON.parse(fs.readFileSync(baseline,'utf8')));console.log('PASS exact source/target formula API parity (including NOAEL, regulation limits and profiles)');}
 const tx=await db.transaction();await tx.begin();
 try {
  const before=(await tx.request().input('id',id).query('SELECT COUNT(*) AS n FROM rUGDFormul WHERE UrunID=@id')).recordset[0].n;
  await load('lib/ugdPersistence.ts').saveUgdFormulaRows(tx,id,[{INCIName:'MIGRATION ROLLBACK CHECK',inputAmount:'0,01',dap:100}]);
  const inside=(await tx.request().input('id',id).query('SELECT COUNT(*) AS n FROM rUGDFormul WHERE UrunID=@id')).recordset[0].n;assert.equal(Number(inside),1);
  await tx.rollback();
  const after=(await db.request().input('id',id).query('SELECT COUNT(*) AS n FROM rUGDFormul WHERE UrunID=@id')).recordset[0].n;assert.equal(String(after),String(before));
  console.log('PASS atomic formula replacement, product row lock and rollback (no saved changes)');
 }catch(e){try{await tx.rollback();}catch{}throw e;}
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await Promise.all(pools.map(p=>p.end()));});
