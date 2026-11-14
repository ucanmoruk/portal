import { getPortalUser } from "@/lib/portalYetki";
import { loadEurolabAccess, canEdit } from "@/lib/eurolabAccess";
import { withUniqueAnalysis } from "@/lib/analysisScope";
import { ensureUniqueAnalysis } from "@/lib/uniqueAnalysis";
export async function uniqueAnalysisRoute(request: Request, permission: string, handler: () => Promise<Response>) {
 const user = await getPortalUser();
 if (!user) return Response.json({ error: "Oturum açın." }, { status: 401 });
 if (!user.can(permission) && !user.can("eurolab")) return Response.json({ error: "Yetkiniz yok." }, { status: 403 });
 if (!["GET", "HEAD"].includes(request.method) && !canEdit(await loadEurolabAccess(), permission)) return Response.json({ error: "Düzenleme yetkiniz yok." }, { status: 403 });
 try { return await withUniqueAnalysis(async () => { await ensureUniqueAnalysis(); return handler(); }); }
 catch { return Response.json({ error: "Unique analiz kayıtları yüklenemedi." }, { status: 500 }); }
}
