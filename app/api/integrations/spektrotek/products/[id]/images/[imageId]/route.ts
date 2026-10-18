import { assertSpektrotekKey, getSpektrotekProductImage, IntegrationError } from "@/lib/spektrotekIntegration";

type Context = { params: Promise<{ id: string; imageId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    assertSpektrotekKey(request);
    const params = await context.params;
    const id = Number(params.id), imageId = Number(params.imageId);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(imageId) || imageId < 0) return Response.json({ error: "Geçersiz kimlik" }, { status: 400 });
    const image = await getSpektrotekProductImage(id, imageId);
    if (!image) return Response.json({ error: "Görsel bulunamadı" }, { status: 404 });
    return new Response(Buffer.from(image.DosyaData), { headers: {
      "Content-Type": image.MimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(image.DosyaAdi || `urun-${id}`)}"`,
      "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store",
    } });
  } catch (error) {
    if (error instanceof IntegrationError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Spektrotek product image failed:", error);
    return Response.json({ error: "Görsel alınamadı." }, { status: 500 });
  }
}
