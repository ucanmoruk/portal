import { getPortalUser } from "@/lib/portalYetki";
import { dokumanYetkileri } from "@/lib/kysDokumanYetki";
import { listKysDokumanlar } from "@/lib/kysDokumanStore";
import { listDisKaynakliDokumanlar } from "@/lib/kysDisKaynakliDokumanStore";

export async function GET(request: Request) {
  const user = await getPortalUser();
  if (!user) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  if (!dokumanYetkileri(user).goruntule) return Response.json({ error: "Doküman görüntüleme yetkiniz yok." }, { status: 403 });
  const query = new URL(request.url).searchParams.get("search")?.trim() || "";
  if (query.length < 2) return Response.json({ internal: [], external: [] });
  try {
    const [internal, external] = await Promise.all([
      listKysDokumanlar({ search: query, sort: "kod-asc", page: 1, limit: 30 }),
      listDisKaynakliDokumanlar({ search: query, sort: "kod-asc", page: 1, limit: 30 }),
    ]);
    return Response.json({ internal: internal.data, external: external.data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Doküman araması yapılamadı." }, { status: 500 });
  }
}
