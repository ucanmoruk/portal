import { getPortalUser } from "@/lib/portalYetki";
import { dokumanYetkileri } from "@/lib/kysDokumanYetki";
import { deleteKysDokuman, getKysDokuman, updateKysDokuman } from "@/lib/kysDokumanStore";

const fail = (message: string, status: number) => Response.json({ error: message }, { status });
const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return fail("Yetkisiz erişim", 401);
  const yetki = dokumanYetkileri(user);
  if (!yetki.goruntule) return fail("Bu bölümü görüntüleme yetkiniz yok.", 403);

  try {
    const { id } = await params;
    const dokuman = await getKysDokuman(Number(id));
    if (!dokuman) return fail("Doküman bulunamadı.", 404);
    return Response.json({ data: dokuman, yetki });
  } catch (e: unknown) {
    return fail(errorText(e, "Doküman alınamadı."), 500);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return fail("Yetkisiz erişim", 401);
  if (!dokumanYetkileri(user).duzenle) return fail("Doküman düzenleme yetkiniz yok.", 403);

  try {
    const { id } = await params;
    const body = await request.json();
    await updateKysDokuman(Number(id), body, { userId: user.userId, userName: user.userName });
    return Response.json({ ok: true });
  } catch (e: unknown) {
    return fail(errorText(e, "Doküman güncellenemedi."), 400);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return fail("Yetkisiz erişim", 401);
  if (!dokumanYetkileri(user).sil) return fail("Doküman silme yetkiniz yok.", 403);

  try {
    const { id } = await params;
    await deleteKysDokuman(Number(id), { userId: user.userId, userName: user.userName });
    return Response.json({ ok: true });
  } catch (e: unknown) {
    return fail(errorText(e, "Doküman silinemedi."), 400);
  }
}
