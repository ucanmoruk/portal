import { timingSafeEqual } from "node:crypto";
import { loadDotenvOnce } from "@/lib/loadDotenv";
import { runTelegramDigests } from "@/lib/kysTelegramStore";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=180;
export async function GET(request:Request){
  loadDotenvOnce();
  const secret=process.env.KYS_TELEGRAM_CRON_SECRET||"";
  const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(request.headers.get("authorization")||"");
  if(secret.length<32||actual.length!==expected.length||!timingSafeEqual(actual,expected))return Response.json({error:"Yetkisiz erişim."},{status:401});
  try{return Response.json(await runTelegramDigests());}catch{return Response.json({error:"Telegram bildirimleri tamamlanamadı. Sunucu bağlantısını ve ayarları kontrol edin."},{status:500});}
}
