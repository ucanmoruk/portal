import { listKysPurchases, updateKysPurchase } from "@/lib/kysStore";
import { getPortalUser } from "@/lib/portalYetki";

const MENU_KEY = "laboratuvar.kys.satin-alma-gecmisi";

export async function GET(request: Request) {
  const user = await getPortalUser();
  if (!user) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  if (!user.can(MENU_KEY)) return Response.json({ error: "Satın alma geçmişini görüntüleme yetkiniz yok." }, { status: 403 });

  try {
    const url = new URL(request.url);
    const result = await listKysPurchases({
      search: url.searchParams.get("search") || "",
      page: Number(url.searchParams.get("page") || 1),
      limit: Number(url.searchParams.get("limit") || 25),
      allowedFirmalar: user.firmalar,
    });
    return Response.json(result);
  } catch (error: unknown) {
    return Response.json({ error: error instanceof Error ? error.message : "Satın alma geçmişi alınamadı." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getPortalUser();
  if (!user) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  if (!user.can(MENU_KEY)) return Response.json({ error: "Satın alma kaydını düzenleme yetkiniz yok." }, { status: 403 });
  try {
    const body = await request.json();
    return Response.json(await updateKysPurchase(Number(body.id), body, user));
  } catch (error: unknown) {
    return Response.json({ error: error instanceof Error ? error.message : "Satın alma kaydı güncellenemedi." }, { status: 400 });
  }
}
