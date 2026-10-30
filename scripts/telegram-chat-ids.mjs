// Read incoming /start messages to find private Chat IDs. Never sends messages.
import env from "@next/env";
env.loadEnvConfig(process.cwd());
const token=process.env.TELEGRAM_BOT_TOKEN||"";
if(!/^\d+:[a-zA-Z0-9_-]+$/.test(token))throw new Error("TELEGRAM_BOT_TOKEN sunucuda tanımlanmalı.");
async function call(method,body){
  let response;
  try{response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});}catch{throw new Error("Telegram bağlantısı kurulamadı.");}
  const data=await response.json();if(!data.ok)throw new Error("Telegram isteği reddetti. Bot ve bağlantı ayarlarını kontrol edin.");return data.result;
}
const info=await call("getWebhookInfo",{});
if(info.url)throw new Error("Bu bot başka bir webhook kullanıyor. Webhook değiştirilmedi; bot yöneticisinden kişisel Chat ID bilgilerini alın veya ayrı bir bot kullanın.");
const updates=await call("getUpdates",{timeout:0,limit:100});
const chats=new Map();
for(const update of updates){const chat=update.message?.chat;if(chat?.type==="private")chats.set(chat.id,{chatId:String(chat.id),name:[chat.first_name,chat.last_name].filter(Boolean).join(" "),username:chat.username||""});}
console.table([...chats.values()]);
