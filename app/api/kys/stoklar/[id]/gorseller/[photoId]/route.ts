import { getPortalUser } from "@/lib/portalYetki";
import { editKysStockPhoto, getKysStockPhoto, getKysStockSource } from "@/lib/kysStockGallery";

type Context = { params: Promise<{ id: string; photoId: string }> };

async function access(context: Context) {
  const user = await getPortalUser();
  if (!user) return { error: Response.json({ error: "Yetkisiz erişim" }, { status: 401 }) };
  const params = await context.params;
  const id = Number(params.id), photoId = Number(params.photoId);
  if (![id, photoId].every(value => Number.isInteger(value) && value > 0)) return { error: Response.json({ error: "Geçersiz kimlik" }, { status: 400 }) };
  const source = await getKysStockSource(id);
  if (!source) return { error: Response.json({ error: "Stok kartı bulunamadı" }, { status: 404 }) };
  if (!user.firmalar.includes(source)) return { error: Response.json({ error: "Bu ürün için yetkiniz yok." }, { status: 403 }) };
  return { id, photoId };
}

export async function GET(_request: Request, context: Context) {
  try {
    const result = await access(context);
    if (result.error) return result.error;
    const photo = await getKysStockPhoto(result.id!, result.photoId!);
    if (!photo) return Response.json({ error: "Görsel bulunamadı" }, { status: 404 });
    return new Response(Buffer.from(photo.DosyaData), { headers: {
      "Content-Type": photo.MimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(photo.DosyaAdi)}"`,
      "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store",
    } });
  } catch { return Response.json({ error: "Görsel alınamadı." }, { status: 500 }); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const result = await access(context);
    if (result.error) return result.error;
    await editKysStockPhoto(result.id!, result.photoId!, await request.json());
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Görsel güncellenemedi." }, { status: 400 }); }
}
