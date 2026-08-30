import { getPortalUser } from "@/lib/portalYetki";
import { dokumanYetkileri } from "@/lib/kysDokumanYetki";
import { getKysDokumanDosya } from "@/lib/kysDokumanStore";

const fail = (message: string, status: number) => new Response(message, { status });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return fail("Yetkisiz erişim", 401);
  if (!dokumanYetkileri(user).goruntule) return fail("Bu bölümü görüntüleme yetkiniz yok.", 403);

  const { id } = await params;
  const file = await getKysDokumanDosya(Number(id));
  if (!file) return fail("Doküman dosyası bulunamadı.", 404);

  const download = new URL(request.url).searchParams.get("download") === "1" || file.type !== "application/pdf";
  const asciiName = file.name.replace(/[^\x20-\x7E]+/g, "_").replace(/["\\]/g, "_");
  return new Response(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "Content-Length": String(file.size),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
