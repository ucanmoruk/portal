import { workspaceAccess } from "@/lib/kysWorkspaceAccess";
import { WORKSPACES } from "@/lib/kysWorkspaceConfig";
import { listWorkspaceRecords, workspaceHistory, saveWorkspaceRecord, WorkspaceError } from "@/lib/kysWorkspaceStore";
export async function GET(_request: Request, { params }: { params: Promise<{ module: string; id: string }> }) {
  const { module, id } = await params;
  if (!WORKSPACES[module]) return Response.json({ error: "Bulunamadı." }, { status: 404 });
  try {
    const access = await workspaceAccess(module);
    if (!access) return Response.json({ error: "Oturum açın." }, { status: 401 });
    if (!access.view) return Response.json({ error: "Yetkiniz yok." }, { status: 403 });
    const record = (await listWorkspaceRecords(module)).find(r => r.id === id);
    if (!record) return Response.json({ error: "Kayıt bulunamadı." }, { status: 404 });
    return Response.json({ data: record, history: await workspaceHistory(id) });
  } catch { return Response.json({ error: "Geçmiş yüklenemedi." }, { status: 500 }); }
}
export async function PUT(request: Request, { params }: { params: Promise<{ module: string; id: string }> }) {
  const { module, id } = await params;
  if (!WORKSPACES[module]) return Response.json({ error: "Bulunamadı." }, { status: 404 });
  try {
    const access = await workspaceAccess(module);
    if (!access) return Response.json({ error: "Oturum açın." }, { status: 401 });
    if (!access.edit) return Response.json({ error: "Düzenleme yetkiniz yok." }, { status: 403 });
    if (module === "yazilim-raporlari") return Response.json({ error: "Otomatik rapor değiştirilemez." }, { status: 405 });
    const input = await request.json();
    const current = (await listWorkspaceRecords(module)).find(r => r.id === id);
    if ((["Onaylandı", "Yayında"].includes(input.status) || current && ["Onaylandı", "Yayında"].includes(current.status)) && !access.approve) return Response.json({ error: "Onaylı kayıtlar için onay yetkisi gerekir." }, { status: 403 });
    return Response.json({ data: await saveWorkspaceRecord(module, input, access.user, id) });
  } catch (e) { return Response.json({ error: e instanceof WorkspaceError ? e.message : "Kayıt güncellenemedi." }, { status: e instanceof WorkspaceError ? e.status : 500 }); }
}
