import { getPortalUser } from "@/lib/portalYetki";
import { dokumanYetkileri } from "@/lib/kysDokumanYetki";
import { listKysDokumanActivity } from "@/lib/kysDokumanStore";
export async function GET(request: Request) {
  const user=await getPortalUser();
  if(!user)return Response.json({error:"Yetkisiz erişim"},{status:401});
  if(!dokumanYetkileri(user).goruntule)return Response.json({error:"Görüntüleme yetkiniz yok."},{status:403});
  const params=new URL(request.url).searchParams;
  try{return Response.json(await listKysDokumanActivity({search:params.get("search")||"",islem:params.get("islem")||"",page:Number(params.get("page")||1)}));}
  catch{return Response.json({error:"Değişiklik kayıtları alınamadı."},{status:500});}
}
