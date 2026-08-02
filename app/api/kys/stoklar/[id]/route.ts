import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getKysStockDetail, updateKysStock } from "@/lib/kysStore";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const { id } = await params;
    const detail = await getKysStockDetail(Number(id));
    if (!detail) return Response.json({ error: "Stok kartı bulunamadı" }, { status: 404 });
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
    await updateKysStock(Number(id), await request.json());
    return Response.json({ ok: true });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Stok güncellenemedi." }, { status: 500 });
  }
}
