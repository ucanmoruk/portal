import { timingSafeEqual, createHash } from "node:crypto";
import { z } from "zod";
import { insertUniqueRequest, uniquePool } from "@/lib/uniqueTalepStore";
import { getCrmCatalog } from "@/lib/crmCatalog";
import { hydrateCrmOffer } from "@/lib/crmOffer";
const schema=z.object({externalId:z.string().min(1).max(200),name:z.string().min(1).max(200),email:z.email(),companyName:z.string().max(250).default(""),phone:z.string().max(50).default(""),subject:z.string().min(1).max(500),message:z.string().min(1).max(16000),consent:z.literal(true),items:z.array(z.object({serviceId:z.number().int().positive(),quantity:z.number().int().min(1).max(10000),products:z.array(z.string().max(200)).max(30).default([])})).max(100).default([])});
export async function POST(request:Request){
 const secret=process.env.WEBSITE_ASSISTANT_TOKEN;
 if(!secret)return Response.json({error:"Entegrasyon etkin değil."},{status:503});
 const token=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
 const a=Buffer.from(secret),b=Buffer.from(token);
 if(a.length!==b.length||!timingSafeEqual(a,b))return Response.json({error:"Yetkisiz"},{status:401});
 try{
 if(Number(request.headers.get('content-length')||0)>64000)return Response.json({error:"İstek çok büyük"},{status:413});
 const text=await request.text();if(Buffer.byteLength(text)>64000)return Response.json({error:"İstek çok büyük"},{status:413});
 const data=schema.parse(JSON.parse(text));const source=createHash('sha256').update('website:'+data.externalId).digest('hex');
 const catalog=await getCrmCatalog();
 if(data.items.some(i=>!catalog.services.some(s=>Number(s.ID)===i.serviceId&&s.Fiyat!=null)))return Response.json({error:"Geçersiz veya fiyatı bulunmayan hizmet."},{status:422});
 const offer=data.items.length?hydrateCrmOffer({recipient:data.name,email:data.email,subject:data.subject,replySubject:data.subject,replyBody:"",warnings:[],items:data.items,packages:[]},catalog.services,catalog.packages):null;
 const created=await insertUniqueRequest({source,date:new Date().toISOString(),name:data.name,email:data.email,messageId:data.externalId,subject:data.subject,text:`Web asistanı\nFirma: ${data.companyName}\nTelefon: ${data.phone}\n\n${data.message}`,category:'Fiyat Teklifi',potential:true,reason:'Web asistanı üzerinden müşteri onaylı talep.',status:'Bekliyor',companyId:null,companyName:data.companyName,offer,quoteId:null,mailState:'Taslak',sentAt:null,sentMessageId:'',error:''});
 const rows=await(await uniquePool()).request().input('Source',source).query('SELECT ID FROM UniqueTalep WHERE SourceKey=@Source');
 const id=Number(rows.recordset[0].ID);
 return Response.json({id,created,offerDraft:!!offer,url:`/iletisim/unique-talep/${id}`},{status:created?201:200});
 }catch(e){return Response.json({error:e instanceof z.ZodError?'Eksik veya geçersiz alanlar.':'Talep alınamadı.'},{status:e instanceof z.ZodError?400:500});}
}
