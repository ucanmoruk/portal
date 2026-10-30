import { createHmac, timingSafeEqual } from "node:crypto";
import { cosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";
import { telegramCall, discoverTelegramChats, type TelegramDiscoveredChat } from "@/lib/kysTelegramApi";
import { loadDotenvOnce } from "@/lib/loadDotenv";

let ready:Promise<void>|null=null;
export function ensureTelegramConnectionSchema(){
  if(!ready)ready=(async()=>{
    const pool=await cosmoPool;
    await pool.request().query(hasMysqlConfig()?`CREATE TABLE IF NOT EXISTS KysTelegramChat (
      ChatID VARCHAR(32) NOT NULL PRIMARY KEY, Name VARCHAR(220) NOT NULL, Username VARCHAR(80) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci`:`IF OBJECT_ID('KysTelegramChat','U') IS NULL CREATE TABLE KysTelegramChat (ChatID NVARCHAR(32) NOT NULL PRIMARY KEY, Name NVARCHAR(220) NOT NULL, Username NVARCHAR(80) NOT NULL)`);
    await pool.request().query(hasMysqlConfig()?`CREATE TABLE IF NOT EXISTS KysTelegramConnection (
      ID INT NOT NULL PRIMARY KEY, Enabled INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB`:`IF OBJECT_ID('KysTelegramConnection','U') IS NULL CREATE TABLE KysTelegramConnection (ID INT NOT NULL PRIMARY KEY, Enabled INT NOT NULL DEFAULT 0)`);
  })().catch(error=>{ready=null;throw error;});
  return ready;
}
export function telegramWebhookUrl(){
  loadDotenvOnce();
  const url=new URL("/api/telegram/kys",process.env.KYS_TELEGRAM_PORTAL_URL||"https://lab.uniqueanalyse.com");
  if(url.protocol!=="https:")throw new Error("Telegram bağlantısı için HTTPS portal adresi gerekli.");
  return url.toString();
}
export function telegramWebhookSecret(){
  loadDotenvOnce();
  const token=process.env.TELEGRAM_BOT_TOKEN||"";
  if(!/^\d+:[a-zA-Z0-9_-]+$/.test(token))throw new Error("Telegram bot tokeni sunucuda tanımlı değil.");
  return createHmac("sha256",token).update("kys-telegram-webhook-v1").digest("hex");
}
export function validTelegramWebhookSecret(value:string){
  try{const expected=Buffer.from(telegramWebhookSecret()),actual=Buffer.from(value);return expected.length===actual.length&&timingSafeEqual(expected,actual);}catch{return false;}
}
export async function telegramInteractionEnabled(){
  await ensureTelegramConnectionSchema();
  const row=(await (await cosmoPool).request().query("SELECT Enabled FROM KysTelegramConnection WHERE ID=1")).recordset[0];
  return Number(row?.Enabled)===1;
}
export async function rememberTelegramChat(chat:TelegramDiscoveredChat){
  if(!/^[1-9]\d{0,18}$/.test(chat.chatId))return;
  await ensureTelegramConnectionSchema();
  const insert="INSERT INTO KysTelegramChat (ChatID,Name,Username) VALUES (@Chat,@Name,@Username)";
  await (await cosmoPool).request().input("Chat",chat.chatId).input("Name",chat.name.slice(0,220)).input("Username",chat.username.slice(0,80)).query(hasMysqlConfig()?`${insert} ON DUPLICATE KEY UPDATE Name=@Name,Username=@Username`:`UPDATE KysTelegramChat SET Name=@Name,Username=@Username WHERE ChatID=@Chat; IF @@ROWCOUNT=0 ${insert}`);
}
export async function listTelegramChats(){
  await ensureTelegramConnectionSchema();
  const info=await telegramCall<{url:string}>("getWebhookInfo",{});
  if(info.url&&info.url!==telegramWebhookUrl())throw new Error("Bot başka bir webhook kullanıyor; mevcut bağlantı değiştirilmedi.");
  if(!info.url)for(const chat of await discoverTelegramChats())await rememberTelegramChat(chat);
  const rows=(await (await cosmoPool).request().query("SELECT ChatID,Name,Username FROM KysTelegramChat ORDER BY Name")).recordset;
  return rows.map((row:Record<string,unknown>)=>({chatId:String(row.ChatID),name:String(row.Name),username:String(row.Username)}));
}
export async function enableTelegramInteraction(){
  // Cache pending chat identities before switching from getUpdates to webhook delivery.
  await listTelegramChats();
  await telegramCall("setWebhook",{url:telegramWebhookUrl(),secret_token:telegramWebhookSecret(),allowed_updates:["message","callback_query"],drop_pending_updates:false});
  const info=await telegramCall<{url:string}>("getWebhookInfo",{});
  if(info.url!==telegramWebhookUrl())throw new Error("Telegram bağlantısı doğrulanamadı.");
  const insert="INSERT INTO KysTelegramConnection (ID,Enabled) VALUES (1,1)";
  await (await cosmoPool).request().query(hasMysqlConfig()?`${insert} ON DUPLICATE KEY UPDATE Enabled=1`:`UPDATE KysTelegramConnection SET Enabled=1 WHERE ID=1; IF @@ROWCOUNT=0 ${insert}`);
}
