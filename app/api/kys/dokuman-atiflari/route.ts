import { getPortalUser } from "@/lib/portalYetki";
import { dokumanYetkileri } from "@/lib/kysDokumanYetki";
import { listKysDokumanAtiflari } from "@/lib/kysDokumanStore";

const fail = (message: string, status: number) => Response.json({ error: message }, { status });

export async function GET() {
  const user = await getPortalUser();
  if (!user) return fail("Yetkisiz erişim", 401);
  if (!dokumanYetkileri(user).goruntule) return fail("Bu bölümü görüntüleme yetkiniz yok.", 403);
  try {
    return Response.json(await listKysDokumanAtiflari());
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : "Doküman atıfları alınamadı.", 500);
  }
}
