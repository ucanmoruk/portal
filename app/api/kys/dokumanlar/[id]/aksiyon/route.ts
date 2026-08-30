import { getPortalUser } from "@/lib/portalYetki";
import { aksiyonaIzinVar } from "@/lib/kysDokumanYetki";
import { AKSIYON_KURALLARI, runKysDokumanAksiyon, type DokumanAksiyon } from "@/lib/kysDokumanStore";

const fail = (message: string, status: number) => Response.json({ error: message }, { status });
const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

// POST /api/kys/dokumanlar/:id/aksiyon  { aksiyon, aciklama?, yururlukTarihi? }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return fail("Yetkisiz erişim", 401);

  try {
    const { id } = await params;
    const body = await request.json();
    const aksiyon = String(body?.aksiyon || "") as DokumanAksiyon;
    const kural = AKSIYON_KURALLARI[aksiyon];
    if (!kural) return fail("Geçersiz işlem.", 400);
    if (!aksiyonaIzinVar(user, kural.yetkiKeys)) {
      return fail("Bu işlem için yetkiniz yok.", 403);
    }

    const result = await runKysDokumanAksiyon(
      Number(id),
      aksiyon,
      { maddeNo: body?.maddeNo, aciklama: body?.aciklama, yururlukTarihi: body?.yururlukTarihi },
      { userId: user.userId, userName: user.userName },
    );
    return Response.json(result);
  } catch (e: unknown) {
    return fail(errorText(e, "İşlem tamamlanamadı."), 400);
  }
}
