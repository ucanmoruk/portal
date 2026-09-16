import { getPortalUser } from "@/lib/portalYetki";
import {
  listKysSuppliers,
  removeKysSupplier,
  saveKysSupplier,
} from "@/lib/kysPurchaseWorkflow";
const KEY = "laboratuvar.kys.tedarikci-listesi";
export async function GET(request: Request) {
  const user = await getPortalUser();
  if (!user)
    return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  if (!user.can(KEY) && !user.can("laboratuvar.kys.satin-alma-gecmisi"))
    return Response.json({ error: "Yetkiniz yok." }, { status: 403 });
  const sp = new URL(request.url).searchParams;
  try {
    return Response.json({
      data: await listKysSuppliers(
        sp.get("search") || "",
        user.can(KEY) && sp.get("all") === "1",
      ),
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Tedarikçiler alınamadı." },
      { status: 500 },
    );
  }
}
export async function POST(request: Request) {
  const user = await getPortalUser();
  if (!user)
    return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  if (!user.can(KEY))
    return Response.json({ error: "Yetkiniz yok." }, { status: 403 });
  try {
    const body = await request.json();
    return Response.json({
      id: await saveKysSupplier(body, body.ID ? Number(body.ID) : undefined),
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Kaydedilemedi." },
      { status: 400 },
    );
  }
}
export async function DELETE(request: Request) {
  const user = await getPortalUser();
  if (!user)
    return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  if (!user.can(KEY))
    return Response.json({ error: "Yetkiniz yok." }, { status: 403 });
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Geçersiz ID");
    await removeKysSupplier(id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Silinemedi." },
      { status: 400 },
    );
  }
}
