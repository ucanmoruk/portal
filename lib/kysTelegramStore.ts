import { createHash } from "node:crypto";
import type { Session } from "next-auth";
import { cosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";
import { getUserPool } from "@/lib/userStore";
import { getPermissionPool } from "@/lib/permissionStore";
import { getLabScope } from "@/lib/labResultAccess";
import { listLabFlow } from "@/lib/labAkisStore";
import { ensureKysIletisimSchema } from "@/lib/kysIletisimStore";
import { loadDotenvOnce } from "@/lib/loadDotenv";
import { telegramCall, TelegramApiError, verifyTelegramChat } from "@/lib/kysTelegramApi";
import { telegramInteractionEnabled } from "@/lib/kysTelegramConnection";
import { digestLines, istanbulClock, telegramParts, telegramTaskParts, TELEGRAM_KINDS, TELEGRAM_TITLES, type TelegramPart, type DigestTask, type TelegramKind, type TelegramRecipient } from "@/lib/kysTelegramRules";

let schema:Promise<void>|null=null;
type Row=Record<string,unknown>;
const hash=(text:string)=>createHash("sha256").update(text).digest("hex");
const day=(value:unknown)=>value instanceof Date?value.toISOString().slice(0,10):String(value||"").slice(0,10);
export function ensureTelegramSchema(){
  if(!schema)schema=(async()=>{
    const pool=await cosmoPool;const mysql=hasMysqlConfig();
    await pool.request().query(mysql?`CREATE TABLE IF NOT EXISTS KysTelegramRecipient (
      UserID VARCHAR(80) NOT NULL PRIMARY KEY, ChatID VARCHAR(32) NOT NULL UNIQUE, ChatLabel VARCHAR(220) NOT NULL,
      Enabled INT NOT NULL DEFAULT 0, DailyTasks INT NOT NULL DEFAULT 1, WeeklyTasks INT NOT NULL DEFAULT 1,
      Analyses INT NOT NULL DEFAULT 0, Quality INT NOT NULL DEFAULT 0, UpdatedBy VARCHAR(80) NULL,
      UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci`:`IF OBJECT_ID('KysTelegramRecipient','U') IS NULL CREATE TABLE KysTelegramRecipient (
      UserID NVARCHAR(80) NOT NULL PRIMARY KEY, ChatID NVARCHAR(32) NOT NULL UNIQUE, ChatLabel NVARCHAR(220) NOT NULL,
      Enabled INT NOT NULL DEFAULT 0, DailyTasks INT NOT NULL DEFAULT 1, WeeklyTasks INT NOT NULL DEFAULT 1,
      Analyses INT NOT NULL DEFAULT 0, Quality INT NOT NULL DEFAULT 0, UpdatedBy NVARCHAR(80) NULL,UpdatedAt DATETIME NOT NULL DEFAULT GETDATE())`);
    await pool.request().query(mysql?"ALTER TABLE KysTelegramRecipient ADD COLUMN IF NOT EXISTS OverdueTasks INT NOT NULL DEFAULT 0":"IF COL_LENGTH('KysTelegramRecipient','OverdueTasks') IS NULL ALTER TABLE KysTelegramRecipient ADD OverdueTasks INT NOT NULL DEFAULT 0");
    await pool.request().query(mysql?`CREATE TABLE IF NOT EXISTS KysTelegramDigest (
      DigestKey VARCHAR(64) NOT NULL PRIMARY KEY, UserID VARCHAR(80) NOT NULL, ChatID VARCHAR(32) NOT NULL,
      Kind VARCHAR(20) NOT NULL, Period VARCHAR(10) NOT NULL, PayloadJson LONGTEXT NOT NULL,
      NextPart INT NOT NULL DEFAULT 0, State VARCHAR(20) NOT NULL DEFAULT 'pending', LastError TEXT NULL,
      RetryAt DATETIME NULL, MessageID VARCHAR(40) NULL, UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci`:`IF OBJECT_ID('KysTelegramDigest','U') IS NULL CREATE TABLE KysTelegramDigest (
      DigestKey NVARCHAR(64) NOT NULL PRIMARY KEY, UserID NVARCHAR(80) NOT NULL, ChatID NVARCHAR(32) NOT NULL,
      Kind NVARCHAR(20) NOT NULL, Period NVARCHAR(10) NOT NULL, PayloadJson NVARCHAR(MAX) NOT NULL,
      NextPart INT NOT NULL DEFAULT 0, State NVARCHAR(20) NOT NULL DEFAULT 'pending', LastError NVARCHAR(MAX) NULL,
      RetryAt DATETIME NULL, MessageID NVARCHAR(40) NULL, UpdatedAt DATETIME NOT NULL DEFAULT GETDATE())`);
  })().catch(error=>{schema=null;throw error;});
  return schema;
}

export async function telegramEligibility(userId:string){
  const users=await getUserPool();
  const row=(await users.request().input("ID",Number(userId)).query("SELECT ID,Ad,Soyad,Durum,LaboratuvarBirimID FROM RootKullanici WHERE ID=@ID AND Durum='Aktif'")).recordset[0];
  if(!row)return null;
  const admin=userId==="2";
  const permissions=admin?[]:(await (await getPermissionPool()).request().input("ID",Number(userId)).query("SELECT MenuKey FROM PortalYetki WHERE KullaniciID=@ID")).recordset.map((key:{MenuKey:string})=>key.MenuKey);
  if(!admin&&!permissions.some((key:string)=>key==="laboratuvar.kys"||key.startsWith("laboratuvar.kys.")))return null;
  const name=[row.Ad,row.Soyad].filter(Boolean).join(" ");
  const session={user:{userId,name},expires:""} as Session;
  const scope=await getLabScope(session);
  if(scope.denied)return null;
  return {name,scope,revision:hash(JSON.stringify([row.LaboratuvarBirimID,permissions.sort(),admin]))};
}

export async function telegramRecipients(){
  await ensureTelegramSchema();
  return (await (await cosmoPool).request().query("SELECT * FROM KysTelegramRecipient ORDER BY UserID")).recordset.map((row:Row):TelegramRecipient=>({userId:String(row.UserID),name:"",chatId:String(row.ChatID),chatLabel:String(row.ChatLabel),enabled:Boolean(Number(row.Enabled)),daily:Boolean(Number(row.DailyTasks)),weekly:Boolean(Number(row.WeeklyTasks)),analyses:Boolean(Number(row.Analyses)),quality:Boolean(Number(row.Quality)),overdue:Boolean(Number(row.OverdueTasks))}));
}
export async function telegramSettings(){
  loadDotenvOnce();
  await ensureTelegramSchema();
  const users=(await (await getUserPool()).request().query("SELECT ID,Ad,Soyad FROM RootKullanici WHERE Durum='Aktif' ORDER BY Ad,ID")).recordset.map((row:Row)=>({id:String(row.ID),name:[row.Ad,row.Soyad].filter(Boolean).join(" ")}));
  const stale=hasMysqlConfig()?"TIMESTAMPDIFF(SECOND,UpdatedAt,CURRENT_TIMESTAMP)>600":"DATEDIFF(second,UpdatedAt,GETDATE())>600";
  const deliveryRows=(await (await cosmoPool).request().query(`SELECT TOP 30 UserID,Kind,Period,NextPart,UpdatedAt,
    CASE WHEN State='sending' AND ${stale} THEN 'uncertain' ELSE State END AS State,
    CASE WHEN State='sending' AND ${stale} THEN N'10 dakika içinde sonuç alınamadı; Telegram sohbetini kontrol edin.' ELSE LastError END AS LastError
    FROM KysTelegramDigest ORDER BY UpdatedAt DESC`)).recordset;
  return {users,recipients:await telegramRecipients(),deliveries:deliveryRows,enabled:process.env.KYS_TELEGRAM_ENABLED==="true",botConfigured:Boolean(process.env.TELEGRAM_BOT_TOKEN),botUsername:process.env.TELEGRAM_BOT_USERNAME||"",interactionEnabled:await telegramInteractionEnabled(),cronConfigured:(process.env.KYS_TELEGRAM_CRON_SECRET?.length||0)>=32,schedule:"Günlük 09.00 · Haftalık pazartesi 09.00 · Europe/Istanbul"};
}
export async function saveTelegramRecipient(input:Record<string,unknown>,actor:string){
  await ensureTelegramSchema();
  const userId=String(input.userId||"");
  if(!/^[1-9]\d*$/.test(userId)||!await telegramEligibility(userId))throw new Error("Aktif ve KYS erişimi bulunan bir kullanıcı seçin.");
  const chatId=String(input.chatId||"").trim();const chatLabel=await verifyTelegramChat(chatId);
  const pool=await cosmoPool;const tx=await pool.transaction();await tx.begin();
  try{
    await tx.request().input("ID",userId).query("DELETE FROM KysTelegramRecipient WHERE UserID=@ID");
    await tx.request().input("ID",userId).input("Chat",chatId).input("Label",chatLabel).input("Enabled",input.enabled===true?1:0).input("Daily",input.daily===true?1:0).input("Weekly",input.weekly===true?1:0).input("Analyses",input.analyses===true?1:0).input("Quality",input.quality===true?1:0).input("Overdue",input.overdue===true?1:0).input("Actor",actor)
      .query("INSERT INTO KysTelegramRecipient (UserID,ChatID,ChatLabel,Enabled,DailyTasks,WeeklyTasks,Analyses,Quality,OverdueTasks,UpdatedBy) VALUES (@ID,@Chat,@Label,@Enabled,@Daily,@Weekly,@Analyses,@Quality,@Overdue,@Actor)");
    await tx.commit();
  }catch{await tx.rollback();throw new Error("Telegram alıcısı kaydedilemedi. Bu sohbet başka bir kullanıcıya bağlı olabilir.");}
}
export async function removeTelegramRecipient(userId:string){await ensureTelegramSchema();await (await cosmoPool).request().input("ID",userId).query("DELETE FROM KysTelegramRecipient WHERE UserID=@ID");}

async function deliver(recipient:TelegramRecipient,kind:TelegramKind,period:string,revision:string,parts:Array<string|TelegramPart>,requestId?:string){
  const pool=await cosmoPool;
  const key=hash(JSON.stringify([recipient.userId,recipient.chatId,kind,period,revision,...(requestId?[requestId]:[])]));
  const insert="INSERT INTO KysTelegramDigest (DigestKey,UserID,ChatID,Kind,Period,PayloadJson) VALUES (@Key,@User,@Chat,@Kind,@Period,@Payload)";
  try{
    await pool.request().input("Key",key).input("User",recipient.userId).input("Chat",recipient.chatId).input("Kind",requestId?`test_${kind}`:kind).input("Period",period).input("Payload",JSON.stringify(parts)).query(hasMysqlConfig()?insert.replace("INSERT INTO","INSERT IGNORE INTO"):`IF NOT EXISTS (SELECT 1 FROM KysTelegramDigest WHERE DigestKey=@Key) ${insert}`);
  }catch(error){if(![2601,2627].includes(Number((error as {number?:number}).number)))throw error;}
  const claimed=await pool.request().input("Key",key).query("UPDATE KysTelegramDigest SET State='sending',LastError=NULL,UpdatedAt=GETDATE() WHERE DigestKey=@Key AND State IN ('pending','retry') AND (RetryAt IS NULL OR RetryAt<=GETDATE())");
  if(!claimed.rowsAffected[0])return "skipped";
  try{
  const row=(await pool.request().input("Key",key).query("SELECT PayloadJson,NextPart FROM KysTelegramDigest WHERE DigestKey=@Key")).recordset[0];
  const texts=JSON.parse(row.PayloadJson) as Array<string|TelegramPart>;
  for(let index=Number(row.NextPart);index<texts.length;index++){
    const current=(await telegramRecipients()).find(item=>item.userId===recipient.userId);
    const access=await telegramEligibility(recipient.userId);
    if(!current?.enabled||current.chatId!==recipient.chatId||!current[kind]||access?.revision!==revision){
      await pool.request().input("Key",key).query("UPDATE KysTelegramDigest SET State='cancelled',UpdatedAt=GETDATE() WHERE DigestKey=@Key");return "cancelled";
    }
    try{
      const part=texts[index];
      const message=await telegramCall<{message_id:number}>("sendMessage",{chat_id:recipient.chatId,...(typeof part==="string"?{text:part}:part),link_preview_options:{is_disabled:true}});
      await pool.request().input("Key",key).input("Next",index+1).input("Message",String(message.message_id)).query("UPDATE KysTelegramDigest SET NextPart=@Next,MessageID=@Message,UpdatedAt=GETDATE() WHERE DigestKey=@Key");
    }catch(error){
      const api=error instanceof TelegramApiError?error:null;
      const state=api?.definitive?(api.retryAfter?"retry":"failed"):"uncertain";
      const retry=api?.retryAfter?new Date(Date.now()+api.retryAfter*1000):null;
      await pool.request().input("Key",key).input("State",state).input("Retry",retry).input("Error",api?.message||"Gönderim sonucu kaydedilemedi; otomatik tekrar yapılmayacak.").query("UPDATE KysTelegramDigest SET State=@State,RetryAt=@Retry,LastError=@Error,UpdatedAt=GETDATE() WHERE DigestKey=@Key");
      return state;
    }
  }
  await pool.request().input("Key",key).input("State",texts.length?"sent":"empty").query("UPDATE KysTelegramDigest SET State=@State,UpdatedAt=GETDATE() WHERE DigestKey=@Key");return texts.length?"sent":"empty";
  }catch{
    await pool.request().input("Key",key).input("State","uncertain").input("Retry",null).input("Error","Gönderim aşaması tamamlanamadı. Sonucu kontrol etmeden tekrar göndermeyin.").query("UPDATE KysTelegramDigest SET State=@State,RetryAt=@Retry,LastError=@Error,UpdatedAt=GETDATE() WHERE DigestKey=@Key");
    return "uncertain";
  }
}

export async function runTelegramDigests(now=new Date(),test?:{userIds:string[];kinds:TelegramKind[];requestId:string}){
  loadDotenvOnce();
  if((!test&&process.env.KYS_TELEGRAM_ENABLED!=="true")||!process.env.TELEGRAM_BOT_TOKEN)return {enabled:false,results:[]};
  const clock=istanbulClock(now);if(!test&&clock.hour<9)return {enabled:true,results:[]};
  await ensureKysIletisimSchema();
  const pool=await cosmoPool;
  const base=process.env.KYS_TELEGRAM_PORTAL_URL||"https://lab.uniqueanalyse.com";
  const url=new URL("/laboratuvar/kys/iletisim",base);if(url.protocol!=="https:")throw new Error("Telegram portal adresi HTTPS olmalıdır.");
  const interactive=await telegramInteractionEnabled();
  const results:Array<{userId:string;kind:TelegramKind|"recipient";state:string}>=[];
  for(const recipient of (await telegramRecipients()).filter(item=>item.enabled&&(!test||test.userIds.includes(item.userId)))){
    try{
    const access=await telegramEligibility(recipient.userId);if(!access)continue;
    const existing=(await pool.request().input("ID",recipient.userId).input("Today",clock.today).input("Week",clock.monday).query("SELECT DigestKey,State FROM KysTelegramDigest WHERE UserID=@ID AND Period IN (@Today,@Week)")).recordset;
    const reports=new Map(existing.map(row=>[String(row.DigestKey),String(row.State)]));
    const periodOf=(kind:TelegramKind)=>kind==="weekly"?clock.monday:clock.today;
    const keyOf=(kind:TelegramKind)=>hash(JSON.stringify([recipient.userId,recipient.chatId,kind,periodOf(kind),access.revision,...(test?[test.requestId]:[])]));
    const kinds=TELEGRAM_KINDS.filter(kind=>(!test||test.kinds.includes(kind))&&recipient[kind]&&(!reports.has(keyOf(kind))||["pending","retry"].includes(reports.get(keyOf(kind))!)));
    if(test)for(const kind of TELEGRAM_KINDS.filter(kind=>test.kinds.includes(kind)&&recipient[kind]&&!kinds.includes(kind)))results.push({userId:recipient.userId,kind,state:reports.get(keyOf(kind))||"skipped"});
    if(!kinds.length)continue;
    const fresh=kinds.filter(kind=>!reports.has(keyOf(kind)));
    const rows=fresh.some(kind=>kind==="daily"||kind==="weekly"||kind==="overdue")?(await pool.request().input("ID",recipient.userId).query("SELECT ID,Baslik,Durum,BaslangicTarihi,BitisTarihi,TerminTarihi FROM KysIletisim WHERE Tur='Görev' AND AliciID=@ID AND Durum<>'Tamamlandı'")).recordset:[];
    const tasks:DigestTask[]=rows.map((row:Row)=>({id:Number(row.ID),title:String(row.Baslik),status:String(row.Durum),start:day(row.BaslangicTarihi||row.TerminTarihi),end:day(row.BitisTarihi||row.TerminTarihi)}));
    const flow=fresh.some(kind=>kind==="analyses"||kind==="quality")?await listLabFlow(access.scope,clock.today,clock.today):{analizler:[],kalite:[]};
    const analyses=flow.analizler.map(item=>({id:item.id,name:item.ad,report:item.raporNo,sample:item.numune,end:item.termin||"",done:item.tamamlandi}));
    const quality=flow.kalite.map(item=>({id:item.id,title:item.baslik,description:item.aciklama,date:item.tarih,done:item.tamamlandi}));
    for(const kind of kinds){
      const lines=fresh.includes(kind)?digestLines(kind,access.name,clock,tasks,analyses,quality):[];
      const link=url.toString()+(["analyses","quality"].includes(kind)?"?sekme=lab-akisi":"?sekme=gorev");
      let parts:Array<string|TelegramPart>=interactive&&fresh.includes(kind)&&["daily","weekly","overdue"].includes(kind)?telegramTaskParts(kind,access.name,clock,tasks,link):telegramParts(lines,link);
      if(test&&fresh.includes(kind)){
        if(!parts.length)parts=[`UNIQUE · Deneme · ${TELEGRAM_TITLES[kind]}\n${access.name} · ${clock.today}\nSeçilen bildirim türünde bekleyen kayıt yok.\n${link}`];
        else parts=parts.map(part=>typeof part==="string"?`DENEME\n${part}`:{...part,text:`DENEME · Düğmeler gerçek portal görevlerini tamamlar.\n${part.text}`});
      }
      const state=await deliver(recipient,kind,kind==="weekly"?clock.monday:clock.today,access.revision,parts,test?.requestId);
      results.push({userId:recipient.userId,kind,state});
    }
    }catch{results.push({userId:recipient.userId,kind:"recipient",state:"error"});}
  }
  return {enabled:true,results};
}
