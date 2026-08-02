import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createKysStockMovement } from "@/lib/kysStore";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();
    const hareketId = await createKysStockMovement(Number(id), {
      ...body,
      kullaniciId: (session.user as { userId?: string })?.userId || null,
      kullaniciAd: session.user?.name || null,
    });
    return Response.json({ id: hareketId }, { status: 201 });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Stok hareketi kaydedilemedi." }, { status: 500 });
  }
}
