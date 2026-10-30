type Chat={id:number;type:string;first_name?:string;last_name?:string;username?:string;title?:string};
export class TelegramApiError extends Error{
  constructor(message:string,readonly definitive:boolean,readonly retryAfter=0){super(message);}
}
export async function telegramCall<T>(method:"getChat"|"sendMessage"|"getWebhookInfo"|"getUpdates"|"setWebhook"|"answerCallbackQuery"|"editMessageReplyMarkup"|"editMessageText",body:Record<string,unknown>):Promise<T>{
  const token=process.env.TELEGRAM_BOT_TOKEN||"";
  if(!/^\d+:[a-zA-Z0-9_-]+$/.test(token))throw new TelegramApiError("Telegram bot tokeni sunucuda tanımlı değil.",true);
  let response:Response;
  try{response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(20000),cache:"no-store"});}
  catch{throw new TelegramApiError("Telegram bağlantısının sonucu alınamadı.",false);}
  let data:{ok:boolean;result:T;description?:string;parameters?:{retry_after?:number}};
  try{data=await response.json();}catch{throw new TelegramApiError("Telegram yanıtı okunamadı.",false);}
  if(!data.ok)throw new TelegramApiError((data.description||"Telegram isteği reddetti.").slice(0,220),true,Number(data.parameters?.retry_after)||0);
  return data.result;
}
export async function verifyTelegramChat(chatId:string){
  if(!/^[1-9]\d{0,18}$/.test(chatId))throw new Error("Kişinin pozitif sayısal Telegram Chat ID bilgisini girin.");
  const chat=await telegramCall<Chat>("getChat",{chat_id:chatId});
  if(chat.type!=="private"||String(chat.id)!==chatId)throw new Error("Kişisel bildirimler için yalnız doğrulanmış özel Telegram sohbetleri kullanılabilir.");
  return [chat.first_name,chat.last_name,chat.username&&`@${chat.username}`].filter(Boolean).join(" ");
}

export type TelegramDiscoveredChat={chatId:string;name:string;username:string};
export async function discoverTelegramChats():Promise<TelegramDiscoveredChat[]>{
  const webhook=await telegramCall<{url:string}>("getWebhookInfo",{});
  if(webhook.url)throw new Error("Bot başka bir webhook kullanıyor. Sohbet listesi okunamadı; mevcut webhook değiştirilmedi.");
  const updates=await telegramCall<Array<{message?:{chat:Chat}}>>("getUpdates",{timeout:0,limit:100});
  const chats=new Map<string,TelegramDiscoveredChat>();
  for(const update of updates){
    const chat=update.message?.chat;
    if(chat?.type!=="private"||!Number.isSafeInteger(chat.id)||chat.id<=0)continue;
    const chatId=String(chat.id);
    chats.set(chatId,{chatId,name:[chat.first_name,chat.last_name].filter(Boolean).join(" ")||"İsimsiz kişi",username:chat.username||""});
  }
  return [...chats.values()].sort((a,b)=>a.name.localeCompare(b.name,"tr"));
}
