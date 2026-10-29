// Local fixture validation only: no database or authenticated requests.
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const ts = require('typescript');
const assert = require('node:assert/strict');
function compile(file, overrides={}) {
  const input = fs.readFileSync(file,'utf8').replaceAll('import.meta.url',JSON.stringify(pathToFileURL(path.resolve(file)).href));
  const source = ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const module = {exports:{}};
  new Function('require','module','exports',source)(name=>overrides[name]||require(name),module,module.exports);
  return module.exports;
}
async function run(){
  const {createDocumentWorkbook,documentMasterHtml}=compile('lib/kysDokumanExport.ts');
  const {renderHtmlToPdf}=compile('lib/chromiumPdf.ts',{'@/lib/loadDotenv':{loadDotenvOnce(){}}});
  const XLSX=require('xlsx');
  const documents=Array.from({length:80},(_,i)=>({kod:`P${String(i+1).padStart(3,'0')}`,baslik:i===0?'=Formül olarak çalıştırılmamalı':i%7===0?'Çok uzun bir doküman adı: Türkçe karakterler, ölçüm belirsizliği, çalışanların eğitimi ve iletişim süreçlerinin yönetimi için ayrıntılı çalışma prosedürü':'Doküman yönetimi ve kayıtların kontrolü',tur:'Prosedür',durum:'Yayında',revizyonEtiket:'02',yururlukTarihi:'2026-09-01',hazirlayanAd:'Örnek Hazırlayan',onaylayanAd:'Örnek Onaylayan',updatedAt:'2026-10-29T12:30:00Z'}));
  const workbook=createDocumentWorkbook(documents);
  const parsed=XLSX.read(workbook,{cellDates:true});const sheet=parsed.Sheets[parsed.SheetNames[0]];
  assert.equal(XLSX.utils.sheet_to_json(sheet).length,80);
  assert.equal(sheet.D2.v,'02');assert.equal(sheet.B2.t,'s');assert.equal(sheet.B2.f,undefined);
  assert.equal(sheet.H2.t,'d');assert.equal(sheet.H2.v.toISOString().slice(0,10),'2026-09-01');
  const logo=`data:image/png;base64,${fs.readFileSync('public/kys-document-logo.png').toString('base64')}`;
  const mixed = [
    {...documents[0],tur:'Form',kod:'F10'},
    {...documents[0],tur:'Talimat',kod:'T10'},
    {...documents[0],tur:'Prosedür',kod:'P10'},
    {...documents[0],tur:'Form',kod:'F2'},
    {...documents[0],tur:'Prosedür',kod:'P2'},
  ];
  const master=documentMasterHtml(mixed,logo).html;
  const orderedCodes=[...master.matchAll(/<tr><td>\d+<\/td><td>[^<]*<\/td><td>([^<]*)<\/td>/g)].map(match=>match[1]);
  assert.deepEqual(orderedCodes,['P2','P10','T10','F2','F10']);
  assert.equal(mixed[0].kod,'F10'); // Sorting must not mutate the source list.
  let user=null;let allowed=false;let receivedFilters;
  const route=compile('app/api/kys/dokumanlar/export/route.ts',{
    '@/lib/portalYetki':{getPortalUser:async()=>user},
    '@/lib/kysDokumanYetki':{dokumanYetkileri:()=>({goruntule:allowed})},
    '@/lib/kysDokumanStore':{listKysDokumanlar:async filters=>{receivedFilters=filters;return {data:documents};}},
    '@/lib/kysDokumanExport':{createDocumentWorkbook,documentMasterHtml},
    '@/lib/chromiumPdf':{renderHtmlToPdf:async()=>Buffer.from('fixture PDF')},
  });
  const url='http://localhost/api/kys/dokumanlar/export?format=excel&search=kontrol&tur=Prosed%C3%BCr&durum=Yay%C4%B1nda&sort=kod-asc';
  assert.equal((await route.GET(new Request(url))).status,401);
  user={userId:'fixture'};
  assert.equal((await route.GET(new Request(url))).status,403);
  allowed=true;
  assert.equal((await route.GET(new Request(url.replace('format=excel','format=invalid')))).status,400);
  const response=await route.GET(new Request(url));assert.equal(response.status,200);
  assert.deepEqual(receivedFilters,{search:'kontrol',tur:'Prosedür',durum:'Yayında',sort:'kod-asc',all:true});
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  const exported=XLSX.read(Buffer.from(await response.arrayBuffer()),{cellDates:true});
  assert.equal(XLSX.utils.sheet_to_json(exported.Sheets[exported.SheetNames[0]]).length,80);
  const pdfResponse=await route.GET(new Request(url.replace('format=excel','format=master')));
  assert.equal(pdfResponse.headers.get('content-type'),'application/pdf');
  for(const count of [0,1,80]){
    const {html,headerTemplate}=documentMasterHtml(documents.slice(0,count),logo);
    const pdf=await renderHtmlToPdf(html,{headerTemplate,displayHeaderFooter:true,footerTemplate:'<div></div>',paperWidth:11,paperHeight:8.5025,marginTop:1.14,marginBottom:.35,marginLeft:.35,marginRight:.35});
    fs.writeFileSync(`tmp/kys-export-check/master-${count}.pdf`,pdf);
  }
  console.log('PASS: 80 workbook records, revision text/leading zeros, typed dates, formula-looking text safe; rendered empty/single/multipage PDFs.');
}
run().then(()=>process.exit(0),error=>{console.error(error);process.exit(1);});
