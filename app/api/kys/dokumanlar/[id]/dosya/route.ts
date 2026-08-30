import { getPortalUser } from "@/lib/portalYetki";
import { dokumanYetkileri } from "@/lib/kysDokumanYetki";
import path from "node:path";
import { getKysDokuman, getKysDokumanDosya } from "@/lib/kysDokumanStore";

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
