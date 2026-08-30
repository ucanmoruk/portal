import { getPortalUser } from "@/lib/portalYetki";
import { dokumanYetkileri } from "@/lib/kysDokumanYetki";
import { createKysDokuman, deleteKysDokuman, listKysDokumanlar, nextDokumanKodu, saveKysDokumanDosya } from "@/lib/kysDokumanStore";

const fail = (message: string, status: number) => Response.json({ error: message }, { status });
const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

// GET /api/kys/dokumanlar?search=&tur=&durum=&sort=&page=&limit=
// GET /api/kys/dokumanlar?nextKod=Prosedür  → sıradaki doküman kodunu döner
export async function GET(request: Request) {
  const user = await getPortalUser();
  if (!user) return fail("Yetkisiz erişim", 401);
  const yetki = dokumanYetkileri(user);
  if (!yetki.goruntule) return fail("Bu bölümü görüntüleme yetkiniz yok.", 403);

  const url = new URL(request.url);
  try {
    const nextKod = url.searchParams.get("nextKod");
    if (nextKod !== null) {
      return Response.json({ kod: await nextDokumanKodu(nextKod) });
    }

    const result = await listKysDokumanlar({
      search: url.searchParams.get("search") || "",
      tur: url.searchParams.get("tur") || "",
      durum: url.searchParams.get("durum") || "",
      sort: url.searchParams.get("sort") || "",
      page: Number(url.searchParams.get("page") || 1),
      limit: Number(url.searchParams.get("limit") || 25),
    });
    return Response.json({ ...result, yetki });
  } catch (e: unknown) {
    return fail(errorText(e, "Doküman listesi alınamadı."), 500);
  }
}

// POST /api/kys/dokumanlar
export async function POST(request: Request) {
  const user = await getPortalUser();
  if (!user) return fail("Yetkisiz erişim", 401);
  if (!dokumanYetkileri(user).olustur) return fail("Doküman oluşturma yetkiniz yok.", 403);

  try {
    const isMultipart = request.headers.get("content-type")?.includes("multipart/form-data");
    let body: Record<string, unknown>;
    let file: File | null = null;
    if (isMultipart) {
      const formData = await request.formData();
      body = JSON.parse(String(formData.get("document") || "{}"));
      const candidate = formData.get("file");
      file = candidate instanceof File && candidate.size > 0 ? candidate : null;
    } else {
      body = await request.json();
    }
    if (file) {
      const allowedExtensions = new Set(["pdf", "doc", "docx", "xls", "xlsx"]);
      const extension = file.name.split(".").pop()?.toLocaleLowerCase("tr-TR") || "";
      if (!allowedExtensions.has(extension)) return fail("Yalnızca PDF, Word veya Excel dosyası yüklenebilir.", 400);
      if (file.size > 20 * 1024 * 1024) return fail("Dosya boyutu en fazla 20 MB olabilir.", 400);
    }
    const created = await createKysDokuman(body, { userId: user.userId, userName: user.userName });
    if (file && created.id) {
      try {
        const extension = file.name.split(".").pop()?.toLocaleLowerCase("tr-TR") || "";
        const mimeByExtension: Record<string, string> = {
          pdf: "application/pdf",
          doc: "application/msword",
          docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          xls: "application/vnd.ms-excel",
          xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        };
        await saveKysDokumanDosya(created.id, {
          name: file.name.replace(/[<>:"/\\|?*\x00-\x1f]+/g, "_").slice(0, 260),
          type: mimeByExtension[extension] || file.type || "application/octet-stream",
          size: file.size,
          buffer: Buffer.from(await file.arrayBuffer()),
        }, { userId: user.userId, userName: user.userName });
      } catch (error) {
        await deleteKysDokuman(created.id, { userId: user.userId, userName: user.userName });
        throw error;
      }
    }
    return Response.json(created, { status: 201 });
  } catch (e: unknown) {
    return fail(errorText(e, "Doküman kaydedilemedi."), 400);
  }
}
