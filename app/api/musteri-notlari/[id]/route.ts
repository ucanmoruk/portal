import { getPortalUser } from "@/lib/portalYetki";
import { updateMusteriNotStatus } from "@/lib/musteriNotStore";

const fail = (message: string, status: number) => Response.json({ error: message }, { status });
const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getPortalUser();
  if (!user) return fail("Yetkisiz erişim", 401);

  const { id } = await params;
  const noteId = Number(id);
  if (!Number.isInteger(noteId) || noteId <= 0) return fail("Geçersiz not ID", 400);

  try {
    const body = await request.json();
    return Response.json(await updateMusteriNotStatus(noteId, body.durum, {
      userId: user.userId,
      userName: user.userName,
    }));
  } catch (e: unknown) {
    return fail(errorText(e, "Not durumu güncellenemedi."), 400);
  }
}
