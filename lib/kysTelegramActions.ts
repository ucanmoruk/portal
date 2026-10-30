import { cosmoPool } from "@/lib/db";
import { ensureKysIletisimSchema } from "@/lib/kysIletisimStore";
import { telegramEligibility, telegramRecipients } from "@/lib/kysTelegramStore";
import { rememberTelegramChat } from "@/lib/kysTelegramConnection";
import { receiveTelegramTaskText, handleTelegramAssignment } from "@/lib/kysTelegramTaskAssign";
import { telegramCall, type TelegramDiscoveredChat } from "@/lib/kysTelegramApi";

type Chat={id:number;type:string;first_name?:string;last_name?:string;username?:string};
export type TelegramUpdate={message?:{chat:Chat;from?:{id:number};message_id?:number;text?:string};callback_query?:{id:string;from:{id:number};data?:string;message?:{chat:Chat;message_id:number;reply_markup?:{inline_keyboard:Array<Array<{text:string;callback_data?:string;url?:string}>>}}}};

export async function completeTelegramTask(chatId:string,taskId:number){
  const recipient=(await telegramRecipients()).find(item=>item.enabled&&item.chatId===chatId);
  const access=recipient?await telegramEligibility(recipient.userId):null;
  if(!recipient||!access)throw new Error("Bu Telegram hesabının aktif portal bağlantısı veya yetkisi yok.");
  await ensureKysIletisimSchema();
  const tx=await (await cosmoPool).transaction();await tx.begin();
  try{
    const result=await tx.request().input("ID",taskId).input("User",recipient.userId).query("UPDATE KysIletisim SET Durum='Tamamlandı',UpdatedAt=GETDATE() WHERE ID=@ID AND Tur='Görev' AND AliciID=@User AND Durum IN ('Atandı','Kabul Edildi','Başladı')");
    if(result.rowsAffected[0]){
      await tx.request().input("ID",taskId).input("User",recipient.userId).input("Name",`${access.name.slice(0,145)} · Telegram`).query("INSERT INTO KysIletisimGorevLog (GorevID,Durum,KullaniciID,KullaniciAd) VALUES (@ID,'Tamamlandı',@User,@Name)");
    }else{
      const row=(await tx.request().input("ID",taskId).input("User",recipient.userId).query("SELECT Durum FROM KysIletisim WHERE ID=@ID AND Tur='Görev' AND AliciID=@User")).recordset[0];
      if(row?.Durum!=="Tamamlandı")throw new Error("Görev bulunamadı veya artık size atanmamış.");
    }
    await tx.commit();
  }catch(error){await tx.rollback();throw error;}
}

export async function processTelegramUpdate(update:TelegramUpdate){
  const chat=update.message?.chat;
  if(chat?.type==="private"&&Number.isSafeInteger(chat.id)&&chat.id>0){
    const identity:TelegramDiscoveredChat={chatId:String(chat.id),name:[chat.first_name,chat.last_name].filter(Boolean).join(" ")||"İsimsiz kişi",username:chat.username||""};
    await rememberTelegramChat(identity);
    const incoming=update.message;
    if(incoming?.from?.id===chat.id&&Number.isSafeInteger(incoming.message_id)&&Number(incoming.message_id)>0&&typeof incoming.text==="string")await receiveTelegramTaskText(String(chat.id),Number(incoming.message_id),incoming.text);
  }
  const callback=update.callback_query;if(!callback)return;
  const match=/^kys:done:([1-9]\d{0,9})$/.exec(callback.data||"");
  const message=callback.message;
  if(!message||message.chat.type!=="private"||message.chat.id!==callback.from.id||!Number.isSafeInteger(callback.from.id)||callback.from.id<=0){
    await telegramCall("answerCallbackQuery",{callback_query_id:callback.id,text:"Bu işlem yalnız kendi özel sohbetinizde kullanılabilir.",show_alert:true});return;
  }
  if(/^kys:(new|pick|cancel):/.test(callback.data||"")){
    let result:Awaited<ReturnType<typeof handleTelegramAssignment>>;
    try{result=await handleTelegramAssignment(String(callback.from.id),callback.data!);}
    catch(error){
      const safe=error instanceof Error&&/^(Geçersiz görev|Portal bağlantınız|Görev taslağı|Taslak iptal|Seçilen kişinin|Görev tarihi)/.test(error.message);
      if(!safe)throw error;
      await telegramCall("answerCallbackQuery",{callback_query_id:callback.id,text:(error as Error).message,show_alert:true});return;
    }
    try{await telegramCall("answerCallbackQuery",{callback_query_id:callback.id,text:result.text.slice(0,180)});}catch{}
    if(!callback.data?.startsWith("kys:pick:")){
      try{await telegramCall("editMessageText",{chat_id:message.chat.id,message_id:message.message_id,text:result.text,reply_markup:{inline_keyboard:[]}});}catch{}
    }
    return;
  }
  if(!match){await telegramCall("answerCallbackQuery",{callback_query_id:callback.id,text:"Geçersiz görev işlemi.",show_alert:true});return;}
  try{await completeTelegramTask(String(callback.from.id),Number(match[1]));}
  catch(error){
    // Expected access/ownership errors are displayed; database failures must be retried by Telegram.
    if(!(error instanceof Error)||!["Bu Telegram hesabının aktif portal bağlantısı veya yetkisi yok.","Görev bulunamadı veya artık size atanmamış."].includes(error.message))throw error;
    await telegramCall("answerCallbackQuery",{callback_query_id:callback.id,text:error.message,show_alert:true});return;
  }
  // The task commit is authoritative even if Telegram's cosmetic update fails or the callback expires.
  try{await telegramCall("answerCallbackQuery",{callback_query_id:callback.id,text:"Görev portalda tamamlandı olarak kaydedildi."});}catch{}
  try{await telegramCall("editMessageReplyMarkup",{chat_id:message.chat.id,message_id:message.message_id,reply_markup:{inline_keyboard:(message.reply_markup?.inline_keyboard||[]).map(row=>row.filter(button=>button.callback_data!==callback.data)).filter(row=>row.length)}});}catch{}
}
