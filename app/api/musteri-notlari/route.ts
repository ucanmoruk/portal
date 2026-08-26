import { type NextRequest } from "next/server";
import { getPortalUser } from "@/lib/portalYetki";
import { createMusteriNot, listFirmaOptions, listMusteriNotlari } from "@/lib/musteriNotStore";

const fail = (message: string, status: number) => Response.json({ error: message }, { status });
const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export async function GET(request: NextRequest) {
  const user = await getPortalUser();
  if (!user) return fail("Yetkisiz erişim", 401);

  const sp = request.nextUrl.searchParams;
  try {
    if (sp.get("firmalar") === "1") {
      return Response.json({ data: await listFirmaOptions(sp.get("search") || "") });
    }
    return Response.json(await listMusteriNotlari({
      search: sp.get("search") || "",
      durum: sp.get("durum") || "",
      tarihBas: sp.get("tarihBas") || "",
      tarihBit: sp.get("tarihBit") || "",
      page: Number(sp.get("page") || 1),
      limit: Number(sp.get("limit") || 25),
    }));
  } catch (e: unknown) {
    return fail(errorText(e, "Müşteri notları alınamadı."), 500);
  }
}

export async function POST(request: Request) {
  const user = await getPortalUser();
  if (!user) return fail("Yetkisiz erişim", 401);

  try {
    const created = await createMusteriNot(await request.json(), {
      userId: user.userId,
      userName: user.userName,
    });
    return Response.json(created, { status: 201 });
  } catch (e: unknown) {
    return fail(errorText(e, "Müşteri notu kaydedilemedi."), 400);
  }
}
