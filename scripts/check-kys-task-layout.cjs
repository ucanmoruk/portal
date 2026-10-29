// Render the real task JSX with local fixture state; no API calls or database access.
const fs=require('node:fs');
const ts=require('typescript');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const assert=require('node:assert/strict');
function compile(file,overrides={}){
  const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const module={exports:{}};
  new Function('require','module','exports',source)(name=>overrides[name]||require(name),module,module.exports);
  return module.exports;
}
async function run(){
  const fixture={id:1,tur:'Görev',baslik:'Bandırma - Çin Kargo',icerik:'Kargonun durumunu sor.',olusturanId:'sender',olusturanAd:'Örnek Atayan',aliciId:'recipient',aliciAd:'Örnek Alıcı',durum:'Atandı',terminTarihi:'2026-10-05',baslangicTarihi:'2026-10-05',bitisTarihi:'2026-10-05',kategori:'Rutin Dışı',createdAt:'2026-10-04T10:47:00Z',okundu:true,akış:[{durum:'Atandı',kullaniciAd:'Örnek Atayan',createdAt:'2026-10-04T10:47:00Z'}],yorumlar:[{id:2,icerik:'Kutular geldi.',olusturanAd:'Örnek Atayan',createdAt:'2026-10-29T12:11:00Z'}]};
  const hooks={...React,useEffect(){},useCallback:fn=>fn,useMemo:fn=>fn(),useRef:current=>({current}),useState(initial){
    let value=typeof initial==='function'?initial():initial;
    if(value==='Duyuru')value='Görev';
    if(value===true)value=false;
    if(value instanceof Set)value=new Set([1]);
    if(value&&typeof value==='object'&&'gorevler' in value)value={duyurular:[],mesajlar:[],arsivMesajlar:[],gorevler:[fixture]};
    return [value,()=>{}];
  }};
  const Client=compile('app/(dashboard)/laboratuvar/kys/iletisim/IletisimClient.tsx',{
    react:hooks,'next/navigation':{useSearchParams:()=>new URLSearchParams()},
    '@/lib/kysMessageReply':compile('lib/kysMessageReply.ts'),
    '@/lib/kysTaskPlanning':compile('lib/kysTaskPlanning.ts'),
    './LabAkisi':{__esModule:true,default:()=>null},
    './iletisim.module.css':{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})},
  }).default;
  const css=fs.readFileSync('app/(dashboard)/laboratuvar/kys/iletisim/iletisim.module.css','utf8');
  const globals=fs.readFileSync('app/globals.css','utf8').replace(/^@(?:import|source).*$/gm,'');
  const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${globals}\n${css}\nbody{padding:8px}.shell{min-width:0}</style></head><body>${renderToStaticMarkup(React.createElement(Client,{currentUserId:'recipient'}))}</body></html>`;
  const {chromium}=require('C:/Users/dazzl/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    for(const width of [320,375,414,768,1280]){
      const page=await browser.newPage({viewport:{width,height:1100}});
      await page.setContent(html);
      const metrics=await page.locator('.taskRow').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,title:getComputedStyle(el.querySelector('.taskMain strong')).fontSize,author:getComputedStyle(el.querySelector('.taskDiscussion article strong')).fontSize,comment:getComputedStyle(el.querySelector('.taskDiscussion article p')).fontSize}));
      assert(metrics.width<=width,JSON.stringify({width,...metrics}));
      assert(metrics.scroll<=metrics.width+1,JSON.stringify({width,...metrics}));
      assert(parseFloat(metrics.title)>parseFloat(metrics.author));
      assert.equal(metrics.comment,'14px');
      await page.locator('.taskRow').screenshot({path:`tmp/kys-export-check/task-${width}.png`});
      console.log('PASS task layout',width,metrics);
      await page.close();
    }
  }finally{await browser.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
