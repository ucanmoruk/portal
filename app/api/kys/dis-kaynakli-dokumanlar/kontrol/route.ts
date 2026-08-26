import { getPortalUser } from "@/lib/portalYetki";
import { markDisKaynakliDokumanChecked } from "@/lib/kysDisKaynakliDokumanStore";

const fail = (message: string, status: number) => Response.json({ error: message }, { status });
const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export async function POST(request: Request) {
  const user = await getPortalUser();
  if (!user) return fail("Yetkisiz erişim", 401);
  if (!user.can("laboratuvar.kys.dis-kaynakli-dokuman.kontrol")) {
    return fail("Dış kaynaklı doküman kontrol yetkiniz yok.", 403);
  }

  try {
    const body = await request.json();
    const result = await markDisKaynakliDokumanChecked(body.ids || [], {
      userId: user.userId,
      userName: user.userName,
    });
    return Response.json(result);
  } catch (e: unknown) {
    return fail(errorText(e, "Kontrol kaydı oluşturulamadı."), 400);
  }
}
