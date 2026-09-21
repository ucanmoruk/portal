import { getPortalUser } from "@/lib/portalYetki";
import { getKysBildirimler } from "@/lib/kysIletisimStore";
export async function GET(){const user=await getPortalUser();if(!user)return Response.json({error:"Yetkisiz erişim"},{status:401});try{return Response.json(await getKysBildirimler(user));}catch(e){return Response.json({error:e instanceof Error?e.message:"Bildirimler alınamadı."},{status:500});}}
