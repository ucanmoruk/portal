import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createFinanceCompany, listFinanceCompanies } from "@/lib/financeStore";

const ADMIN_IDS = new Set(["2"]);

function isAdmin(session: unknown) {
  const user = (session as { user?: { userId?: string | number } } | null)?.user;
  const uid = String(user?.userId ?? "");
  return ADMIN_IDS.has(uid);
}

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  if (!isAdmin(session)) return Response.json({ error: "Bu alan yalnızca admin içindir." }, { status: 403 });

  try {
    const companies = await listFinanceCompanies();
    return Response.json({ companies });
  } catch (error: unknown) {
    return Response.json({ error: messageOf(error, "Firmalar alınamadı.") }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  if (!isAdmin(session)) return Response.json({ error: "Bu alan yalnızca admin içindir." }, { status: 403 });

  try {
    const body = await request.json();
    const company = await createFinanceCompany(String(body.name || ""));
    return Response.json({ company }, { status: 201 });
  } catch (error: unknown) {
    return Response.json({ error: messageOf(error, "Firma eklenemedi.") }, { status: 400 });
  }
}
