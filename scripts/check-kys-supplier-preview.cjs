// Local rendering only; no API, database or email calls.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),assert=require('node:assert/strict');
function compile(file,overrides={}){
  const input=fs.readFileSync(file,'utf8').replaceAll('import.meta.url',JSON.stringify(pathToFileURL(path.resolve(file)).href));
  const source=ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const module={exports:{}};new Function('require','module','exports',source)(name=>overrides[name]||(name.startsWith('.')&&fs.existsSync(path.resolve(path.dirname(file),name)+'.ts')?compile(path.resolve(path.dirname(file),name)+'.ts'):require(name)),module,module.exports);return module.exports;
}
async function run(){
  fs.mkdirSync('tmp/kys-supplier-check',{recursive:true});
  const policy=compile('lib/kysSupplierMailPolicy.ts');
  let index=0;let listExpanded=true;
  const suppliers=[{ID:1,Ad:'Örnek Ölçüm Tedarikçisi',Email:'satis@example.com; teklifler@example.com'},{ID:2,Ad:'E-posta kaydı eksik tedarikçi',Email:''}];
  const hooks={...React,useEffect(){},useMemo:fn=>fn(),useState(initial){const state=index++;return [state===0?suppliers:state===1?[1]:state===3?false:state===6?listExpanded:initial,()=>{}];}};
  const cssModule={__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
  const Dialog=compile('app/(dashboard)/laboratuvar/kys/talep-listesi/SupplierApprovalDialog.tsx',{
    react:hooks,'@/lib/kysSupplierMailPolicy':policy,'@/app/styles/table.module.css':cssModule,'../kys.module.css':cssModule,
  }).default;
  const globals=fs.readFileSync('app/globals.css','utf8').replace(/^@(?:import|source).*$/gm,'');
  const css=globals+fs.readFileSync('app/styles/table.module.css','utf8')+fs.readFileSync('app/(dashboard)/laboratuvar/kys/kys.module.css','utf8');
  const renderPreview=(props={})=>{index=0;return `<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${renderToStaticMarkup(React.createElement(Dialog,{requestNo:'2026-1001',onClose(){},onSend(){throw new Error('No sends in preview');},...props}))}</body></html>`;};
  const html=renderPreview();
  const {chromium}=require('C:/Users/dazzl/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,timeout:20000});
  try{for(const width of [320,375,414,768]){
    const page=await browser.newPage({viewport:{width,height:900}});await page.setContent(html);
    const metrics=await page.locator('.approvalModal').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right}));
    assert(metrics.scroll<=metrics.width+1&&metrics.left>=0&&metrics.right<=width,JSON.stringify(metrics));
    assert.equal(await page.locator('input[type=checkbox]:disabled').count(),1);
    await page.locator('.approvalModal').screenshot({path:`tmp/kys-supplier-check/approval-${width}.png`});await page.close();
    console.log('PASS approval layout',width);
  }
    listExpanded=false;
    const collapsed=await browser.newPage({viewport:{width:660,height:850}});await collapsed.setContent(renderPreview({hasPrevious:true}));
    assert.equal(await collapsed.locator('#supplier-mail-options').count(),0);
    assert.equal(await collapsed.locator('textarea').count(),1);
    assert(await collapsed.getByRole('button',{name:'Yeniden mail gönder'}).isDisabled());
    await collapsed.locator('.approvalModal').screenshot({path:'tmp/kys-supplier-check/resend.png'});await collapsed.close();
    const signatureLogo=`data:image/png;base64,${fs.readFileSync('public/unique-logo.png').toString('base64')}`;
    const mailPage=await browser.newPage({viewport:{width:660,height:700}});
    await mailPage.setContent(policy.supplierMailContent().html.replace('cid:purchasing-signature',signatureLogo));
    assert((await mailPage.locator('body>div').evaluate(el=>getComputedStyle(el).fontFamily)).includes('Tahoma'));
    await mailPage.screenshot({path:'tmp/kys-supplier-check/mail.png',fullPage:true});await mailPage.close();
  }finally{await browser.close();}
  const {renderHtmlToPdf}=compile('lib/chromiumPdf.ts',{'@/lib/loadDotenv':{loadDotenvOnce(){}}});
  const snapshot={talepNo:'2026-1001',seri:'Unique',firmaAdi:'UNIQUE',olusturanAd:'Örnek Talep Eden',onaylayanAd:'Örnek Onaylayan',olusturmaTarihi:'2026-10-29',teknikSartname:'Ölçüm aralığı ve kalibrasyon sertifikası talebi.',notlar:'Teklif ve teslimat süresini bildiriniz.',kalemler:Array.from({length:35},(_,i)=>({kod:`MAT-${i+1}`,stokKod:'',malzemeAdi:'Ölçüm malzemesi – Türkçe karakter kontrolü',ozellik:'Ölçüm hassasiyeti ve teknik özellikler',marka:'Örnek',kullaniciNotu:'',miktar:2.5,birim:'Adet'}))};
  const logo=`data:image/png;base64,${fs.readFileSync('public/unique-logo.png').toString('base64')}`;
  const shared=compile('lib/kysRequestForm.ts');
  assert(shared.requestFormMarkup(snapshot,{logo}).includes('Örnek Onaylayan'));
  assert(!policy.purchaseFormHtml(snapshot,logo).includes('Örnek Onaylayan'));
  assert(!policy.purchaseFormHtml(snapshot,logo).includes('Örnek Talep Eden'));
  const pdf=await renderHtmlToPdf(policy.purchaseFormHtml(snapshot,logo),{marginTop:14/25.4,marginBottom:22/25.4,marginLeft:14/25.4,marginRight:14/25.4});
  fs.writeFileSync('tmp/kys-supplier-check/talep-formu.pdf',pdf);
  console.log('PASS: local modal screenshots and PDF attachment fixture generated without mail or DB access.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
