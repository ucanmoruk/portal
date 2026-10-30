import { validTelegramWebhookSecret } from "@/lib/kysTelegramConnection";
import { processTelegramUpdate, type TelegramUpdate } from "@/lib/kysTelegramActions";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request){
  if(!validTelegramWebhookSecret(request.headers.get("x-telegram-bot-api-secret-token")||""))return Response.json({error:"Yetkisiz erişim."},{status:401});
  if(Number(request.headers.get("content-length"))>65536)return Response.json({error:"İstek çok büyük."},{status:413});
  let update:TelegramUpdate;
  try{const text=await request.text();if(text.length>65536)return Response.json({error:"İstek çok büyük."},{status:413});update=JSON.parse(text);if(!update||typeof update!=="object")throw new Error();}catch{return Response.json({error:"Geçersiz güncelleme."},{status:400});}
  try{await processTelegramUpdate(update);return Response.json({ok:true});}catch{return Response.json({error:"Güncelleme tamamlanamadı."},{status:500});}
}
