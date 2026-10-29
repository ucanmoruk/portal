// Isolated approval/outbox/SMTP contract checks. Never connects to a real DB or SMTP server.
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const assert=require('node:assert/strict');
function compile(file,overrides={}){
  const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const module={exports:{}};
  new Function('require','module','exports',source)(name=>name in overrides?overrides[name]:name.startsWith('.')&&fs.existsSync(path.resolve(path.dirname(file),name)+'.ts')?compile(path.resolve(path.dirname(file),name)+'.ts'):require(name),module,module.exports);
  return module.exports;
}
const policy=compile('lib/kysSupplierMailPolicy.ts');
let jobs=[];
let root={ID:1,TalepNo:'2026-1001',TalepTuru:'Stok Malzeme',Seri:'Unique',Durum:'Onay Bekliyor',OlusturanAd:'Örnek',OlusturmaTarihi:'2026-10-29',MailOnayID:null};
const suppliers=[{ID:1,Ad:'Birinci Tedarikçi',Email:'SATIS@one.example; teklif@one.example; satis@one.example'},{ID:2,Ad:'İkinci Tedarikçi',Email:'info@two.example'},{ID:3,Ad:'Adres Yok',Email:''}];
const result=(recordset=[],affected=0)=>({recordset,rowsAffected:[affected]});
function request(){const args={};return {input(key,value){args[key]=value;return this;},async query(raw){
  const sql=raw.replace(/\s+/g,' ').trim();
  if(/^(CREATE|ALTER|IF|UPDATE KysStok|UPDATE KysTalep SET Seri|INSERT INTO KysLaboratuvarBirim|INSERT IGNORE)/.test(sql))return result();
  if(sql.startsWith('SELECT Durum,TalepTuru FROM KysTalep'))return result([root]);
  if(sql.startsWith('SELECT MailOnayID,Durum FROM KysTalep'))return result([root]);
  if(sql.startsWith('SELECT * FROM KysTalep WHERE'))return result([root]);
  if(sql.startsWith('SELECT k.*, s.Kod'))return result([{ID:1,Kod:'MAT-1',MalzemeAdi:'Türkçe ölçüm malzemesi',Miktar:2,Birim:'Adet'}]);
  if(sql.startsWith('SELECT k.*, h.HedefBirimID'))return result();
  if(sql.startsWith('SELECT ID,Ad,Email FROM KysTedarikci'))return result(suppliers.filter(s=>s.ID===args.ID));
  if(sql.startsWith('INSERT INTO KysTalepTedarikciMail')){
    assert(!jobs.some(job=>job.OnayID===args.OnayID&&job.TedarikciID===args.TedarikciID));
    jobs.push({ID:args.ID,OnayID:args.OnayID,TalepID:args.TalepID,TedarikciID:args.TedarikciID,TedarikciAd:args.Ad,Alicilar:args.Alicilar,FormJson:args.Form,Durum:'Bekliyor'});return result([],1);
  }
  if(sql.startsWith("UPDATE KysTalep SET Durum='İşleme Alındı'")){
    const active=jobs.filter(job=>job.OnayID===root.MailOnayID);if(root.Durum==='Onaylandı'&&active.length&&active.every(job=>job.Durum==='Gönderildi')){root.Durum='İşleme Alındı';return result([],1);}return result();
  }
  if(sql.startsWith('SELECT m.ID,m.OnayID,m.Durum'))return result(jobs.map(job=>({...job,ZamanAsimi:job.ZamanAsimi||0})));
  if(sql.startsWith('UPDATE KysTalepTedarikciMail SET Asama=')){jobs.find(job=>job.ID===args.ID).Asama=args.Asama;return result([],1);}
  if(sql.startsWith('SELECT TedarikciID FROM KysTalepTedarikciMail'))return result(jobs.filter(job=>job.OnayID===args.OnayID));
  if(sql.startsWith('UPDATE KysTalep SET MailOnayID')){root.MailOnayID=args.MailOnayID;return result([],1);}
  if(sql.startsWith('UPDATE KysTalep SET Durum')){
    if(root.Durum!==args.Current)return result();
    root.Durum=args.Durum;if(args.Durum==='Onaylandı'){root.MailOnayID=args.MailOnayID;root.OnaylayanAd=args.UserName;}if(args.Durum==='Onay Bekliyor')root.MailOnayID=null;
    return result([],1);
  }
  if(sql.startsWith('SELECT ID FROM KysTalepKabul'))return result();
  if(sql.startsWith('SELECT m.* FROM KysTalepTedarikciMail'))return result(jobs.filter(job=>job.OnayID===root.MailOnayID&&!['Onay Bekliyor','İptal','Silindi'].includes(root.Durum)&&(job.Durum==='Bekliyor'||sql.includes("'Bekliyor','Hata'")&&job.Durum==='Hata')));
  if(sql.startsWith("UPDATE KysTalepTedarikciMail SET Durum='Gönderiliyor'")){
    const job=jobs.find(job=>job.ID===args.ID);if(!job||!(job.Durum==='Bekliyor'||sql.includes("'Bekliyor','Hata'")&&job.Durum==='Hata'))return result();job.Durum='Gönderiliyor';return result([],1);
  }
  if(sql.startsWith("UPDATE KysTalepTedarikciMail SET Durum='Gönderildi'")){Object.assign(jobs.find(job=>job.ID===args.ID),{Durum:'Gönderildi',MesajID:args.MesajID});return result([],1);}
  if(sql.startsWith('UPDATE KysTalepTedarikciMail SET Durum=@Durum')){Object.assign(jobs.find(job=>job.ID===args.ID),{Durum:args.Durum,Hata:args.Hata});return result([],1);}
  if(sql.startsWith('SELECT m.ID,m.TedarikciAd'))return result(jobs);
  throw new Error(`Unhandled isolated query: ${sql}`);
}};}
const pool={request,async transaction(){let backup;return {request,async begin(){backup=structuredClone({root,jobs});},async commit(){},async rollback(){root=backup.root;jobs=backup.jobs;}};}};
const sent=[];let mode='ok';let verifyFailure=false;
const smtp={async verify(){if(verifyFailure)throw new Error('Fixture authentication failure');},async sendMail(mail){
  sent.push(mail);
  if(mode==='timeout')throw Object.assign(new Error('Fixture timeout after DATA'),{code:'ETIMEDOUT'});
  return {messageId:mail.messageId,accepted:mode==='partial'?[mail.to[0]]:[...mail.to,...mail.cc],rejected:mode==='partial'?[mail.to[1]]:[]};
},close(){}};
const mail=compile('lib/kysSupplierMail.ts',{
  '@/lib/db':{cosmoPool:Promise.resolve(pool)},'@/lib/mysqlCompat':{hasMysqlConfig:()=>true},
  '@/lib/kysPurchaseWorkflow':{ensureKysPurchaseSchema:async()=>{}},
  '@/lib/settings':{getAllSettings:async()=>({MAIL_HOST:'fixture.invalid',MAIL_USER:'fixture',MAIL_PASS:'fixture'})},
  '@/lib/chromiumPdf':{renderHtmlToPdf:async html=>{assert(html.includes('Türkçe'));return Buffer.from('%PDF-fixture');}},
  '@/lib/kysRequestCompany':{kysRequestCompany:()=>null},
  '@/lib/kysStore':{getKysRequestDetail:(...args)=>store.getKysRequestDetail(...args)},
  '@/lib/kysSupplierMailPolicy':policy,nodemailer:{createTransport:()=>smtp},
});
const store=compile('lib/kysStore.ts',{
  '@/lib/db':{cosmoPool:Promise.resolve(pool)},'@/lib/mysqlCompat':{hasMysqlConfig:()=>true},
  '@/lib/kysRequestNumbers':{ensureKysRequestNumbers:async()=>{}},'@/lib/kysRequestRules':compile('lib/kysRequestRules.ts'),
  '@/lib/faturaSchema':{},'@/lib/kysProduct':{},'@/lib/kysStockSources':{},'@/lib/kysSupplierMail':mail,
});
async function approve(ids){return store.updateKysRequestStatus(1,{durum:'Onaylandı',userId:'fixture',userName:'Onaylayan Örnek',tedarikciIds:ids});}
async function reset(){root.Durum='Onay Bekliyor';root.MailOnayID=null;jobs=[];mode='ok';verifyFailure=false;sent.length=0;}
async function run(){
  assert.deepEqual(policy.supplierEmails('A@EXAMPLE.COM; b@example.com\na@example.com'),['a@example.com','b@example.com']);
  assert.throws(()=>policy.supplierEmails('ok@example.com\r\nBcc: thief@example.com'));
  assert.equal((await approve()).mailQueued,false);assert.equal(root.Durum,'Onaylandı');assert.equal(jobs.length,0);assert.equal(sent.length,0);
  await assert.rejects(mail.prepareSupplierMail(1,[]));assert.equal(root.Durum,'Onaylandı');assert.equal(jobs.length,0);
  await assert.rejects(mail.prepareSupplierMail(1,[1,3]));assert.equal(jobs.length,0);
  await mail.prepareSupplierMail(1,[1,1,2]);assert.equal(jobs.length,2);assert.equal(sent.length,0);
  await mail.prepareSupplierMail(1,[1,2],[],false,jobs[0].OnayID);assert.equal(jobs.length,2);
  assert.equal(JSON.parse(jobs[0].FormJson).onaylayanAd,'Onaylayan Örnek');
  const snapshot=jobs[0].FormJson;suppliers[0].Email='changed@example.com';
  await Promise.all([mail.sendQueuedSupplierMail(1),mail.sendQueuedSupplierMail(1)]);
  assert.equal(sent.length,2);assert(jobs.every(job=>job.Durum==='Gönderildi'));assert.equal(root.Durum,'İşleme Alındı');
  const firstSupplierMail=sent.find(mail=>mail.to.includes('satis@one.example'));
  assert.deepEqual(firstSupplierMail.to,['satis@one.example','teklif@one.example']);
  assert.deepEqual(firstSupplierMail.cc,['oguzhan@uniquealphabet.com','selin@uniquealphabet.com']);
  assert.equal(firstSupplierMail.from.address,'purchasing@uniquealphabet.com');
  assert(firstSupplierMail.html.includes('Tahoma'));assert(firstSupplierMail.html.includes('Oğuzhan EKER'));
  assert(firstSupplierMail.text.startsWith('Sayın Yetkili,'));assert(firstSupplierMail.attachments.some(a=>a.cid==='purchasing-signature'));
  assert(!firstSupplierMail.to.includes('info@two.example'));assert.equal(firstSupplierMail.attachments[0].contentType,'application/pdf');
  await mail.sendQueuedSupplierMail(1,true);assert.equal(sent.length,2);
  await assert.rejects(approve([1]));assert.equal(jobs.length,2);assert.equal(jobs[0].FormJson,snapshot);
  await assert.rejects(mail.prepareSupplierMail(1,[2]));
  await mail.prepareSupplierMail(1,[2],[],true);await mail.sendQueuedSupplierMail(1);assert.equal(sent.length,3);assert.equal(jobs.length,3);
  await reset();await approve();await mail.prepareSupplierMail(1,[],['new@manual.example']);assert.equal(jobs[0].TedarikciID,-1);await mail.sendQueuedSupplierMail(1);assert.deepEqual(sent[0].to,['new@manual.example']);
  await reset();await approve();await mail.prepareSupplierMail(1,[2]);jobs[0].Durum='Gönderiliyor';
  await assert.rejects(mail.prepareSupplierMail(1,[2],[],true));
  jobs[0].ZamanAsimi=1;await mail.prepareSupplierMail(1,[2],[],true);assert.equal(jobs.length,2);await mail.sendQueuedSupplierMail(1);assert.equal(sent.length,1);
  await reset();await approve();await mail.prepareSupplierMail(1,[2]);verifyFailure=true;
  assert.equal((await mail.sendQueuedSupplierMail(1)).hata,1);assert.equal(root.Durum,'Onaylandı');assert.equal(sent.length,0);
  verifyFailure=false;assert.equal((await mail.sendQueuedSupplierMail(1,true)).gonderildi,1);assert.equal(root.Durum,'İşleme Alındı');
  await reset();await approve();await mail.prepareSupplierMail(1,[2]);mode='timeout';
  assert.equal((await mail.sendQueuedSupplierMail(1)).belirsiz,1);assert.equal(root.Durum,'Onaylandı');await mail.sendQueuedSupplierMail(1,true);assert.equal(sent.length,1);
  await reset();suppliers[0].Email='one@example.com; two@example.com';await approve();await mail.prepareSupplierMail(1,[1]);mode='partial';
  assert.equal((await mail.sendQueuedSupplierMail(1)).belirsiz,1);assert.equal(root.Durum,'Onaylandı');await mail.sendQueuedSupplierMail(1,true);assert.equal(sent.length,1);
  await reset();await approve();await mail.prepareSupplierMail(1,[2]);root.MailOnayID='new-approval';await mail.sendQueuedSupplierMail(1,true);assert.equal(sent.length,0);
  await reset();await assert.rejects(mail.prepareSupplierMail(1,[2]));root.TalepTuru='Sipariş';assert.equal((await approve()).mailQueued,false);await assert.rejects(mail.prepareSupplierMail(1,[2]));root.TalepTuru='Stok Malzeme';
  let portalUser={userId:'fixture',userName:'Fixture',can:()=>true,firmalar:['Unique']};
  let session={user:{userId:'fixture',name:'Fixture'}};
  let approvals=0,dispatches=0;
  const route=compile('app/api/kys/talepler/[id]/route.ts',{
    'next-auth':{getServerSession:async()=>session},'@/lib/auth':{authOptions:{}},
    '@/lib/portalYetki':{getPortalUser:async()=>portalUser},
    '@/lib/kysStore':{getKysRequestDetail:async()=>({talep:{seri:'Unique'}}),updateKysRequestStatus:async()=>{approvals++;return {mailQueued:true};}},
    '@/lib/kysPurchaseWorkflow':{},'@/lib/kysSupplierMail':{prepareSupplierMail:async()=>{},sendQueuedSupplierMail:async()=>{assert(approvals>0);dispatches++;return {gonderildi:1,hata:0,belirsiz:0};}},
  });
  const invoke=()=>route.PATCH(new Request('http://localhost/api/kys/talepler/1',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({durum:'Onaylandı',tedarikciIds:[2]})}),{params:Promise.resolve({id:'1'})});
  session=null;assert.equal((await invoke()).status,401);assert.equal(dispatches,0);
  session={user:{userId:'fixture',name:'Fixture'}};portalUser={...portalUser,firmalar:['Root']};assert.equal((await invoke()).status,403);assert.equal(dispatches,0);
  portalUser={...portalUser,firmalar:['Unique']};assert.equal((await invoke()).status,200);assert.equal(approvals,1);assert.equal(dispatches,0);
  const sendResponse=await route.PATCH(new Request('http://localhost/api/kys/talepler/1',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({islem:'tedarikci-mail-gonder',tedarikciIds:[2]})}),{params:Promise.resolve({id:'1'})});assert.equal(sendResponse.status,200);assert.equal(dispatches,1);
  console.log('PASS: multi-address validation, approval without sending, explicit send preparation rollback, supplier isolation, fixed From/CC, Tahoma signature and shared PDF attachment, frozen snapshot, concurrent dispatch deduplication, retry only safe failures, partial/uncertain SMTP protection, stale approval exclusion, explicit resend history, manual recipients, stale/recent sending guards. No real DB or email used.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
