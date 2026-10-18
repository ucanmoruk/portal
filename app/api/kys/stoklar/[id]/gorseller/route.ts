import { getPortalUser } from "@/lib/portalYetki";
import { addKysStockPhoto, getKysStockSource } from "@/lib/kysStockGallery";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Geçersiz stok kimliği" }, { status: 400 });
    const source = await getKysStockSource(id);
    if (!source) return Response.json({ error: "Stok kartı bulunamadı" }, { status: 404 });
    if (!user.firmalar.includes(source)) return Response.json({ error: "Bu ürün için yetkiniz yok." }, { status: 403 });
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) return Response.json({ error: "Görsel dosyası zorunludur." }, { status: 400 });
    if (file.size > 5 * 1024 * 1024) return Response.json({ error: "Görsel en fazla 5 MB olabilir." }, { status: 400 });
    const photoId = await addKysStockPhoto(id, { fileName: file.name, mimeType: file.type, data: Buffer.from(await file.arrayBuffer()) });
    return Response.json({ id: photoId }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Görsel yüklenemedi." }, { status: 400 });
  }
}
