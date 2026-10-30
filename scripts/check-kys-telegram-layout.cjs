// Render the real settings component with local fixture hooks; no external requests.
const fs=require('node:fs'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),assert=require('node:assert/strict');
const fixture={users:[{id:'11',name:'Örnek Kullanıcı'}],recipients:[{userId:'11',chatId:'101',chatLabel:'Örnek Telegram',enabled:true,daily:true,weekly:true,analyses:true,quality:false,overdue:true}],deliveries:[],enabled:false,botConfigured:true,cronConfigured:true,botUsername:'example_bot'};
let index=0;
const hooks={...React,useEffect(){},useState(initial){const position=index++;return [position===0?true:position===1?fixture:position===2?{...fixture.recipients[0]}:initial,()=>{}];}};
const source=ts.transpileModule(fs.readFileSync('app/(dashboard)/admin/ayarlar/TelegramSettings.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const moduleValue={exports:{}};
new Function('require','module','exports',source)(name=>name==='react'?hooks:name.endsWith('.css')?{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})}:require(name),moduleValue,moduleValue.exports);
const globals=fs.readFileSync('app/globals.css','utf8').replace(/^@(?:import|source).*$/gm,'');
const css=fs.readFileSync('app/(dashboard)/admin/ayarlar/telegram.module.css','utf8');
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${globals}\n${css}\nbody{padding:8px}</style></head><body>${renderToStaticMarkup(React.createElement(moduleValue.exports.default))}</body></html>`;
async function run(){
  const {chromium}=require('C:/Users/dazzl/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,timeout:20000});
  fs.mkdirSync('tmp/kys-telegram-check',{recursive:true});
  try{for(const width of [320,375,414,768]){
    const page=await browser.newPage({viewport:{width,height:1100}});await page.setContent(html);
    const metrics=await page.locator('.panel').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));assert(metrics.width<=width&&metrics.scroll<=metrics.width+1,JSON.stringify(metrics));
    assert.equal(await page.locator('input[type=checkbox]').count(),12);
    await page.screenshot({path:`tmp/kys-telegram-check/settings-${width}.png`,fullPage:true});await page.close();console.log('PASS Telegram settings width',width);
  }}finally{await browser.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
