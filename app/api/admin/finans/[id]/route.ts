import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { deleteFinanceEntry, updateFinanceEntry } from "@/lib/financeStore";

const ADMIN_IDS = new Set(["2"]);

function isAdmin(session: unknown) {
  const user = (session as { user?: { userId?: string | number } } | null)?.user;
  const uid = String(user?.userId ?? "");
  return ADMIN_IDS.has(uid);
}

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function PATCH(request: Request, context: RouteContext<"/api/admin/finans/[id]">) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  if (!isAdmin(session)) return Response.json({ error: "Bu alan yalnızca admin içindir." }, { status: 403 });

  const { id } = await context.params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return Response.json({ error: "Geçersiz kayıt." }, { status: 400 });

  try {
    const body = await request.json();
    const entry = await updateFinanceEntry(numericId, body);
    if (!entry) return Response.json({ error: "Kayıt bulunamadı." }, { status: 404 });
    return Response.json({ entry });
  } catch (error: unknown) {
    return Response.json({ error: messageOf(error, "Kayıt güncellenemedi.") }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/admin/finans/[id]">) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  if (!isAdmin(session)) return Response.json({ error: "Bu alan yalnızca admin içindir." }, { status: 403 });

  const { id } = await context.params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return Response.json({ error: "Geçersiz kayıt." }, { status: 400 });

  try {
    await deleteFinanceEntry(numericId);
    return Response.json({ ok: true });
  } catch (error: unknown) {
    return Response.json({ error: messageOf(error, "Kayıt silinemedi.") }, { status: 500 });
  }
}
