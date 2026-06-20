import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createFinancePayment } from "@/lib/financeStore";

const ADMIN_IDS = new Set(["2"]);

function isAdmin(session: unknown) {
  const user = (session as { user?: { userId?: string | number } } | null)?.user;
  const uid = String(user?.userId ?? "");
  return ADMIN_IDS.has(uid);
}

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function POST(request: Request, context: RouteContext<"/api/admin/finans/[id]/odemeler">) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erisim" }, { status: 401 });
  if (!isAdmin(session)) return Response.json({ error: "Bu alan yalnizca admin icindir." }, { status: 403 });

  const { id } = await context.params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return Response.json({ error: "Gecersiz kayit." }, { status: 400 });

  try {
    const body = await request.json();
    const result = await createFinancePayment({
      entryId: numericId,
      amount: body.amount,
      paidDate: body.paidDate,
      note: body.note,
    });
    return Response.json(result, { status: 201 });
  } catch (error: unknown) {
    return Response.json({ error: messageOf(error, "Odeme eklenemedi.") }, { status: 400 });
  }
}
