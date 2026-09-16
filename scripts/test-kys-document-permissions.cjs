const assert=require("node:assert/strict"),fs=require("node:fs"),ts=require("typescript"),vm=require("node:vm");
let user;
function load(file, imports={}) {
  const mod={exports:{}}; const js=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(js,{module:mod,exports:mod.exports,Response,require:n=>{if(n in imports)return imports[n];throw Error(n);}});return mod.exports;
}
const auth=load("lib/kysDokumanYetki.ts");
const portal=keys=>({isAdmin:false,can:key=>keys.includes(key)});
const view=auth.DOKUMAN_YETKI.goruntule,edit=auth.DOKUMAN_YETKI.duzenle;
user=portal([view]); const permissions=auth.dokumanYetkileri(user);
assert(permissions.goruntule); for(const key of ["olustur","duzenle","kontrol","onayla","sil"])assert.equal(permissions[key],false);
assert.equal(auth.aksiyonaIzinVar(user,[edit]),false);
const api=load("app/api/kys/dokumanlar/[id]/route.ts",{"@/lib/portalYetki":{getPortalUser:async()=>user},"@/lib/kysDokumanYetki":auth,"@/lib/kysDokumanStore":{getKysDokuman:async()=>({id:2})}});
const page=load("app/(dashboard)/laboratuvar/kys/dokuman-yonetimi/[id]/page.tsx",{"@/lib/portalYetki":{getPortalUser:async()=>user},"@/lib/kysDokumanYetki":auth,"next/navigation":{redirect:url=>{throw Error("redirect:"+url);},notFound:()=>{throw Error("notFound");}},"@/app/styles/table.module.css":{default:{page:"page"}},"../DokumanYonetimiClient":{},"react/jsx-runtime":{jsx:()=>({})}});
(async()=>{
  const context={params:Promise.resolve({id:"2"})};
  assert.equal((await api.GET(null,context)).status,200);
  assert.equal((await api.PATCH(null,context)).status,403);
  assert.equal((await api.DELETE(null,context)).status,403);
  await assert.rejects(page.default(context),/redirect:.*2\/onizleme/);
  user=portal([view,edit]);assert.equal(auth.dokumanYetkileri(user).duzenle,true);await page.default(context);
  user={isAdmin:true,can:()=>true};assert.equal(auth.dokumanYetkileri(user).duzenle,true);await page.default(context);
  console.log("PASS: view-only document permissions, forbidden update/delete, direct editor redirect, explicit editor and admin access.");
})().catch(e=>{console.error(e);process.exitCode=1;});
