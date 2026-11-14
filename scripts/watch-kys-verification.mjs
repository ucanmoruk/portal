import { watch } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
let timer;
let child;
export function watchKysVerification({ initial = true } = {}) {
 const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(child){schedule();return;}child=spawn(process.execPath,[path.resolve('scripts/verify-kys.cjs')],{cwd:process.cwd(),stdio:'inherit'});child.on('exit',()=>{child=undefined;});},15000);};
 const watchers=['app','components','lib','scripts'].map(folder=>watch(folder,{recursive:true},(_event,file)=>{if(file&&/\.(tsx?|cjs|mjs|css)$/.test(String(file)))schedule();}));
 if(initial)schedule();
 return ()=>{clearTimeout(timer);watchers.forEach(w=>w.close());};
}
if(process.argv[1]===new URL(import.meta.url).pathname){watchKysVerification();console.log('[KYS] Kaynak değişiklikleri otomatik doğrulama için izleniyor.');}
