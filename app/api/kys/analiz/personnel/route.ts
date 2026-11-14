import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/portalYetki";
import { getUserPool, getUserFirmalari } from "@/lib/userStore";
export async function GET() {
 const user=await getPortalUser();if(!user)return NextResponse.json({error:"Oturum açın."},{status:401});
 if(!user.can("eurolab.validasyon")&&!user.can("eurolab.metotlar")&&!user.can("eurolab"))return NextResponse.json({error:"Yetkiniz yok."},{status:403});
 try{const pool=await getUserPool();const rows=(await pool.request().query("SELECT ID,Kadi,Ad,Soyad,Gorev,Email,LaboratuvarBirimID FROM RootKullanici WHERE Durum='Aktif' ORDER BY Ad,Soyad")).recordset;
 const filtered=[];for(const r of rows){if(!(await getUserFirmalari(r.ID)).includes("Unique"))continue;filtered.push({id:r.ID,username:r.Kadi||"",name:[r.Ad,r.Soyad].filter(Boolean).join(" ").trim()||r.Kadi,role:r.Gorev||"",email:r.Email||"",unitId:r.LaboratuvarBirimID??null});}return NextResponse.json(filtered);
 }catch{return NextResponse.json({error:"Unique personel listesi yüklenemedi."},{status:500});}
}
