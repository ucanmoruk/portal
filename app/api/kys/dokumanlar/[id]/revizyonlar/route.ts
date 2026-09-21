import { getPortalUser } from "@/lib/portalYetki";
import { dokumanYetkileri } from "@/lib/kysDokumanYetki";
import { addKysDokumanManualRevizyon } from "@/lib/kysDokumanStore";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  if (!dokumanYetkileri(user).duzenle) return Response.json({ error: "Doküman düzenleme yetkiniz yok." }, { status: 403 });
  try {
    const { id } = await params;
    await addKysDokumanManualRevizyon(Number(id), await request.json(), { userId: user.userId, userName: user.userName });
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Geçmiş revizyon eklenemedi." }, { status: 400 });
  }
}
