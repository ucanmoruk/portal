// Fast task assignment parser and transactional flow; no real DB or Telegram.
const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,mocks={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(n=>mocks[n]||require(n),m,m.exports);return m.exports;}
async function run(){
const rules=load('lib/kysTelegramRules.ts'),parser=load('lib/kysTelegramTaskText.ts',{'@/lib/kysTelegramRules':rules}),now=new Date('2026-10-31T10:00:00Z');
for(const [phrase,date] of [['bugün','2026-10-31'],['yarın','2026-11-01'],['bir hafta sonra','2026-11-07'],['1 hafta sonra','2026-11-07'],['BİR HAFTA SONRA','2026-11-07'],['05.11.2026','2026-11-05'],['5/11/2026','2026-11-05'],['2026-11-05','2026-11-05']])assert.equal(parser.parseTelegramTaskText('Selin '+phrase+' raporu hazırla',now).date,date);
assert.equal(parser.parseTelegramTaskText('Selin yarın kontrol et',new Date('2026-12-31T22:00:00Z')).date,'2027-01-02');
assert.equal(parser.parseTelegramTaskText('/gorev@unique_bot Oğuzhan Eker yarın teklif kontrolü',now).person,'Oğuzhan Eker');
for(const text of ['Selin 31.11.2026 kontrol et','Selin 30.10.2026 kontrol et','Selin yarın','Selin rapor hazırla'])assert.throws(()=>parser.parseTelegramTaskText(text,now));
const people=[{id:'11',name:'Selin Eker'},{id:'12',name:'Selin Yılmaz'},{id:'13',name:'Oğuzhan Eker'}];
assert.equal(parser.matchTelegramPeople('Selin',people).length,2);assert.equal(parser.matchTelegramPeople('Oguzhan Eker',people)[0].id,'13');assert.equal(parser.matchTelegramPeople('Sel',people).length,0);
const drafts=new Map(),tasks=[],logs=[],sent=[];let revoked='',failLog=false;const lockQueries=[];
function request(){const a={};return {input(k,v){a[k]=v;return this},async query(sql){
 if(sql.startsWith('CREATE'))return {recordset:[]};
 if(sql.startsWith('SELECT ID,Ad,Soyad'))return {recordset:people.map(p=>({ID:Number(p.id),Ad:p.name.split(' ')[0],Soyad:p.name.split(' ').slice(1).join(' ')}))};
 if(sql.startsWith('INSERT IGNORE INTO KysTelegramTaskDraft')){if(!drafts.has(a.Key))drafts.set(a.Key,{DraftKey:a.Key,ChatID:a.Chat,ActorID:a.Actor,PayloadJson:a.Payload,ExpiresAt:a.Expires,State:'pending'});return {recordset:[]}};
 if(sql.startsWith('SELECT * FROM KysTelegramTaskDraft')){if(sql.includes('FOR UPDATE'))lockQueries.push(sql);const d=drafts.get(a.Key);return {recordset:d&&d.ChatID===a.Chat&&d.ActorID===a.Actor?[d]:[]}};
 if(sql.startsWith('INSERT INTO KysIletisim (')){tasks.push({...a,ID:tasks.length+1});return {recordset:[{ID:tasks.length}]}};
 if(sql.startsWith('INSERT INTO KysIletisimGorevLog')){if(failLog)throw Error('DB log failed');logs.push(a);return {recordset:[]}};
 if(sql.startsWith('UPDATE KysTelegramTaskDraft')){Object.assign(drafts.get(a.Key),sql.includes("State='created'")?{State:'created',TaskID:a.Task}:{State:'cancelled'});return {recordset:[]}};
 throw Error('Unhandled query '+sql);
}}}
const pool={request,async transaction(){const ds=structuredClone([...drafts]),ts=structuredClone(tasks),ls=structuredClone(logs);return {request,begin:async()=>{},commit:async()=>{},rollback:async()=>{drafts.clear();for(const [k,v] of ds)drafts.set(k,v);tasks.splice(0,tasks.length,...ts);logs.splice(0,logs.length,...ls)}}}};
const store=load('lib/kysTelegramTaskAssign.ts',{'@/lib/db':{cosmoPool:Promise.resolve(pool)},'@/lib/mysqlCompat':{hasMysqlConfig:()=>true},'@/lib/userStore':{getUserPool:async()=>pool},'@/lib/kysIletisimStore':{ensureKysIletisimSchema:async()=>{}},'@/lib/kysTelegramStore':{telegramRecipients:async()=>[{chatId:'101',userId:'2',enabled:true},{chatId:'202',userId:'3',enabled:true}],telegramEligibility:async id=>id===revoked?null:{name:id==='2'?'Oğuzhan Eker':people.find(p=>p.id===id)?.name||'Other'}},'@/lib/kysTelegramApi':{telegramCall:async(m,b)=>{sent.push({m,b})}},'@/lib/kysTelegramTaskText':parser,'@/lib/kysTelegramRules':rules});
await store.receiveTelegramTaskText('101',1,'Selin yarın raporu hazırla',now);assert.equal(tasks.length,0);assert(sent.at(-1).b.text.includes('birden fazla'));
const pick=sent.at(-1).b.reply_markup.inline_keyboard[0][0].callback_data;assert(Buffer.byteLength(pick)<=64);await store.handleTelegramAssignment('101',pick,now);
const confirm=sent.at(-1).b.reply_markup.inline_keyboard[0][0].callback_data;assert(sent.at(-1).b.text.includes('01.11.2026'));
await assert.rejects(store.handleTelegramAssignment('202',confirm,now),/size ait/);assert.equal(tasks.length,0);
revoked='11';await assert.rejects(store.handleTelegramAssignment('101',confirm,now),/güncel KYS/);revoked='';
failLog=true;await assert.rejects(store.handleTelegramAssignment('101',confirm,now),/DB log/);assert.equal(tasks.length,0);failLog=false;
const created=await store.handleTelegramAssignment('101',confirm,now);assert.equal(created.taskId,1);assert.equal(tasks[0].Target,'11');assert.equal(tasks[0].Actor,'2');assert.equal(tasks[0].Date,'2026-11-01');assert.equal(logs.length,1);assert(logs[0].Name.includes('Telegram'));assert(lockQueries.length>0);
await store.handleTelegramAssignment('101',confirm,now);assert.equal(tasks.length,1);assert.equal(logs.length,1);
await store.receiveTelegramTaskText('101',2,'Oğuzhan bugün kargoyu sor',now);const cancel=sent.at(-1).b.reply_markup.inline_keyboard[1][0].callback_data;await store.handleTelegramAssignment('101',cancel,now);await assert.rejects(store.handleTelegramAssignment('101',cancel.replace('cancel:','new:')+':13',now),/iptal/);
await store.receiveTelegramTaskText('101',3,'Oğuzhan yarın teklifi gönder',now);const expired=sent.at(-1).b.reply_markup.inline_keyboard[0][0].callback_data;await assert.rejects(store.handleTelegramAssignment('101',expired,new Date(now.getTime()+31*60000)),/süresi/);assert.equal(tasks.length,1);
await store.receiveTelegramTaskText('303',4,'Selin yarın rapor',now);assert(sent.at(-1).b.text.includes('eşleştirilmiş'));assert.equal(tasks.length,1);
console.log('PASS: Turkish relative/absolute dates, Istanbul rollover, name ambiguity, preview-before-create, sender/target access, draft ownership/expiry/cancel, transaction rollback and duplicate confirmation. No real Telegram or DB used.');
}
run().catch(e=>{console.error(e);process.exitCode=1});
