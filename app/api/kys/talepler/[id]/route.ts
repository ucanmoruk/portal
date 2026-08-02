import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getKysRequestDetail, updateKysRequestStatus } from "@/lib/kysStore";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const { id } = await params;
    const detail = await getKysRequestDetail(Number(id));
    if (!detail) return Response.json({ error: "Talep bulunamadı" }, { status: 404 });
    return Response.json(detail);
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Talep detayı alınamadı." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();
    await updateKysRequestStatus(Number(id), {
      durum: body.durum,
      userId: (session.user as { userId?: string })?.userId || null,
      userName: session.user?.name || null,
    });
    return Response.json({ ok: true });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Talep güncellenemedi." }, { status: 500 });
  }
}
