import { workspaceAccess } from "@/lib/kysWorkspaceAccess";
import { WORKSPACES } from "@/lib/kysWorkspaceConfig";
import { listWorkspaceRecords, saveWorkspaceRecord, WorkspaceError } from "@/lib/kysWorkspaceStore";
export async function GET(_request: Request, { params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  if (!WORKSPACES[module]) return Response.json({ error: "Sayfa bulunamadı." }, { status: 404 });
  try {
    const access = await workspaceAccess(module);
    if (!access) return Response.json({ error: "Oturum açın." }, { status: 401 });
    if (!access.view) return Response.json({ error: "Görüntüleme yetkiniz yok." }, { status: 403 });
    const data = await listWorkspaceRecords(module);
    const relations: Record<string, Awaited<ReturnType<typeof listWorkspaceRecords>>> = {};
    for (const relation of new Set(WORKSPACES[module].fields.map(f => f.relation).filter((v): v is string => Boolean(v)))) {
      const relatedAccess = await workspaceAccess(relation);
      if (relatedAccess?.view) relations[relation] = await listWorkspaceRecords(relation);
    }
    return Response.json({ data, relations, canEdit: module !== "yazilim-raporlari" && access.edit, canApprove: access.approve });
  } catch { return Response.json({ error: "Kayıtlar yüklenemedi." }, { status: 500 }); }
}
export async function POST(request: Request, { params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  if (!WORKSPACES[module]) return Response.json({ error: "Sayfa bulunamadı." }, { status: 404 });
  try {
    const access = await workspaceAccess(module);
    if (!access) return Response.json({ error: "Oturum açın." }, { status: 401 });
    if (!access.edit) return Response.json({ error: "Düzenleme yetkiniz yok." }, { status: 403 });
    if (module === "yazilim-raporlari") return Response.json({ error: "Raporlar yalnızca otomatik test çalıştırıcısı tarafından oluşturulur." }, { status: 405 });
    const input = await request.json();
    if (["Onaylandı", "Yayında"].includes(input.status) && !access.approve) return Response.json({ error: "Onay yetkiniz yok." }, { status: 403 });
    return Response.json({ data: await saveWorkspaceRecord(module, input, access.user) }, { status: 201 });
  } catch (e) { return Response.json({ error: e instanceof WorkspaceError ? e.message : "Kayıt kaydedilemedi." }, { status: e instanceof WorkspaceError ? e.status : 500 }); }
}
