const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function compile(file, imports) {
 const module={exports:{}};
 new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(name=>imports[name] || require(name),module,module.exports);
 return module.exports;
}
const language=compile('lib/raporFormatLanguage.ts',{});
async function check(format,expected){
 const queries=[];
 const pool={request(){const params={};return {input(k,v){params[k]=v;return this;},async query(sql){queries.push({sql,params:{...params}});if(sql.includes('INFORMATION_SCHEMA.TABLES'))return {recordset:['NKR_RaporOnay','NKR_LabKabul','NKR_RaporDurumOverride','NKR_Log','NKR_RaporDuzenleme'].map(TABLE_NAME=>({TABLE_NAME}))};if(sql.includes('INFORMATION_SCHEMA.COLUMNS'))return {recordset:[{x:1}]};return {recordset:[]};}};}};
 const route=compile('app/api/rapor-takip/[nkrId]/geri-gonder/route.ts',{'@/lib/raporFormatLanguage':language,'@/lib/challengeImport':{isChallengeFormat:f=>/^challenge(en)?$/i.test(f)},'@/lib/numuneWorkspace':{checkNumuneWorkspace:async()=>null},'next-auth':{getServerSession:async()=>({user:{userId:1}})},'@/lib/auth':{authOptions:{}},'@/lib/db':{cosmoPool:Promise.resolve(pool)}});
 const response=await route.POST(new Request('https://example.test/api/rapor-takip/41605/geri-gonder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({format})}),{params:Promise.resolve({nkrId:'41605'})});
 assert.equal(response.status,200);
 const updates=queries.filter(q=>q.sql.includes('UPDATE NKR_RaporOnay'));
 assert.deepEqual(updates.map(q=>q.params.format),expected);
 for(const query of updates){assert.equal(query.params.nkrId,41605);assert.match(query.sql,/ImzaHash = NULL/);assert.doesNotMatch(query.sql,/KarekodToken\s*=|DisRaporKodu\s*=/);}
 assert.deepEqual(queries.filter(q=>q.sql.includes('UPDATE NKR_RaporDuzenleme')).map(q=>q.params.format),expected);
 assert.deepEqual(queries.filter(q=>q.sql.includes('INSERT INTO NKR_RaporDurumOverride')).map(q=>q.params.format),expected);
 assert(!queries.some(q=>/DELETE FROM NKR_LabKabul/.test(q.sql)));
 console.log('PASS:',format,'returns/unlocks only',expected.join(', '),'and preserves report identity and lab acceptance');
}
(async()=>{await check('Challenge',['Challenge','ChallengeEn']);await check('ChallengeEn',['Challenge','ChallengeEn']);await check('Genel',['Genel']);})().catch(e=>{console.error(e);process.exitCode=1;});
