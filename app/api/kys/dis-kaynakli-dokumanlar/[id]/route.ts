import { randomUUID } from "crypto";
import { getPortalUser } from "@/lib/portalYetki";
import {
  deleteDisKaynakliDokuman,
  getDisKaynakliDokuman,
  updateDisKaynakliDokuman,
} from "@/lib/kysDisKaynakliDokumanStore";
import { deleteDisKaynakliPdfFromFtp, safePdfName, uploadDisKaynakliPdfToFtp } from "@/lib/kysDisKaynakliFtpUpload";

const fail = (message: string, status: number) => Response.json({ error: message }, { status });
const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);
const MENU_KEY = "laboratuvar.kys.dis-kaynakli-dokuman";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return fail("Yetkisiz erişim", 401);
  if (!user.can(MENU_KEY)) return fail("Bu bölümü görüntüleme yetkiniz yok.", 403);

  try {
    const { id } = await params;
    const doc = await getDisKaynakliDokuman(Number(id));
    if (!doc) return fail("Doküman bulunamadı.", 404);
    return Response.json({ data: doc });
  } catch (e: unknown) {
    return fail(errorText(e, "Doküman alınamadı."), 500);
  }
}

// PATCH: multipart/form-data — PDF alanı doluysa dosyayı da değiştirir, boşsa
// mevcut PDF korunur (POST ile aynı alan adları, "pdf" opsiyonel).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return fail("Yetkisiz erişim", 401);
  if (!user.can(MENU_KEY)) return fail("Bu dokümanı düzenleme yetkiniz yok.", 403);

  try {
    const { id } = await params;
    const docId = Number(id);
    if (!Number.isInteger(docId) || docId <= 0) return fail("Geçersiz doküman ID", 400);

    const formData = await request.formData();
    const file = formData.get("pdf");

    let pdfPath: string | undefined;
    let pdfOriginalName: string | undefined;
    if (file instanceof File && file.size > 0) {
      if (file.type && file.type !== "application/pdf") return fail("Sadece PDF dosyası yüklenebilir.", 400);
      const originalName = safePdfName(file.name || "dokuman.pdf");
      const fileName = `${Date.now()}-${randomUUID()}-${originalName}`;
      const uploaded = await uploadDisKaynakliPdfToFtp({
        pdfBuffer: Buffer.from(await file.arrayBuffer()),
        fileName,
      });
      pdfPath = uploaded.publicUrl;
      pdfOriginalName = file.name || originalName;
    }

    const result = await updateDisKaynakliDokuman(docId, {
      akreditasyon: formData.get("akreditasyon") === "1",
      dokumanKodu: String(formData.get("dokumanKodu") || ""),
      dokumanAdi: String(formData.get("dokumanAdi") || ""),
      yayincisi: String(formData.get("yayincisi") || ""),
      yayinTarihi: String(formData.get("yayinTarihi") || ""),
      yayinLinki: String(formData.get("yayinLinki") || ""),
      ...(pdfPath ? { pdfPath, pdfOriginalName } : {}),
    });

    // PDF gerçekten değiştiyse eski dosyayı FTP'den temizle (best-effort, sessiz).
    if (result.previousPdfPath) {
      await deleteDisKaynakliPdfFromFtp(result.previousPdfPath);
    }

    return Response.json({ ok: true });
  } catch (e: unknown) {
    return fail(errorText(e, "Doküman güncellenemedi."), 400);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return fail("Yetkisiz erişim", 401);
  if (!user.can(MENU_KEY)) return fail("Bu dokümanı silme yetkiniz yok.", 403);

  try {
    const { id } = await params;
    const docId = Number(id);
    if (!Number.isInteger(docId) || docId <= 0) return fail("Geçersiz doküman ID", 400);

    const { pdfPath } = await deleteDisKaynakliDokuman(docId);
    if (pdfPath) await deleteDisKaynakliPdfFromFtp(pdfPath);

    return Response.json({ ok: true });
  } catch (e: unknown) {
    return fail(errorText(e, "Doküman silinemedi."), 400);
  }
}
