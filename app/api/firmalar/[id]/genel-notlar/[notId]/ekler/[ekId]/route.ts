import { getPortalUser } from "@/lib/portalYetki";
import { deleteFirmaGenelNotEk, getFirmaGenelNotEk } from "@/lib/firmaGenelNotStore";

const fail = (message: string, status: number) => Response.json({ error: message }, { status });
const ids = (values: string[]) => values.map(Number).every(value => Number.isInteger(value) && value > 0);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; notId: string; ekId: string }> }) {
  const user = await getPortalUser(); if (!user) return fail("Yetkisiz erişim", 401);
  const { id, notId, ekId } = await params; if (!ids([id, notId, ekId])) return fail("Geçersiz kayıt.", 400);
  const file = await getFirmaGenelNotEk(Number(id), Number(notId), Number(ekId));
  if (!file) return fail("Dosya bulunamadı.", 404);
  const name = String(file.DosyaAdi ?? file.dosyaadi ?? "dosya").replace(/[\r\n"]/g, "_");
  return new Response(file.FileData ?? file.filedata, { headers: { "Content-Type": String(file.MimeType ?? file.mimetype ?? "application/octet-stream"), "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}` } });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; notId: string; ekId: string }> }) {
  const user = await getPortalUser(); if (!user) return fail("Yetkisiz erişim", 401);
  const { id, notId, ekId } = await params; if (!ids([id, notId, ekId])) return fail("Geçersiz kayıt.", 400);
  try { await deleteFirmaGenelNotEk(Number(id), Number(notId), Number(ekId)); return Response.json({ ok: true }); }
  catch (error) { return fail(error instanceof Error ? error.message : "Dosya silinemedi.", 400); }
}
