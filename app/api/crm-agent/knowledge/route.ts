import { getPortalUser } from "@/lib/portalYetki";
import { CrmKnowledgeUpdate } from "@/lib/crmKnowledgeRules";
import { getCrmKnowledge, saveCrmKnowledge } from "@/lib/crmKnowledgeStore";

export async function GET() {
  const user = await getPortalUser();
  if (!user) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  if (!user.isAdmin) return Response.json({ error: "Bilgi ve kurallar yöneticiye açıktır." }, { status: 403 });
  try { return Response.json(await getCrmKnowledge()); }
  catch { return Response.json({ error: "CRM bilgileri yüklenemedi." }, { status: 500 }); }
}
export async function PUT(request: Request) {
  const user = await getPortalUser();
  if (!user) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  if (!user.isAdmin) return Response.json({ error: "Bilgi ve kuralları yalnızca yönetici düzenleyebilir." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const parsed = CrmKnowledgeUpdate.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message || "Geçersiz bilgi." }, { status: 400 });
  try {
    if (!await saveCrmKnowledge(parsed.data.content, parsed.data.version, user.userName)) return Response.json({ error: "Bilgiler başka bir oturumda değiştirildi. Metninizi kopyalayıp sayfayı yenileyin ve güncel kaydı düzenleyin." }, { status: 409 });
    return Response.json({ version: parsed.data.version + 1 });
  } catch { return Response.json({ error: "CRM bilgileri kaydedilemedi. Yazdıklarınız ekranda korunuyor." }, { status: 500 }); }
}
