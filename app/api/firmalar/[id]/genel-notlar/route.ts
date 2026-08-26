import { getPortalUser } from "@/lib/portalYetki";
import { createFirmaGenelNot, listFirmaGenelNotlar } from "@/lib/firmaGenelNotStore";

const fail = (message: string, status: number) => Response.json({ error: message }, { status });
const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return fail("Yetkisiz erişim", 401);

  const { id } = await params;
  const firmaId = Number(id);
  if (!Number.isInteger(firmaId) || firmaId <= 0) return fail("Geçersiz firma ID", 400);

  try {
    return Response.json({ data: await listFirmaGenelNotlar(firmaId) });
  } catch (e: unknown) {
    return fail(errorText(e, "Notlar alınamadı."), 500);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return fail("Yetkisiz erişim", 401);

  const { id } = await params;
  const firmaId = Number(id);
  if (!Number.isInteger(firmaId) || firmaId <= 0) return fail("Geçersiz firma ID", 400);

  try {
    const body = await request.json();
    const created = await createFirmaGenelNot(firmaId, String(body?.notMetni || ""), {
      userId: user.userId,
      userName: user.userName,
    });
    return Response.json(created, { status: 201 });
  } catch (e: unknown) {
    return fail(errorText(e, "Not kaydedilemedi."), 400);
  }
}
