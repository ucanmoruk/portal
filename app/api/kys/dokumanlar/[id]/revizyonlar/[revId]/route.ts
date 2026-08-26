import { getPortalUser } from "@/lib/portalYetki";
import { dokumanYetkileri } from "@/lib/kysDokumanYetki";
import { getKysDokumanRevizyonIcerik } from "@/lib/kysDokumanStore";

const fail = (message: string, status: number) => Response.json({ error: message }, { status });

// GET /api/kys/dokumanlar/:id/revizyonlar/:revId → o revizyonun içerik anlık görüntüsü
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; revId: string }> }) {
  const user = await getPortalUser();
  if (!user) return fail("Yetkisiz erişim", 401);
  if (!dokumanYetkileri(user).goruntule) return fail("Bu bölümü görüntüleme yetkiniz yok.", 403);

  try {
    const { id, revId } = await params;
    const data = await getKysDokumanRevizyonIcerik(Number(id), Number(revId));
    if (!data) return fail("Revizyon bulunamadı.", 404);
    return Response.json({ data });
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : "Revizyon alınamadı.", 500);
  }
}
