import { getPortalUser } from "@/lib/portalYetki";
import { dokumanYetkileri } from "@/lib/kysDokumanYetki";
import { createKysDokuman, listKysDokumanlar, nextDokumanKodu } from "@/lib/kysDokumanStore";

const fail = (message: string, status: number) => Response.json({ error: message }, { status });
const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

// GET /api/kys/dokumanlar?search=&tur=&durum=&sort=&page=&limit=
// GET /api/kys/dokumanlar?nextKod=Prosedür  → sıradaki doküman kodunu döner
export async function GET(request: Request) {
  const user = await getPortalUser();
  if (!user) return fail("Yetkisiz erişim", 401);
  const yetki = dokumanYetkileri(user);
  if (!yetki.goruntule) return fail("Bu bölümü görüntüleme yetkiniz yok.", 403);

  const url = new URL(request.url);
  try {
    const nextKod = url.searchParams.get("nextKod");
    if (nextKod !== null) {
      return Response.json({ kod: await nextDokumanKodu(nextKod) });
    }

    const result = await listKysDokumanlar({
      search: url.searchParams.get("search") || "",
      tur: url.searchParams.get("tur") || "",
      durum: url.searchParams.get("durum") || "",
      sort: url.searchParams.get("sort") || "",
      page: Number(url.searchParams.get("page") || 1),
      limit: Number(url.searchParams.get("limit") || 25),
    });
    return Response.json({ ...result, yetki });
  } catch (e: unknown) {
    return fail(errorText(e, "Doküman listesi alınamadı."), 500);
  }
}

// POST /api/kys/dokumanlar
export async function POST(request: Request) {
  const user = await getPortalUser();
  if (!user) return fail("Yetkisiz erişim", 401);
  if (!dokumanYetkileri(user).olustur) return fail("Doküman oluşturma yetkiniz yok.", 403);

  try {
    const body = await request.json();
    const created = await createKysDokuman(body, { userId: user.userId, userName: user.userName });
    return Response.json(created, { status: 201 });
  } catch (e: unknown) {
    return fail(errorText(e, "Doküman kaydedilemedi."), 400);
  }
}
