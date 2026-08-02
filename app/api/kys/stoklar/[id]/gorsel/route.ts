import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getKysStockImage, updateKysStockImage } from "@/lib/kysStore";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const { id } = await params;
    const image = await getKysStockImage(Number(id));
    if (!image) return Response.json({ error: "Görsel bulunamadı" }, { status: 404 });
    const data = Buffer.isBuffer(image.GorselData) ? image.GorselData : Buffer.from(image.GorselData);
    return new Response(data, {
      headers: {
        "Content-Type": image.GorselMimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(image.GorselDosyaAdi || "stok-gorseli")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Görsel alınamadı." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const { id } = await params;
    const fd = await request.formData();
    const file = fd.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Görsel dosyası zorunludur." }, { status: 400 });
    if (!file.type.startsWith("image/")) return Response.json({ error: "Sadece görsel dosyası yüklenebilir." }, { status: 400 });
    if (file.size > 5 * 1024 * 1024) return Response.json({ error: "Görsel 5 MB'dan küçük olmalıdır." }, { status: 400 });

    await updateKysStockImage(Number(id), {
      fileName: file.name || "stok-gorseli",
      mimeType: file.type || "application/octet-stream",
      data: Buffer.from(await file.arrayBuffer()),
    });
    return Response.json({ ok: true });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Görsel yüklenemedi." }, { status: 500 });
  }
}
