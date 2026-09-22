import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createKysRequest, listKysRequests } from "@/lib/kysStore";
import { type NextRequest } from "next/server";
import { getPortalUser } from "@/lib/portalYetki";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session)
    return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  if (!(await getPortalUser())?.can("laboratuvar.kys.talep-listesi"))
    return Response.json({ error: "Yetkiniz yok." }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  try {
    return Response.json(
      await listKysRequests({
        search: sp.get("search") || "",
        durum: sp.get("durum") || "",
        tur: sp.get("tur") || "",
        odeme: sp.get("odeme") || "",
        seri: sp.get("seri") || "",
        page: Number(sp.get("page") || 1),
        limit: Number(sp.get("limit") || 20),
        allowedFirmalar: (await getPortalUser())?.firmalar,
      }),
    );
  } catch (e: unknown) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Talep listesi alınamadı." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session)
    return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  if (!(await getPortalUser())?.can("laboratuvar.kys.talep-listesi"))
    return Response.json({ error: "Yetkiniz yok." }, { status: 403 });

  try {
    const body = await request.json();
    const requestedFirma = body.seri === "Spektrotek" ? "Spektrotek" : "Unique";
    const portalUser = await getPortalUser();
    if (!portalUser?.firmalar.includes(requestedFirma))
      return Response.json({ error: "Bu firma için talep oluşturma yetkiniz yok." }, { status: 403 });
    const id = await createKysRequest({
      ...body,
      olusturanId: (session.user as { userId?: string })?.userId || null,
      olusturanAd: session.user?.name || null,
    });
    return Response.json({ id }, { status: 201 });
  } catch (e: unknown) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Talep oluşturulamadı." },
      { status: 500 },
    );
  }
}
