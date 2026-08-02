import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getKysCertificateFile } from "@/lib/kysStore";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const { id } = await params;
    const file = await getKysCertificateFile(Number(id));
    if (!file) return Response.json({ error: "Sertifika bulunamadı" }, { status: 404 });
    const data = Buffer.isBuffer(file.FileData) ? file.FileData : Buffer.from(file.FileData);
    return new Response(data, {
      headers: {
        "Content-Type": file.MimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file.DosyaAdi || "sertifika")}"`,
      },
    });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Sertifika indirilemedi." }, { status: 500 });
  }
}
