import { getPortalUser } from "@/lib/portalYetki";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getLabScope } from "@/lib/labResultAccess";
import { changeLabFlow, listLabFlow, saveQualityWork } from "@/lib/labAkisStore";
import { validFlowDate } from "@/lib/labAkisTypes";

async function context() {
  const user = await getPortalUser();
  if (!user) return { error: Response.json({ error:"Yetkisiz erişim." },{ status:401 }) };
  if (!user.isAdmin && !user.can("laboratuvar.kys") && !user.can("laboratuvar.kys.iletisim") && !user.keys.some(key => key.startsWith("laboratuvar.kys."))) return { error:Response.json({ error:"Bu bölüme erişim yetkiniz yok." },{ status:403 }) };
  const session = await getServerSession(authOptions);
  if (!session) return { error:Response.json({ error:"Yetkisiz erişim." },{ status:401 }) };
  const scope = await getLabScope(session);
  if (scope.denied) return { error:Response.json({ error:"Aktif laboratuvar erişiminiz bulunamadı." },{ status:403 }) };
  return { user, scope };
}
export async function GET(request: Request) {
  try {
    const ctx = await context(); if (ctx.error) return ctx.error;
    const params = new URL(request.url).searchParams;
    const from = validFlowDate(params.get("from")); const to = validFlowDate(params.get("to"));
    if (from > to || new Date(to).getTime()-new Date(from).getTime() > 370*86400000) throw new Error("En fazla bir yıllık tarih aralığı seçin.");
    return Response.json(await listLabFlow(ctx.scope,from,to));
  } catch (error) { return Response.json({ error:error instanceof Error ? error.message : "Lab akışı alınamadı." },{ status:400 }); }
}
export async function POST(request: Request) {
  try { const ctx = await context(); if (ctx.error) return ctx.error; await saveQualityWork(await request.json(),ctx.user.userId); return Response.json({ ok:true },{ status:201 }); }
  catch (error) { return Response.json({ error:error instanceof Error ? error.message : "Kalite işi kaydedilemedi." },{ status:400 }); }
}
export async function PATCH(request: Request) {
  try { const ctx = await context(); if (ctx.error) return ctx.error; await changeLabFlow(await request.json(),ctx.scope,ctx.user.userId); return Response.json({ ok:true }); }
  catch (error) { return Response.json({ error:error instanceof Error ? error.message : "İşlem tamamlanamadı." },{ status:400 }); }
}
