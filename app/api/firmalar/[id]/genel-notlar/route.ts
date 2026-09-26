import { getPortalUser } from "@/lib/portalYetki";
import { addFirmaGenelNotEkleri, createFirmaGenelNot, listFirmaGenelNotlar } from "@/lib/firmaGenelNotStore";

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
    const form = await request.formData();
    const files = form.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
    if (files.length > 6) return fail("Bir nota en fazla 6 dosya eklenebilir.", 400);
    if (files.some(file => file.size > 10 * 1024 * 1024)) return fail("Her dosya en fazla 10 MB olabilir.", 400);
    const allowed = /^(image\/(png|jpeg|webp|gif)|audio\/|application\/pdf$)/;
    if (files.some(file => !allowed.test(file.type))) return fail("Yalnızca PDF, görsel veya ses dosyası eklenebilir.", 400);
    const created = await createFirmaGenelNot(firmaId, String(form.get("notMetni") || ""), {
      userId: user.userId,
      userName: user.userName,
    });
    await addFirmaGenelNotEkleri(firmaId, created.id, await Promise.all(files.map(async file => ({
      dosyaAdi: file.name.slice(0, 255), mimeType: file.type, data: Buffer.from(await file.arrayBuffer()),
    }))));
    return Response.json(created, { status: 201 });
  } catch (e: unknown) {
    return fail(errorText(e, "Not kaydedilemedi."), 400);
  }
}
