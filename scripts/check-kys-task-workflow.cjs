// Isolated store contract checks. No network, credentials, or real database access.
const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');

function compile(file, overrides = {}) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => overrides[name] || require(name), module, module.exports);
  return module.exports;
}
const rows = []; const logs = []; const reads = []; let sequence=0;
const result=(recordset=[],affected=0)=>({recordset,rowsAffected:[affected]});
function request(){
  const args={};
  return {input(key,value){args[key]=value;return this;},async query(sql){
    if(/^(CREATE|ALTER|INSERT IGNORE INTO KysIletisimKatilimci)/.test(sql))return result();
    if(sql.startsWith('SELECT * FROM KysIletisim WHERE ID='))return result(rows.filter(row=>row.ID===args.ID&&row.Tur==='Görev'));
    if(sql.startsWith("SELECT * FROM KysIletisim WHERE Tur='Görev'"))return result(rows.filter(row=>row.Tur==='Görev'&&row.AliciID===args.UserID&&row.Durum!=='Tamamlandı'));
    if(sql.startsWith('UPDATE KysIletisim SET Durum=')){
      const row=rows.find(row=>row.ID===args.ID&&row.Durum===args.Onceki);if(!row)return result();row.Durum=args.Durum;return result([],1);
    }
    if(sql.startsWith('INSERT INTO KysIletisimGorevLog')){logs.push({GorevID:args.ID,Durum:args.Durum||'Atandı',KullaniciAd:args.UserName,CreatedAt:new Date().toISOString()});return result([],1);}
    if(sql.startsWith('INSERT IGNORE INTO KysIletisimOkuma')){if(!reads.some(row=>row.IcerikID===args.ID&&row.KullaniciID===args.UserID))reads.push({ID:reads.length+1,IcerikID:args.ID,KullaniciID:args.UserID});return result([],1);}
    if(sql.startsWith('INSERT INTO KysIletisim ')||sql.startsWith('INSERT IGNORE INTO KysIletisim ')){
      if(args.Key&&rows.some(row=>row.BildirimAnahtari===args.Key))return result();
      const reminder=sql.includes("VALUES ('Termin Hatırlatma'");const comment=sql.includes("VALUES ('Görev Yorumu'");
      const row={ID:++sequence,Tur:reminder?'Termin Hatırlatma':comment?'Görev Yorumu':args.Tur,Baslik:args.Baslik,Icerik:args.Icerik,OlusturanID:args.OlusturanID||args.UserID,OlusturanAd:args.OlusturanAd||args.UserName,AliciID:reminder?args.UserID:args.AliciID,AliciAd:args.AliciAd,Durum:reminder||comment?'Aktif':'Atandı',KonusmaID:reminder||comment?args.ID:null,TerminTarihi:args.Termin,BitisTarihi:args.Bitis,BaslangicTarihi:args.Baslangic,BildirimAnahtari:args.Key,CreatedAt:new Date().toISOString()};rows.push(row);return result([{ID:row.ID}],1);
    }
    if(sql.startsWith('SELECT i.*,CASE'))return result(rows.filter(row=>row.OlusturanID===args.UserID||row.AliciID===args.UserID).map(row=>({...row,Okundu:reads.some(read=>read.IcerikID===row.ID&&read.KullaniciID===args.UserID)?1:0})));
    if(sql.startsWith('SELECT i.* FROM KysIletisim i'))return result(rows.filter(row=>{
      const task=rows.find(task=>task.ID===row.KonusmaID);return task&&row.AliciID===args.UserID&&!reads.some(read=>read.IcerikID===row.ID&&read.KullaniciID===args.UserID)&&(row.Tur==='Görev Yorumu'||row.Tur==='Termin Hatırlatma'&&task.Durum!=='Tamamlandı'&&task.AliciID===args.UserID&&(task.BitisTarihi||task.TerminTarihi)===row.TerminTarihi);
    }));
    if(sql.startsWith('SELECT IcerikID'))return result(reads);
    if(sql.startsWith('SELECT GorevID'))return result(logs);
    if(sql.startsWith('SELECT KonusmaID'))return result();
    if(sql.startsWith('SELECT TOP 1 Tur,'))return result(rows.filter(row=>row.ID===args.ID));
    if(sql.startsWith('SELECT ID FROM KysIletisim WHERE OlusturanID'))return result(rows.filter(row=>row.OlusturanID===args.UserID||row.OlusturanID===args.Assignee));
    if(sql.startsWith('DELETE'))return result();
    throw new Error(`Unhandled test query: ${sql}`);
  }};
}
const pool={request,async transaction(){return {request,async begin(){},async commit(){},async rollback(){}};}};
const store = compile('lib/kysIletisimStore.ts', { '@/lib/kysMessageReply': compile('lib/kysMessageReply.ts'), '@/lib/db': { cosmoPool: Promise.resolve(pool) }, '@/lib/mysqlCompat': {hasMysqlConfig:()=>true} });
const marker = `__task_check_${Date.now()}`;
const owner = { userId: `${marker}_owner`, userName: 'Görev kontrolü' };
const assignee = { userId: `${marker}_assignee`, userName: 'Alıcı kontrolü' };
const outsider = { userId: `${marker}_other`, userName: 'Yetkisiz kontrol' };
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
async function run() {
  try {
    const { id } = await store.createKysIletisim({ tur: 'Görev', baslik: marker, icerik: 'Geçici entegrasyon kontrolü', aliciId: assignee.userId, aliciAd: assignee.userName, baslangicTarihi: today, bitisTarihi: today, kategori: 'Rutin' }, owner);
    await assert.rejects(store.updateKysGorev(id, 'Kabul Edildi', owner));
    await assert.rejects(store.updateKysGorev(id, 'Başladı', assignee));
    await store.updateKysGorev(id, 'Kabul Edildi', assignee);
    await store.updateKysGorev(id, 'Kabul Edildi', assignee);
    let task = (await store.listKysIletisim(owner)).gorevler.find(task => task.id === id);
    assert.equal(task.durum, 'Kabul Edildi');
    assert.equal(task.akış.filter(log => log.durum === 'Kabul Edildi').length, 1);
    await assert.rejects(store.commentKysGorev(id, 'Yetkisiz', outsider));
    await assert.rejects(store.commentKysGorev(id, ' ', assignee));
    await store.commentKysGorev(id, 'Alıcının yorumu', assignee);
    task = (await store.listKysIletisim(owner)).gorevler.find(task => task.id === id);
    assert.equal(task.yorumlar[0].icerik, 'Alıcının yorumu');
    assert((await store.getKysBildirimler(owner)).items.some(item => item.etiket === 'Görev Yorumu' && item.gorevId === id));
    let notifications = await store.getKysBildirimler(assignee);
    const reminder = notifications.items.find(item => item.etiket === 'Termin Hatırlatma' && item.gorevId === id);
    assert(reminder);
    assert.equal((await store.getKysBildirimler(assignee)).items.filter(item => item.etiket === 'Termin Hatırlatma').length, 1);
    await store.markKysIletisimRead(reminder.id, assignee);
    assert(!(await store.getKysBildirimler(assignee)).items.some(item => item.etiket === 'Termin Hatırlatma'));
    await store.updateKysGorev(id, 'Başladı', assignee);
    await store.updateKysGorev(id, 'Tamamlandı', owner);
    assert(!(await store.getKysBildirimler(assignee)).items.some(item => item.etiket === 'Termin Hatırlatma'));
    await assert.rejects(store.updateKysGorev(id, 'Kabul Edildi', assignee));
    assert.equal((await store.listKysIletisim(outsider)).gorevler.length,0);
    for(const [offset,label] of [[-1,'Gecikti:'],[1,'Yarın:'],[2,null]]){
      const due=new Date(new Date(`${today}T12:00:00+03:00`).getTime()+offset*86400000).toLocaleDateString('sv-SE',{timeZone:'Europe/Istanbul'});
      const fixture=await store.createKysIletisim({tur:'Görev',baslik:marker,icerik:'Termin sınırı',aliciId:assignee.userId,aliciAd:assignee.userName,baslangicTarihi:due,bitisTarihi:due,kategori:'Rutin'},owner);
      const notification=(await store.getKysBildirimler(assignee)).items.find(item=>item.etiket==='Termin Hatırlatma'&&item.gorevId===fixture.id);
      if(label)assert(notification?.baslik.startsWith(label));else assert.equal(notification,undefined);
    }
    const {messageReplyStatus,pendingMessageNotifications}=compile('lib/kysMessageReply.ts');
    const incoming=[{id:91,olusturanId:'sender',okundu:true}];
    assert.equal(messageReplyStatus([], 'recipient'),null);
    assert.equal(messageReplyStatus(incoming,'recipient'),'Yanıtınız bekleniyor');
    assert.equal(messageReplyStatus(incoming,'sender'),'Yanıt bekleniyor');
    assert.equal(pendingMessageNotifications([{id:90,messages:incoming}],'recipient').length,1);
    assert.equal(pendingMessageNotifications([{id:90,messages:incoming}],'sender').length,0);
    const replied=[...incoming,{id:92,olusturanId:'recipient',okundu:false}];
    assert.equal(pendingMessageNotifications([{id:90,messages:replied}],'recipient').length,0);
    assert.equal(pendingMessageNotifications([{id:90,messages:replied}],'sender')[0].konusmaId,90);
    assert.equal(pendingMessageNotifications([{id:90,messages:[...incoming,...incoming]}],'recipient').length,1);
    console.log('PASS: acceptance permissions/order/idempotency, comments/privacy, reminder boundaries/deduplication/read/completion; message read-without-reply, reply resolution, sender/recipient status, one alert per conversation.');
  } finally {
    const rows = (await pool.request().input('UserID', owner.userId).input('Assignee', assignee.userId).query('SELECT ID FROM KysIletisim WHERE OlusturanID=@UserID OR OlusturanID=@Assignee')).recordset;
    for (const row of rows) {
      await pool.request().input('ID', row.ID).query('DELETE FROM KysIletisimOkuma WHERE IcerikID=@ID');
      await pool.request().input('ID', row.ID).query('DELETE FROM KysIletisimGorevLog WHERE GorevID=@ID');
      await pool.request().input('ID', row.ID).query('DELETE FROM KysIletisim WHERE ID=@ID');
    }
    console.log('No real database was accessed.');
  }
}
run().then(() => process.exit(0), error => { console.error(error.message); process.exit(1); });
