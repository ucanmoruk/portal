import { getPortalUser } from "@/lib/portalYetki";
import { runTelegramDigests, telegramRecipients } from "@/lib/kysTelegramStore";
import { TELEGRAM_KINDS, type TelegramKind } from "@/lib/kysTelegramRules";
export const runtime="nodejs";
export const maxDuration=180;
export async function POST(request:Request){
  if(!(await getPortalUser())?.isAdmin)return Response.json({error:"Yönetici yetkisi gerekli."},{status:403});
  try{
    const input=await request.json();
    if(!Array.isArray(input.userIds)||!Array.isArray(input.kinds))throw new Error("Alıcıları ve bildirim türlerini seçin.");
    const userIds:string[]=[...new Set<string>(input.userIds.map(String))],kinds:TelegramKind[]=[...new Set<TelegramKind>(input.kinds)];
    if(!userIds.length||userIds.length>10||userIds.some(id=>! /^[1-9]\d*$/.test(id))||!kinds.length||kinds.some(kind=>!TELEGRAM_KINDS.includes(kind)))throw new Error("En fazla 10 kayıtlı alıcı ve geçerli bildirim türlerini seçin.");
    if(typeof input.requestId!=="string"||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId))throw new Error("Gönderim kimliği geçersiz.");
    const recipients=await telegramRecipients();
    if(userIds.some(id=>!recipients.some(item=>item.userId===id&&item.enabled&&kinds.some(kind=>item[kind]))))throw new Error("Seçilen her alıcının bağlantısı ve seçilen türlerden en az biri kayıtlı tercihlerinde açık olmalıdır.");
    const result=await runTelegramDigests(new Date(),{userIds,kinds,requestId:input.requestId});
    if(!result.enabled)throw new Error("Bot tokeni sunucuda tanımlı değil.");
    return Response.json(result);
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Deneme gönderilemedi."},{status:400});}
}
