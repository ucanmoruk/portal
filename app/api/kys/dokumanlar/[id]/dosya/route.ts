import { getPortalUser } from "@/lib/portalYetki";
import { dokumanYetkileri } from "@/lib/kysDokumanYetki";
import path from "node:path";
import { getKysDokuman, getKysDokumanDosya, saveKysDokumanDosya } from "@/lib/kysDokumanStore";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  if (!dokumanYetkileri(user).duzenle) return Response.json({ error: "Doküman düzenleme yetkiniz yok." }, { status: 403 });
  try {
    const { id } = await params;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Yüklenecek dosyayı seçin.");
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const mimeTypes: Record<string, string> = {
      pdf: "application/pdf", doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
    if (!mimeTypes[extension]) throw new Error("Yalnızca PDF, Word veya Excel dosyası yüklenebilir.");
    if (file.size > 20 * 1024 * 1024) throw new Error("Dosya boyutu en fazla 20 MB olabilir.");
    await saveKysDokumanDosya(Number(id), {
      name: file.name.replace(/[<>:"/\\|?*\x00-\x1f]+/g, "_").slice(0, 260),
      type: mimeTypes[extension], size: file.size, buffer: Buffer.from(await file.arrayBuffer()),
    }, { userId: user.userId, userName: user.userName });
    return Response.json({ ok: true });
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : "Dosya yüklenemedi." }, { status: 400 });
  }
}

const fail = (message: string, status: number) => new Response(message, { status });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return fail("Yetkisiz erişim", 401);
  if (!dokumanYetkileri(user).goruntule) return fail("Bu bölümü görüntüleme yetkiniz yok.", 403);

  const { id } = await params;
  const documentId = Number(id);
  const [file, document] = await Promise.all([
    getKysDokumanDosya(documentId),
    getKysDokuman(documentId),
  ]);
  if (!file) return fail("Doküman dosyası bulunamadı.", 404);

  const download = new URL(request.url).searchParams.get("download") === "1" || file.type !== "application/pdf";
  const extension = path.extname(file.name);
  const requestedName = document
    ? `${document.kod} ${document.baslik}${extension}`
    : file.name;
  const fileName = requestedName.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, " ").trim();
  const asciiName = fileName.normalize("NFKD").replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return new Response(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "Content-Length": String(file.size),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
