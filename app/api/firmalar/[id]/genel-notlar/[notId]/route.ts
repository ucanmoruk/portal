import { getPortalUser } from "@/lib/portalYetki";
import { addFirmaGenelNotEkleri, updateFirmaGenelNot } from "@/lib/firmaGenelNotStore";

const fail = (message: string, status: number) => Response.json({ error: message }, { status });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; notId: string }> }) {
  const user = await getPortalUser();
  if (!user) return fail("Yetkisiz erişim", 401);
  const { id, notId } = await params;
  const firmaId = Number(id), noteId = Number(notId);
  if (![firmaId, noteId].every(value => Number.isInteger(value) && value > 0)) return fail("Geçersiz kayıt.", 400);
  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
    if (files.length > 6 || files.some(file => file.size > 10 * 1024 * 1024)) return fail("En fazla 6 dosya; dosya başına 10 MB yüklenebilir.", 400);
    if (files.some(file => !/^(image\/(png|jpeg|webp|gif)|audio\/|application\/pdf$)/.test(file.type))) return fail("Yalnızca PDF, görsel veya ses dosyası eklenebilir.", 400);
    await updateFirmaGenelNot(firmaId, noteId, String(form.get("notMetni") || ""));
    await addFirmaGenelNotEkleri(firmaId, noteId, await Promise.all(files.map(async file => ({ dosyaAdi: file.name.slice(0, 255), mimeType: file.type, data: Buffer.from(await file.arrayBuffer()) }))));
    return Response.json({ ok: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Not güncellenemedi.", 400);
  }
}
