import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listKysExpiry } from "@/lib/kysStore";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  try {
    return Response.json(await listKysExpiry({
      search: sp.get("search") || "",
      days: Number(sp.get("days") || 180),
      page: Number(sp.get("page") || 1),
      limit: Number(sp.get("limit") || 20),
    }));
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Son kullanım listesi alınamadı." }, { status: 500 });
  }
}
