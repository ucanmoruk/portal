import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createKysStock, listKysStocks } from "@/lib/kysStore";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  try {
    return Response.json(await listKysStocks({
      search: sp.get("search") || "",
      malzemeTuru: sp.get("malzemeTuru") || "",
      durum: sp.get("durum") || "",
      kritik: sp.get("kritik") === "1",
      sort: sp.get("sort") || "",
      page: Number(sp.get("page") || 1),
      limit: Number(sp.get("limit") || 20),
    }));
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Stok listesi alınamadı." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const id = await createKysStock(await request.json());
    return Response.json({ id }, { status: 201 });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Stok kaydedilemedi." }, { status: 500 });
  }
}
