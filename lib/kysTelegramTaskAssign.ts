import { createHash } from "node:crypto";
import { cosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";
import { getUserPool } from "@/lib/userStore";
import { ensureKysIletisimSchema } from "@/lib/kysIletisimStore";
import { telegramEligibility, telegramRecipients } from "@/lib/kysTelegramStore";
import { telegramCall } from "@/lib/kysTelegramApi";
import { matchTelegramPeople, parseTelegramTaskText } from "@/lib/kysTelegramTaskText";
import { istanbulClock } from "@/lib/kysTelegramRules";

let ready:Promise<void>|null=null;
type Candidate={id:string;name:string};
type Draft={title:string;date:string;candidates:Candidate[]};
async function ensureDraftSchema(){
  if(!ready)ready=(async()=>{await (await cosmoPool).request().query(hasMysqlConfig()?`CREATE TABLE IF NOT EXISTS KysTelegramTaskDraft (
    DraftKey VARCHAR(32) NOT NULL PRIMARY KEY, ChatID VARCHAR(32) NOT NULL, ActorID VARCHAR(80) NOT NULL,
    PayloadJson LONGTEXT NOT NULL, State VARCHAR(20) NOT NULL DEFAULT 'pending', TaskID INT NULL, ExpiresAt DATETIME NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci`:`IF OBJECT_ID('KysTelegramTaskDraft','U') IS NULL CREATE TABLE KysTelegramTaskDraft (
    DraftKey NVARCHAR(32) NOT NULL PRIMARY KEY, ChatID NVARCHAR(32) NOT NULL, ActorID NVARCHAR(80) NOT NULL,
    PayloadJson NVARCHAR(MAX) NOT NULL, State NVARCHAR(20) NOT NULL DEFAULT 'pending', TaskID INT NULL, ExpiresAt DATETIME NOT NULL)`);})().catch(error=>{ready=null;throw error;});
  return ready;
}
async function sender(chatId:string){
  const recipient=(await telegramRecipients()).find(item=>item.enabled&&item.chatId===chatId);
  const access=recipient?await telegramEligibility(recipient.userId):null;
  return recipient&&access?{userId:recipient.userId,name:access.name}:null;
}
const preview=(draft:Draft,person:Candidate)=>`Görev taslağı\nKişi: ${person.name}\nBaşlangıç / termin: ${draft.date.split("-").reverse().join(".")}\nKategori: Rutin\n\n${draft.title}\n\nOnayladığınızda portalda Atandı olarak kaydedilir.`;
const cancelButton=(key:string)=>({text:"İptal",callback_data:`kys:cancel:${key}`});
export async function receiveTelegramTaskText(chatId:string,messageId:number,text:string,now=new Date()){
  const actor=await sender(chatId);
  if(!actor){await telegramCall("sendMessage",{chat_id:chatId,text:"Görev atamak için Telegram hesabınızın portal kullanıcısıyla eşleştirilmiş ve açık olması, ayrıca KYS erişiminizin bulunması gerekiyor."});return;}
  if(/^\/(start|help|yardim|yardım|gorev|görev)(?:@[a-zA-Z0-9_]+)?\s*$/iu.test(text.trim())){
    await telegramCall("sendMessage",{chat_id:chatId,text:"Hızlı görev atama:\nSelin bugün teklifleri kontrol et\nOğuzhan Eker yarın kargo durumunu sor\nSelin bir hafta sonra stokları kontrol et\nSelin 05.11.2026 raporu hazırla\n\nBot önce kişi ve tarihi gösterir; onaylayınca görev kaydedilir. Başlangıç ve termin seçilen gündür. Kategori: Rutin."});return;
  }
  let parsed:ReturnType<typeof parseTelegramTaskText>;
  try{parsed=parseTelegramTaskText(text,now);}catch(error){await telegramCall("sendMessage",{chat_id:chatId,text:error instanceof Error?error.message:"Görev anlaşılamadı."});return;}
  const rows=(await (await getUserPool()).request().query("SELECT ID,Ad,Soyad FROM RootKullanici WHERE Durum='Aktif' ORDER BY Ad,ID")).recordset;
  const people:Candidate[]=rows.map((row:Record<string,unknown>)=>({id:String(row.ID),name:[row.Ad,row.Soyad].filter(Boolean).join(" ")}));
  const candidates:Candidate[]=[];
  for(const person of matchTelegramPeople(parsed.person,people))if(await telegramEligibility(person.id))candidates.push(person);
  if(!candidates.length){await telegramCall("sendMessage",{chat_id:chatId,text:"Bu adla aktif ve KYS erişimi olan kişi bulunamadı. Portalda görünen ad ve soyadıyla tekrar yazın."});return;}
  if(candidates.length>20){await telegramCall("sendMessage",{chat_id:chatId,text:"Çok fazla kişi eşleşti. Ad ve soyadı birlikte yazın."});return;}
  await ensureDraftSchema();
  const key=createHash("sha256").update(`${chatId}:${messageId}`).digest("hex").slice(0,32);
  let draft:Draft={title:parsed.title,date:parsed.date,candidates};
  const insert="INSERT INTO KysTelegramTaskDraft (DraftKey,ChatID,ActorID,PayloadJson,ExpiresAt) VALUES (@Key,@Chat,@Actor,@Payload,@Expires)";
  await (await cosmoPool).request().input("Key",key).input("Chat",chatId).input("Actor",actor.userId).input("Payload",JSON.stringify(draft)).input("Expires",new Date(now.getTime()+30*60000)).query(hasMysqlConfig()?insert.replace("INSERT INTO","INSERT IGNORE INTO"):`IF NOT EXISTS (SELECT 1 FROM KysTelegramTaskDraft WHERE DraftKey=@Key) ${insert}`);
  const stored=(await (await cosmoPool).request().input("Key",key).input("Chat",chatId).input("Actor",actor.userId).query("SELECT * FROM KysTelegramTaskDraft WHERE DraftKey=@Key AND ChatID=@Chat AND ActorID=@Actor")).recordset[0];
  if(!stored)throw new Error("Görev taslağı alınamadı.");
  if(stored.State!=="pending"||new Date(stored.ExpiresAt).getTime()<now.getTime())return;
  draft=JSON.parse(String(stored.PayloadJson)) as Draft;
  const offered=draft.candidates;
  if(offered.length===1)await telegramCall("sendMessage",{chat_id:chatId,text:preview(draft,offered[0]),reply_markup:{inline_keyboard:[[{text:"Görevi ata",callback_data:`kys:new:${key}:${offered[0].id}`}],[cancelButton(key)]]}});
  else await telegramCall("sendMessage",{chat_id:chatId,text:"Aynı adla birden fazla kişi bulundu. Görevin atanacağı kişiyi seçin:",reply_markup:{inline_keyboard:[...offered.map(person=>[{text:person.name,callback_data:`kys:pick:${key}:${person.id}`}]),[cancelButton(key)]]}});
}

export async function handleTelegramAssignment(chatId:string,data:string,now=new Date()){
  const match=/^kys:(new|pick|cancel):([a-f0-9]{32})(?::([1-9]\d{0,9}))?$/.exec(data);
  if(!match)throw new Error("Geçersiz görev işlemi.");
  const [,action,key,target]=match;
  const actor=await sender(chatId);if(!actor)throw new Error("Portal bağlantınız veya görev atama yetkiniz bulunmuyor.");
  await ensureDraftSchema();await ensureKysIletisimSchema();
  const tx=await (await cosmoPool).transaction();await tx.begin();
  let selected:Candidate|undefined,draft:Draft|undefined,taskId:number|undefined;
  try{
    const row=(await tx.request().input("Key",key).input("Chat",chatId).input("Actor",actor.userId).query(hasMysqlConfig()?"SELECT * FROM KysTelegramTaskDraft WHERE DraftKey=@Key AND ChatID=@Chat AND ActorID=@Actor FOR UPDATE":"SELECT * FROM KysTelegramTaskDraft WITH (UPDLOCK,HOLDLOCK) WHERE DraftKey=@Key AND ChatID=@Chat AND ActorID=@Actor")).recordset[0];
    if(!row)throw new Error("Görev taslağı bulunamadı veya size ait değil.");
    if(row.State==="created"){taskId=Number(row.TaskID);await tx.commit();return {text:`Görev daha önce kaydedildi. Görev #${taskId}`,taskId};}
    if(row.State!=="pending"||new Date(row.ExpiresAt).getTime()<now.getTime())throw new Error("Taslak iptal edilmiş veya 30 dakikalık süresi dolmuş. Görevi yeniden yazın.");
    if(action==="cancel"){
      await tx.request().input("Key",key).query("UPDATE KysTelegramTaskDraft SET State='cancelled' WHERE DraftKey=@Key");await tx.commit();return {text:"Görev taslağı iptal edildi."};
    }
    draft=JSON.parse(String(row.PayloadJson)) as Draft;selected=draft.candidates.find(person=>person.id===target);
    if(!selected||!await telegramEligibility(selected.id))throw new Error("Seçilen kişinin güncel KYS erişimi bulunmuyor.");
    if(draft.date<istanbulClock(now).today)throw new Error("Görev tarihi geçmişte kaldı. Görevi yeniden yazın.");
    if(action==="new"){
      const result=await tx.request().input("Title",draft.title.slice(0,220)).input("Body",draft.title).input("Actor",actor.userId).input("ActorName",actor.name).input("Target",selected.id).input("TargetName",selected.name).input("Date",draft.date).query("INSERT INTO KysIletisim (Tur,Baslik,Icerik,OlusturanID,OlusturanAd,AliciID,AliciAd,Durum,TerminTarihi,BaslangicTarihi,BitisTarihi,Kategori) OUTPUT INSERTED.ID VALUES ('Görev',@Title,@Body,@Actor,@ActorName,@Target,@TargetName,'Atandı',@Date,@Date,@Date,'Rutin')");
      taskId=Number(result.recordset[0]?.ID);if(!Number.isSafeInteger(taskId)||taskId<=0)throw new Error("Görev kimliği alınamadı.");
      await tx.request().input("ID",taskId).input("Actor",actor.userId).input("Name",`${actor.name.slice(0,145)} · Telegram`).query("INSERT INTO KysIletisimGorevLog (GorevID,Durum,KullaniciID,KullaniciAd) VALUES (@ID,'Atandı',@Actor,@Name)");
      await tx.request().input("Key",key).input("Task",taskId).query("UPDATE KysTelegramTaskDraft SET State='created',TaskID=@Task WHERE DraftKey=@Key");
    }
    await tx.commit();
  }catch(error){await tx.rollback();throw error;}
  if(taskId)return {text:`Görev #${taskId}, ${selected!.name} kişisine ${draft!.date.split("-").reverse().join(".")} tarihi için atandı.`,taskId};
  await telegramCall("sendMessage",{chat_id:chatId,text:preview(draft!,selected!),reply_markup:{inline_keyboard:[[{text:"Görevi ata",callback_data:`kys:new:${key}:${selected!.id}`}],[cancelButton(key)]]}});
  return {text:"Kişi seçildi. Görev taslağını onaylayın."};
}
