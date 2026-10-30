import { getPortalUser } from "@/lib/portalYetki";
import { enableTelegramInteraction } from "@/lib/kysTelegramConnection";
export const runtime="nodejs";
export async function POST(){
  if(!(await getPortalUser())?.isAdmin)return Response.json({error:"Yönetici yetkisi gerekli."},{status:403});
  try{await enableTelegramInteraction();return Response.json({ok:true});}catch(error){return Response.json({error:error instanceof Error?error.message:"Telegram bağlantısı kurulamadı."},{status:400});}
}
