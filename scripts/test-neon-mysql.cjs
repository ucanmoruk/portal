const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
function load(file, mocks={}, cache=new Map()) {
  const full=path.resolve(file);if(cache.has(full))return cache.get(full).exports;
  const mod={exports:{}};cache.set(full,mod);
  const code=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true,resolveJsonModule:true}}).outputText;
  vm.runInNewContext(code,{module:mod,exports:mod.exports,console,Buffer,process,setTimeout,clearTimeout,require:name=>{
    if(name in mocks)return mocks[name];
    if(name.startsWith('.')||name.startsWith('@/')){
      const next=name.startsWith('@/')?path.resolve(name.slice(2)):path.resolve(path.dirname(full),name);
      if(next.endsWith('.json'))return JSON.parse(fs.readFileSync(next,'utf8'));
      return load(next.endsWith('.ts')?next:next+'.ts',mocks,cache);
    }
    return require(name);
  }},{filename:full});return mod.exports;
}
async function main() {
  const {rewriteNeonSql,rewriteNeonFinanceSql}=load('lib/neonMysql.ts');
  const sql=rewriteNeonSql("SELECT 'rUGDFormul' AS label, f.ID FROM rUGDFormul f JOIN dbo.rUGDListe u ON u.ID=f.UrunID");
  assert.ok(sql.includes("'rUGDFormul' AS label"));assert.ok(sql.includes('`ng_cosmoroot_rUGDFormul`'));assert.ok(sql.includes('`ng_dbo_rUGDListe`'));
  assert.ok(rewriteNeonSql('SELECT * FROM [dbo].[rUGDFormül]').includes('`ng_dbo_rUGDFormül`'));
  assert.ok(rewriteNeonSql('SELECT * FROM UGD_CanliRaporEdits').includes('`ng_public_ugd_canliraporedits`'));
  assert.ok(rewriteNeonSql("SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'rCosing'").includes("TABLE_NAME = 'ng_dbo_rCosing'"));
  assert.throws(()=>rewriteNeonSql('INSERT INTO KysTalep (ID) VALUES (1)'),/eşlemesi/);
  assert.equal(rewriteNeonFinanceSql("SELECT FirmaID, 'FirmaID' FROM PortalFinansKayit"),"SELECT firma_id, 'FirmaID' FROM ng_public_portal_finans_kayit");
  let response='mysql';let fail;
  const fake={query:async()=>{if(fail)throw fail;return [[{Backend:response}]];}};
  const state=load('lib/neonMigrationState.ts',{'mysql2/promise':{createPool:()=>fake},'./mysqlCompat':{hasMysqlConfig:()=>true}});
  assert.equal(await state.isNeonMigrated(),true);response='postgres';assert.equal(await state.isNeonMigrated(),false);
  fail={code:'ER_NO_SUCH_TABLE'};assert.equal(await state.isNeonMigrated(),false);
  fail=Error('target unavailable');await assert.rejects(state.isNeonMigrated(),/target unavailable/);
  const {canonical,physical}=require('./neon-mysql-migration.cjs');
  assert.notEqual(physical('dbo','rUGDFormül'),physical('cosmoroot','rUGDFormul'));
  assert.equal(canonical('100.0000',{udt_name:'numeric'}),'100');assert.equal(canonical(null,{udt_name:'text'}),null);
  assert.equal(canonical('f',{udt_name:'bool'}),'0');assert.equal(canonical(Buffer.from([0,255]),{udt_name:'bytea'}),'\\x00ff');
  const calls=[];const payload=Buffer.from([0,255]);
  const connection={async query(q,values){const sql=typeof q==='string'?q:q.sql;calls.push(sql);if(sql.includes('LAST_INSERT_ID'))return [[{id:999}]];assert.ok(Buffer.isBuffer(values.v));return [{insertId:999,affectedRows:1}];},release(){calls.push('release');}};
  const adapter=load('lib/mysqlCompat.ts',{'mysql2/promise':{createPool:()=>({getConnection:async()=>connection,query:()=>{throw Error('Batch escaped its pinned connection');}})}});
  const pool=new adapter.MysqlCompatPool();
  const inserted=await pool.request().input('v',{type:'binary'},payload).query('INSERT INTO Example (Value) VALUES (@v); SELECT SCOPE_IDENTITY() AS newId');
  assert.equal(inserted.recordset[0].newId,999);assert.equal(calls.at(-1),'release');
  console.log('PASS: schema isolation, accented table names, SQL literals, finance field mapping, fail-closed routing, lossless canonical values');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
