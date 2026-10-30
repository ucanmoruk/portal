type Chat={id:number;type:string;first_name?:string;last_name?:string;username?:string;title?:string};
export class TelegramApiError extends Error{
  constructor(message:string,readonly definitive:boolean,readonly retryAfter=0){super(message);}
}
export async function telegramCall<T>(method:"getChat"|"sendMessage",body:Record<string,unknown>):Promise<T>{
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
