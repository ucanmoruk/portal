/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:m,exports:m.exports,require});return m.exports}
const scope=load('lib/analysisScope.ts'),config=load('lib/kysWorkspaceConfig.ts');
(async()=>{
const sql="SELECT * FROM eurolab_validations JOIN eurolab_methods ON true";
assert.equal(scope.scopedAnalysisSql(sql),sql);
const results=await Promise.all([scope.withUniqueAnalysis(async()=>{await Promise.resolve();return scope.scopedAnalysisSql(sql)}),Promise.resolve().then(()=>scope.scopedAnalysisSql(sql))]);
assert.equal(results[0],sql.replaceAll('eurolab_','unique_'));assert.equal(results[1],sql);
assert.equal(scope.inUniqueAnalysis(),false);
assert.equal(config.WORKSPACES['kalibrasyon-kontrol'].fields.find(f=>f.key==='kind').required,true);
assert.equal(config.WORKSPACES['kalibrasyon-belirsizlikleri'].fields.find(f=>f.key==='calibrationId').relation,'kalibrasyon-kontrol');
assert.equal(config.WORKSPACES['toplanti-kararlari'].fields.some(f=>f.relation==='toplantilar'),false);
assert.equal(config.WORKSPACES['toplanti-kararlari'].fields.find(f=>f.key==='meetingDate').required,true);
const sidebar=fs.readFileSync('components/Sidebar.tsx','utf8');
for(const removed of ['ara-kontrol-plani','kalibrasyon-belirsizlikleri','toplantilar','yazilim-testleri','degisiklik-kontrolu','analiz-listesi'])assert.equal(sidebar.includes(`href: "/laboratuvar/kys/${removed}"`),false,removed);
assert.ok(sidebar.includes('/laboratuvar/kys/kalibrasyon-kontrol'));
assert.ok(fs.readFileSync('lib/uniqueAnalysis.ts','utf8').includes("WHERE Tur='SOP'"));
console.log('PASS: concurrent Unique/Eurolab query isolation, merged controls, device uncertainty relation, standalone meeting decisions and simplified sidebar.');
})().catch(e=>{console.error(e);process.exitCode=1});
