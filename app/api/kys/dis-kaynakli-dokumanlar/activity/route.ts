import { getPortalUser } from "@/lib/portalYetki";
import { listDisKaynakliDokumanActivity } from "@/lib/kysDisKaynakliDokumanStore";

export async function GET(request: Request) {
  const user = await getPortalUser();
  if (!user) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  if (!user.can("laboratuvar.kys.dis-kaynakli-dokuman")) return Response.json({ error: "Bu bölümü görüntüleme yetkiniz yok." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  try {
    return Response.json(await listDisKaynakliDokumanActivity({ search: params.get("search") || "", islem: params.get("islem") || "", page: Number(params.get("page") || 1) }));
  } catch { return Response.json({ error: "Değişiklik kayıtları alınamadı." }, { status: 500 }); }
}
