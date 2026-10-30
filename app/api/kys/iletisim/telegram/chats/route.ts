import { getPortalUser } from "@/lib/portalYetki";
import { loadDotenvOnce } from "@/lib/loadDotenv";
import { discoverTelegramChats } from "@/lib/kysTelegramApi";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
  if(!(await getPortalUser())?.isAdmin)return Response.json({error:"Yönetici yetkisi gerekli."},{status:403});
  loadDotenvOnce();
  try{return Response.json({chats:await discoverTelegramChats()},{headers:{"Cache-Control":"no-store"}});}
  catch(error){return Response.json({error:error instanceof Error?error.message:"Telegram sohbetleri alınamadı."},{status:400,headers:{"Cache-Control":"no-store"}});}
}
