import { ZodError } from "zod";
import { getPortalUser } from "@/lib/portalYetki";
import { createSpektrotekTalep, listSpektrotekTalepler, SpektrotekTalepError, updateSpektrotekTalep } from "@/lib/spektrotekTalep";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{path?:string[]}>};
async function json(request:Request){
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))throw new SpektrotekTalepError("JSON içerik gerekli.",415);
  const reader=request.body?.getReader();if(!reader)throw new SpektrotekTalepError("İstek gövdesi gerekli.");
  let size=0;const chunks:Uint8Array[]=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();throw new SpektrotekTalepError("İstek çok büyük.",413);}chunks.push(value);}}finally{reader.releaseLock();}
  try{return JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new SpektrotekTalepError("Geçersiz JSON.");}
}
async function handle(request:Request,context:Context){
  const headers={"Cache-Control":"no-store"};
  try{
    const user=await getPortalUser();if(!user)throw new SpektrotekTalepError("Oturum açmanız gerekiyor.",401);
    if(!user.can("iletisim.spektrotek-talep"))throw new SpektrotekTalepError("Bu bölüme erişim yetkiniz yok.",403);
    if(request.method!=="GET"){
      const origin=request.headers.get("origin");
      if(origin){let valid=false;try{valid=new URL(origin).host===(request.headers.get("host")||new URL(request.url).host);}catch{}if(!valid)throw new SpektrotekTalepError("İstek kaynağı doğrulanamadı.",403);}
    }
    const path=(await context.params).path||[];let result:unknown;
    if(request.method==="GET"&&!path.length)result=await listSpektrotekTalepler(new URL(request.url).searchParams);
    else if(request.method==="POST"&&!path.length)result={item:await createSpektrotekTalep(await json(request),user.userName)};
    else if(["PUT","PATCH"].includes(request.method)&&path.length===1&&/^[1-9]\d{0,9}$/.test(path[0]))result={item:await updateSpektrotekTalep(Number(path[0]),await json(request),user.userName,request.method==="PATCH")};
    else throw new SpektrotekTalepError("İşlem bulunamadı.",404);
    return Response.json(result,{status:request.method==="POST"?201:200,headers});
  }catch(error){
    if(error instanceof SpektrotekTalepError)return Response.json({error:error.message},{status:error.status,headers});
    if(error instanceof ZodError)return Response.json({error:"Alanları kontrol edin.",issues:error.issues.map(issue=>({path:issue.path.join("."),message:issue.message}))},{status:400,headers});
    console.error("Spektrotek talep işlemi tamamlanamadı");
    return Response.json({error:"Talep işlemi tamamlanamadı. Lütfen tekrar deneyin."},{status:500,headers});
  }
}
export const GET=handle;
export const POST=handle;
export const PATCH=handle;
export const PUT=handle;
