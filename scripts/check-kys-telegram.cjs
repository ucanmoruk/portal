// Isolated Telegram scheduler tests. No real network or database access.
const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,mocks={}){
  const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const module={exports:{}};new Function('require','module','exports',source)(name=>mocks[name]||require(name),module,module.exports);return module.exports;
}
const rules=load('lib/kysTelegramRules.ts'),api=load('lib/kysTelegramApi.ts');
const mappings=[{UserID:'11',ChatID:'101',ChatLabel:'Alice',Enabled:1,DailyTasks:1,WeeklyTasks:1,Analyses:1,Quality:0},{UserID:'12',ChatID:'102',ChatLabel:'Bob',Enabled:1,DailyTasks:1,WeeklyTasks:1,Analyses:0,Quality:1}];
const users=[{ID:11,Ad:'Alice',Soyad:'Test',Durum:'Aktif',LaboratuvarBirimID:10},{ID:12,Ad:'Bob',Soyad:'Test',Durum:'Aktif',LaboratuvarBirimID:20}];
const permissions=new Map([['11',['laboratuvar.kys.iletisim']],['12',['laboratuvar.kys.iletisim']]]);
const tasks=[{ID:1,AliciID:'11',Baslik:'Alice today',Durum:'Atandı',BaslangicTarihi:'2026-11-02',BitisTarihi:'2026-11-02'},{ID:2,AliciID:'11',Baslik:'Alice Wednesday',Durum:'Başladı',BaslangicTarihi:'2026-11-04',BitisTarihi:'2026-11-04'},{ID:3,AliciID:'11',Baslik:'Next week',Durum:'Atandı',BaslangicTarihi:'2026-11-10',BitisTarihi:'2026-11-10'},{ID:4,AliciID:'11',Baslik:'Completed',Durum:'Tamamlandı',BaslangicTarihi:'2026-11-02',BitisTarihi:'2026-11-02'},{ID:5,AliciID:'12',Baslik:'Bob private task',Durum:'Atandı',BaslangicTarihi:'2026-11-02',BitisTarihi:'2026-11-02'}];
const reports=new Map();const sent=[];let mode='ok',calls=0;
const res=(recordset=[],affected=0)=>({recordset,rowsAffected:[affected]});
function request(){const args={};return {input(key,value){args[key]=value;return this;},async query(raw){
  const sql=raw.replace(/\s+/g,' ').trim();
  if(sql.startsWith('CREATE')||sql.startsWith('ALTER'))return res();
  if(sql.startsWith('SELECT * FROM KysTelegramRecipient'))return res(mappings);
  if(sql.startsWith('SELECT ID,Ad,Soyad,Durum'))return res(users.filter(user=>user.ID===Number(args.ID)&&user.Durum==='Aktif'));
  if(sql.startsWith('SELECT MenuKey'))return res((permissions.get(String(args.ID))||[]).map(MenuKey=>({MenuKey})));
  if(sql.startsWith('SELECT DigestKey,State'))return res([...reports.values()].filter(row=>row.UserID===args.ID&&(row.Period===args.Today||row.Period===args.Week)));
  if(sql.startsWith('SELECT ID,Baslik,Durum'))return res(tasks.filter(task=>task.AliciID===args.ID&&task.Durum!=='Tamamlandı'));
  if(sql.startsWith('INSERT IGNORE INTO KysTelegramDigest')){if(!reports.has(args.Key))reports.set(args.Key,{DigestKey:args.Key,UserID:args.User,ChatID:args.Chat,Kind:args.Kind,Period:args.Period,PayloadJson:args.Payload,NextPart:0,State:'pending',RetryAt:null});return res([],1);}
  if(sql.startsWith("UPDATE KysTelegramDigest SET State='sending'")){const row=reports.get(args.Key);if(!['pending','retry'].includes(row.State)||row.RetryAt&&row.RetryAt>new Date())return res();row.State='sending';return res([],1);}
  if(sql.startsWith('SELECT PayloadJson,NextPart'))return res([reports.get(args.Key)]);
  if(sql.startsWith('UPDATE KysTelegramDigest SET NextPart')){Object.assign(reports.get(args.Key),{NextPart:args.Next,MessageID:args.Message});return res([],1);}
  if(sql.startsWith("UPDATE KysTelegramDigest SET State='cancelled'")){reports.get(args.Key).State='cancelled';return res([],1);}
  if(sql.startsWith('UPDATE KysTelegramDigest SET State=@State')){Object.assign(reports.get(args.Key),{State:args.State,RetryAt:args.Retry,LastError:args.Error});return res([],1);}
  throw new Error(`Unhandled fixture query: ${sql}`);
}};}
const pool={request};
const store=load('lib/kysTelegramStore.ts',{
  '@/lib/db':{cosmoPool:Promise.resolve(pool)},'@/lib/mysqlCompat':{hasMysqlConfig:()=>true},'@/lib/userStore':{getUserPool:async()=>pool},'@/lib/permissionStore':{getPermissionPool:async()=>pool},
  '@/lib/labResultAccess':{getLabScope:async session=>({departmentId:session.user.userId==='11'?10:20,admin:false})},
  '@/lib/labAkisStore':{listLabFlow:async scope=>({analizler:[{id:1,ad:`Dept ${scope.departmentId} today`,raporNo:'261001',numune:'Sample',termin:'2026-11-02',tamamlandi:false},{id:2,ad:'Future analysis',raporNo:'261002',numune:'Sample',termin:'2026-11-03',tamamlandi:false},{id:3,ad:'Completed analysis',raporNo:'261003',numune:'Sample',termin:'2026-11-02',tamamlandi:true}],kalite:[{id:1,baslik:'Today quality',aciklama:'Calibration',tarih:'2026-11-02',tamamlandi:false},{id:2,baslik:'Future quality',aciklama:'',tarih:'2026-11-03',tamamlandi:false}]})},
  '@/lib/kysIletisimStore':{ensureKysIletisimSchema:async()=>{}},'@/lib/loadDotenv':{loadDotenvOnce(){}},'@/lib/kysTelegramRules':rules,
  '@/lib/kysTelegramApi':{TelegramApiError:api.TelegramApiError,verifyTelegramChat:async()=>'',telegramCall:async(method,body)=>{
    calls++;if(mode==='429'){mode='ok';throw new api.TelegramApiError('Rate limit',true,60);}if(mode==='network')throw new api.TelegramApiError('Timeout',false);
    sent.push(body);return {message_id:sent.length};
  }},
});
const monday=new Date('2026-11-02T06:00:00Z');
function reset(){reports.clear();sent.length=0;calls=0;mode='ok';}
async function run(){
  assert.equal(rules.istanbulClock(new Date('2026-11-02T05:59:00Z')).hour,8);
  assert.equal(rules.istanbulClock(monday).monday,'2026-11-02');
  assert.equal(rules.istanbulClock(new Date('2027-01-01T06:00:00Z')).monday,'2026-12-28');
  const overdueTasks=[{id:1,title:'Late',status:'Atandı',start:'2026-11-01',end:'2026-11-01'},{id:2,title:'Done',status:'Tamamlandı',start:'2026-11-01',end:'2026-11-01'},{id:3,title:'Due today',status:'Atandı',start:'2026-11-01',end:'2026-11-02'},{id:4,title:'Undated',status:'Atandı',start:'',end:''}];
  const overdue=rules.digestLines('overdue','Alice',rules.istanbulClock(monday),overdueTasks,[],[]).join('\n');
  assert(overdue.includes('Late')&&!overdue.includes('Done')&&!overdue.includes('Due today')&&!overdue.includes('Undated'));
  const huge=rules.telegramParts(['😀'.repeat(10000)],'https://lab.uniqueanalyse.com');assert(huge.length>1&&huge.every(text=>text.length<=4096));
  process.env.KYS_TELEGRAM_ENABLED='false';process.env.TELEGRAM_BOT_TOKEN='123:fixture';await store.runTelegramDigests(monday);assert.equal(calls,0);
  process.env.KYS_TELEGRAM_ENABLED='true';await store.runTelegramDigests(new Date('2026-11-02T05:59:00Z'));assert.equal(calls,0);
  await Promise.all([store.runTelegramDigests(monday),store.runTelegramDigests(monday)]);assert.equal(sent.length,6);
  const alice=sent.filter(item=>item.chat_id==='101'),bob=sent.filter(item=>item.chat_id==='102');
  assert.equal(alice.length,3);assert.equal(bob.length,3);
  assert(alice.every(item=>!item.text.includes('Bob private task')&&!item.text.includes('Dept 20')));
  assert(alice.find(item=>item.text.includes('Günlük işleriniz')).text.includes('Alice today'));
  assert(!alice.find(item=>item.text.includes('Günlük işleriniz')).text.includes('Wednesday'));
  assert(alice.find(item=>item.text.includes('Haftalık işleriniz')).text.includes('Wednesday'));
  assert(alice.every(item=>!item.text.includes('Next week')&&!item.text.includes('Completed')));
  assert(alice.find(item=>item.text.includes('Bugün çıkacak')).text.includes('Dept 10 today'));
  assert(bob.find(item=>item.text.includes('Kalite işleri')).text.includes('Today quality'));
  await store.runTelegramDigests(monday);assert.equal(sent.length,6);
  await store.runTelegramDigests(new Date('2026-11-03T06:00:00Z'));assert.equal(sent.filter(item=>item.text.includes('Haftalık işleriniz')).length,2);
  reset();mappings[0].OverdueTasks=1;tasks.push({ID:99,AliciID:'11',Baslik:'Overdue reminder',Durum:'Atandı',BaslangicTarihi:'2026-11-01',BitisTarihi:'2026-11-01'});
  await store.runTelegramDigests(monday);await store.runTelegramDigests(monday);
  assert.equal(sent.filter(item=>item.text.includes('Geciken işleriniz')).length,1);
  await store.runTelegramDigests(new Date('2026-11-03T06:00:00Z'));
  assert.equal(sent.filter(item=>item.text.includes('Geciken işleriniz')).length,2);
  tasks[tasks.length-1].Durum='Tamamlandı';tasks[0].Durum='Tamamlandı';
  await store.runTelegramDigests(new Date('2026-11-04T06:00:00Z'));
  assert.equal(sent.filter(item=>item.text.includes('Geciken işleriniz')).length,2);
  tasks.pop();tasks[0].Durum='Atandı';mappings[0].OverdueTasks=0;
  reset();mode='network';await store.runTelegramDigests(monday);const firstCalls=calls;assert([...reports.values()].some(row=>row.State==='uncertain'));await store.runTelegramDigests(monday);assert.equal(calls,firstCalls);
  reset();mode='429';await store.runTelegramDigests(monday);const retry=[...reports.values()].find(row=>row.State==='retry');assert(retry);const frozen=retry.PayloadJson;
  retry.RetryAt=new Date(0);tasks[0].Baslik='Changed after snapshot';await store.runTelegramDigests(monday);assert.equal(retry.State,'sent');assert.equal(retry.PayloadJson,frozen);tasks[0].Baslik='Alice today';
  reset();permissions.set('11',[]);await store.runTelegramDigests(monday);assert(sent.every(item=>item.chat_id!=='101'));permissions.set('11',['laboratuvar.kys.iletisim']);
  const previous=process.env.KYS_TELEGRAM_CRON_SECRET;process.env.KYS_TELEGRAM_CRON_SECRET='a'.repeat(40);
  const route=load('app/api/cron/kys-telegram/route.ts',{'@/lib/loadDotenv':{loadDotenvOnce(){}},'@/lib/kysTelegramStore':{runTelegramDigests:async()=>({enabled:false,results:[]})}});
  assert.equal((await route.GET(new Request('https://example.com',{headers:{Authorization:'Bearer wrong'}}))).status,401);
  assert.equal((await route.GET(new Request('https://example.com',{headers:{Authorization:`Bearer ${process.env.KYS_TELEGRAM_CRON_SECRET}`}}))).status,200);
  if(previous===undefined)delete process.env.KYS_TELEGRAM_CRON_SECRET;else process.env.KYS_TELEGRAM_CRON_SECRET=previous;
  const originalFetch=global.fetch;
  try{
    global.fetch=async()=>new Response(JSON.stringify({ok:true,result:{id:101,type:'group'}}),{headers:{'Content-Type':'application/json'}});
    await assert.rejects(api.verifyTelegramChat('101'));
    await assert.rejects(api.verifyTelegramChat('-100'));
    global.fetch=async()=>new Response(JSON.stringify({ok:true,result:{id:101,type:'private',first_name:'Alice',username:'alice_test'}}),{headers:{'Content-Type':'application/json'}});
    assert.equal(await api.verifyTelegramChat('101'),'Alice @alice_test');
    global.fetch=async()=>{throw new Error(`Do not expose ${process.env.TELEGRAM_BOT_TOKEN}`);};
    await assert.rejects(api.telegramCall('sendMessage',{}),error=>!error.message.includes(process.env.TELEGRAM_BOT_TOKEN));
  }finally{global.fetch=originalFetch;}
  const proxy=load('proxy.ts',{'next-auth/jwt':{getToken:async()=>null},'next/server':{NextResponse:{next:()=>new Response(null,{status:204}),json:(body,options)=>Response.json(body,options)}}}).default;
  assert.equal((await proxy({nextUrl:{pathname:'/api/cron/kys-telegram',search:''}})).status,204);
  assert.equal((await proxy({nextUrl:{pathname:'/api/cron/kys-telegram-other',search:''}})).status,401);
  console.log('PASS: Istanbul daily/weekly boundaries, personal ownership, lab scope, due/completed filters, recipient subscriptions, length limits, parallel cron deduplication, weekly once, frozen retry, uncertain protection, revoked permissions and cron auth. No real Telegram or DB used.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
