/* eslint-disable @typescript-eslint/no-require-imports */
// Runs actual technical checks and stores a printable, immutable report. No automatic accreditation approval.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = process.cwd();
const lock = path.join(os.tmpdir(), 'portal-kys-verify-' + crypto.createHash('sha256').update(root).digest('hex').slice(0,12) + '.lock');
try { fs.writeFileSync(lock, String(process.pid), {flag:'wx'}); } catch { console.log('Doğrulama zaten çalışıyor.'); process.exit(0); }
const started = new Date();
function check(name, program, args) {
 const start = Date.now();
 try { const output = execFileSync(program, args, {cwd:root,encoding:'utf8',timeout:180000,maxBuffer:2*1024*1024,env:{...process.env,NO_COLOR:'1'}});return {name,passed:true,ms:Date.now()-start,output:output.trim().slice(-2800)||'Çıkış kodu 0'}; }
 catch(e) { return {name,passed:false,ms:Date.now()-start,output:[e.stdout,e.stderr,e.message].filter(Boolean).join('\n').slice(-2800)}; }
}
(async()=>{
 const results = [
  check('TypeScript tip kontrolü', process.execPath, ['node_modules/typescript/bin/tsc','--noEmit','--incremental','false']),
  check('KYS kayıt, sürüm ve hesap kuralları',process.execPath,['scripts/test-kys-workspace.cjs']),
  check('Unique veri ayrımı ve sadeleştirilmiş süreçler',process.execPath,['scripts/test-unique-analysis.cjs']),
  check('Yeni KYS modülleri kod kontrolü',process.execPath,['node_modules/eslint/bin/eslint.js','components/kys-workspace','lib/kysWorkspaceConfig.ts','lib/kysWorkspaceStore.ts','lib/analysisScope.ts','lib/uniqueAnalysis.ts','lib/uniqueAnalysisRoute.ts','app/api/kys/analiz','app/api/kys/dogrulama','--quiet']),
 ];
 const revision = execFileSync('git',['rev-parse','--short','HEAD'],{encoding:'utf8'}).trim();
 const hash = crypto.createHash('sha256');
 for(const folder of ['app','components','lib','scripts']) { const walk=d=>{for(const entry of fs.readdirSync(d,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const p=path.join(d,entry.name);if(entry.isDirectory())walk(p);else if(/\.(tsx?|cjs|mjs|css)$/.test(p)){hash.update(path.relative(root,p));hash.update(fs.readFileSync(p));}}};walk(path.join(root,folder)); }
 const digest = hash.digest('hex');
 require('@next/env').loadEnvConfig(root);
 const Module = require('node:module'), ts = require('typescript'), resolve = Module._resolveFilename;
 Module._resolveFilename=function(name,parent,...rest){return resolve.call(this,name.startsWith('@/')?path.join(root,name.slice(2)):name,parent,...rest)};
 require.extensions['.ts']=function(mod,file){mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true,resolveJsonModule:true}}).outputText,file)};
 const {saveWorkspaceRecord}=require(path.join(root,'lib/kysWorkspaceStore.ts'));
 const passed=results.filter(r=>r.passed).length;
 const row=await saveWorkspaceRecord('yazilim-raporlari',{status:passed===results.length?'Başarılı':'Başarısız',data:{title:'Portal otomatik teknik doğrulama',date:started.toLocaleDateString('sv-SE',{timeZone:'Europe/Istanbul'}),revision:`${revision} / SHA256 ${digest}`,scope:'Tip kontrolü, KYS iş kuralları, Unique veri ayrımı ve yeni modül lint kontrolleri',passed:String(passed),failed:String(results.length-passed),results:results.map(r=>`${r.passed?'BAŞARILI':'BAŞARISIZ'} · ${r.name} · ${r.ms} ms\n${r.output}`).join('\n\n'),limitations:`Başlangıç: ${started.toISOString()}\nBitiş: ${new Date().toISOString()}\nBu rapor otomatik teknik kontrollerin kanıtıdır. Laboratuvarın kullanıcı kabulünü, tüm cihaz/metotların bilimsel doğrulamasını veya akreditasyon onayını temsil etmez. Üretim verileri değiştirilmeden test edilmiştir.`}},{userId:'system-verification',userName:'Otomatik doğrulama'});
 console.log(`Rapor: ${row.id} · ${passed}/${results.length} başarılı`);
 process.exitCode=passed===results.length?0:1;
})().catch(e=>{console.error('Doğrulama raporu kaydedilemedi:',e.message);process.exitCode=1}).finally(()=>{try{fs.unlinkSync(lock)}catch{};process.exit(process.exitCode||0)});
