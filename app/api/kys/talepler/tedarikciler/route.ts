import { getPortalUser } from "@/lib/portalYetki";
import { listKysSuppliers } from "@/lib/kysPurchaseWorkflow";

export async function GET() {
  const user=await getPortalUser();
  if(!user)return Response.json({error:"Yetkisiz erişim"},{status:401});
  if(!user.can("laboratuvar.kys.talep-listesi"))return Response.json({error:"Yetkiniz yok."},{status:403});
  try {
    const suppliers=await listKysSuppliers();
    return Response.json({data:suppliers.map(s=>({ID:s.ID,Ad:s.Ad,Email:s.Email||""}))});
  }catch{return Response.json({error:"Tedarikçiler alınamadı."},{status:500});}
}
