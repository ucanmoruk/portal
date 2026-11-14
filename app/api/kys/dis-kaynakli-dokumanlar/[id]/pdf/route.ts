import { getPortalUser } from "@/lib/portalYetki";
import { getDisKaynakliPdfRef } from "@/lib/kysDisKaynakliDokumanStore";
import { readDisKaynakliPdf } from "@/lib/kysDisKaynakliFtpUpload";

// Dış kaynaklı doküman PDF'leri lisanslı/telifli olabilir: yalnızca oturum açmış ve yetkili kullanıcılara,
// arama motorlarına kapalı olarak sunulur. Dosyanın herkese açık bir web adresi yoktur.
export const dynamic = "force-dynamic";
const MENU_KEYS = ["laboratuvar.kys.dis-kaynakli-dokuman", "laboratuvar.kys.dokuman-yonetimi"];
const baseHeaders = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow, noarchive", "X-Content-Type-Options": "nosniff" };
const fail = (message: string, status: number) => Response.json({ error: message }, { status, headers: baseHeaders });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return fail("Oturum açmanız gerekiyor.", 401);
  if (!MENU_KEYS.some(key => user.can(key))) return fail("Bu dokümanı görüntüleme yetkiniz yok.", 403);
  try {
    const { id } = await params;
    const docId = Number(id);
    if (!Number.isSafeInteger(docId) || docId <= 0) return fail("Geçersiz doküman ID", 400);
    const ref = await getDisKaynakliPdfRef(docId);
    if (!ref?.pdfPath) return fail("Bu doküman için yüklenmiş PDF yok.", 404);
    const pdf = await readDisKaynakliPdf(ref.pdfPath);
    if (!pdf) return fail("PDF dosyası depolamada bulunamadı.", 404);
    const name = (ref.pdfOriginalName || "dokuman.pdf").replace(/[\r\n"\\]/g, "_");
    const ascii = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/[^\x20-\x7e]/g, "_");
    return new Response(new Uint8Array(pdf), {
      headers: {
        ...baseHeaders,
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.length),
        "Content-Disposition": `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      },
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "PDF alınamadı.", 500);
  }
}
