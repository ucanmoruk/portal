import { getPortalUser } from "@/lib/portalYetki";
import { getFirmaNotDetay } from "@/lib/musteriNotStore";

const fail = (message: string, status: number) => Response.json({ error: message }, { status });
const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getPortalUser();
  if (!user) return fail("Yetkisiz erişim", 401);

  const { id } = await params;
  const firmaId = Number(id);
  if (!Number.isInteger(firmaId) || firmaId <= 0) return fail("Geçersiz firma ID", 400);

  try {
    const data = await getFirmaNotDetay(firmaId);
    if (!data) return fail("Firma bulunamadı.", 404);
    return Response.json({ data });
  } catch (e: unknown) {
    return fail(errorText(e, "Firma bilgileri alınamadı."), 500);
  }
}
