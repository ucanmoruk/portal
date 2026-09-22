import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getKysStockDetail, updateKysStock } from "@/lib/kysStore";
import { getPortalUser } from "@/lib/portalYetki";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const { id } = await params;
    const detail = await getKysStockDetail(Number(id));
    if (!detail) return Response.json({ error: "Stok kartı bulunamadı" }, { status: 404 });
    const user = await getPortalUser();
    const firma = detail.stock.malzemeTuru === "Spektrotek" ? "Spektrotek" : "Unique";
    if (!user?.firmalar.includes(firma)) return Response.json({ error: "Bu firmanın stok kartını görüntüleme yetkiniz yok." }, { status: 403 });
    return Response.json(detail);
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Stok detayı alınamadı." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const { id } = await params;
    const user = await getPortalUser();
    const current = await getKysStockDetail(Number(id));
    if (!current) return Response.json({ error: "Stok kartı bulunamadı" }, { status: 404 });
    const body = await request.json();
    const currentFirma = current.stock.malzemeTuru === "Spektrotek" ? "Spektrotek" : "Unique";
    const nextFirma = body.malzemeTuru === "Spektrotek" ? "Spektrotek" : "Unique";
    if (!user?.firmalar.includes(currentFirma) || !user.firmalar.includes(nextFirma))
      return Response.json({ error: "Bu firma için stok düzenleme yetkiniz yok." }, { status: 403 });
    await updateKysStock(Number(id), body);
    return Response.json({ ok: true });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Stok güncellenemedi." }, { status: 500 });
  }
}
