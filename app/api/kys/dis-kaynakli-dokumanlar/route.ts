import { randomUUID } from "crypto";
import { getPortalUser } from "@/lib/portalYetki";
import { createDisKaynakliDokuman, listDisKaynakliDokumanlar } from "@/lib/kysDisKaynakliDokumanStore";
import { uploadDisKaynakliPdfToFtp } from "@/lib/kysDisKaynakliFtpUpload";

const fail = (message: string, status: number) => Response.json({ error: message }, { status });
const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);
const MENU_KEY = "laboratuvar.kys.dis-kaynakli-dokuman";

function safePdfName(name: string) {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return base.toLowerCase().endsWith(".pdf") ? base : `${base || "dokuman"}.pdf`;
}

export async function GET(request: Request) {
  const user = await getPortalUser();
  if (!user) return fail("Yetkisiz erişim", 401);
  if (!user.can(MENU_KEY)) return fail("Bu bölümü görüntüleme yetkiniz yok.", 403);

  const url = new URL(request.url);
  try {
    const result = await listDisKaynakliDokumanlar({
      search: url.searchParams.get("search") || "",
      akreditasyon: url.searchParams.get("akreditasyon") || "",
      kontrol: url.searchParams.get("kontrol") || "",
      sort: url.searchParams.get("sort") || "",
      page: Number(url.searchParams.get("page") || 1),
      limit: Number(url.searchParams.get("limit") || 25),
    });
    return Response.json({
      ...result,
      yetki: {
        kontrol: user.can("laboratuvar.kys.dis-kaynakli-dokuman.kontrol"),
        isAdmin: user.isAdmin,
      },
    });
  } catch (e: unknown) {
    return fail(errorText(e, "Dış kaynaklı doküman listesi alınamadı."), 500);
  }
}

export async function POST(request: Request) {
  const user = await getPortalUser();
  if (!user) return fail("Yetkisiz erişim", 401);
  if (!user.can(MENU_KEY)) return fail("Bu bölüme kayıt ekleme yetkiniz yok.", 403);

  try {
    const formData = await request.formData();
    const file = formData.get("pdf");
    if (!(file instanceof File)) return fail("PDF dosyası zorunludur.", 400);
    if (file.type && file.type !== "application/pdf") return fail("Sadece PDF dosyası yüklenebilir.", 400);

    const originalName = safePdfName(file.name || "dokuman.pdf");
    const fileName = `${Date.now()}-${randomUUID()}-${originalName}`;
    const { publicUrl } = await uploadDisKaynakliPdfToFtp({
      pdfBuffer: Buffer.from(await file.arrayBuffer()),
      fileName,
    });

    const created = await createDisKaynakliDokuman({
      akreditasyon: formData.get("akreditasyon") === "1",
      dokumanKodu: String(formData.get("dokumanKodu") || ""),
      dokumanAdi: String(formData.get("dokumanAdi") || ""),
      yayincisi: String(formData.get("yayincisi") || ""),
      yayinTarihi: String(formData.get("yayinTarihi") || ""),
      yayinLinki: String(formData.get("yayinLinki") || ""),
      pdfPath: publicUrl,
      pdfOriginalName: file.name || originalName,
    });
    return Response.json(created, { status: 201 });
  } catch (e: unknown) {
    return fail(errorText(e, "Dış kaynaklı doküman kaydedilemedi."), 400);
  }
}
