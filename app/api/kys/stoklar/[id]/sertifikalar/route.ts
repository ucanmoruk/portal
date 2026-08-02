import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { addKysCertificate } from "@/lib/kysStore";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const { id } = await params;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Dosya zorunludur." }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const certId = await addKysCertificate({
      stokId: Number(id),
      hareketId: form.get("hareketId") ? Number(form.get("hareketId")) : null,
      dosyaAdi: file.name,
      mimeType: file.type,
      fileData: buffer,
      yukleyenId: (session.user as { userId?: string })?.userId || null,
      yukleyenAd: session.user?.name || null,
    });
    return Response.json({ id: certId }, { status: 201 });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Sertifika yüklenemedi." }, { status: 500 });
  }
}
