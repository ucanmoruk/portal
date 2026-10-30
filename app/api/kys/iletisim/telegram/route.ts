import { getPortalUser } from "@/lib/portalYetki";
import { telegramSettings, saveTelegramRecipient, removeTelegramRecipient } from "@/lib/kysTelegramStore";
async function admin(){const user=await getPortalUser();return user?.isAdmin?user:null;}
export async function GET(){
  if(!await admin())return Response.json({error:"Yönetici yetkisi gerekli."},{status:403});
  try{return Response.json(await telegramSettings());}catch{return Response.json({error:"Telegram ayarları alınamadı."},{status:500});}
}
export async function POST(request:Request){
  const user=await admin();if(!user)return Response.json({error:"Yönetici yetkisi gerekli."},{status:403});
  try{await saveTelegramRecipient(await request.json(),user.userId);return Response.json({ok:true});}catch(error){return Response.json({error:error instanceof Error?error.message:"Kaydedilemedi."},{status:400});}
}
export async function DELETE(request:Request){
  if(!await admin())return Response.json({error:"Yönetici yetkisi gerekli."},{status:403});
  const userId=String((await request.json()).userId||"");if(!/^[1-9]\d*$/.test(userId))return Response.json({error:"Kullanıcı geçersiz."},{status:400});
  try{await removeTelegramRecipient(userId);return Response.json({ok:true});}catch{return Response.json({error:"Kaldırılamadı."},{status:500});}
}
