import { normalizeKysProduct } from "@/lib/kysProduct";
import { kysStockSource } from "@/lib/kysStockSources";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createKysStockWithOpening, listKysStocks } from "@/lib/kysStore";
import { type NextRequest } from "next/server";
import { getPortalUser } from "@/lib/portalYetki";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  const portalUser = await getPortalUser();

  const sp = request.nextUrl.searchParams;
  try {
    return Response.json(await listKysStocks({
      liste: sp.get("liste") === "stok" ? "stok" : sp.get("liste") === "urun" ? "urun" : undefined,
      search: sp.get("search") || "",
      kaynak: sp.get("kaynak") || "",
      malzemeTuru: sp.get("malzemeTuru") || "",
      kategori: sp.get("kategori") || "",
      durum: sp.get("durum") || "",
      kritik: sp.get("kritik") === "1",
      sort: sp.get("sort") || "",
      page: Number(sp.get("page") || 1),
      limit: Number(sp.get("limit") || 20),
      allowedFirmalar: portalUser?.firmalar ?? [],
    }));
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Stok listesi alınamadı." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const body = await request.json();
    const portalUser = await getPortalUser();
    const firma = kysStockSource(body.kaynak, body.malzemeTuru);
    if (!portalUser?.firmalar.includes(firma)) return Response.json({ error: "Bu firma için stok oluşturma yetkiniz yok." }, { status: 403 });
    if (body.urun !== undefined) {
      try { body.urun = normalizeKysProduct(body.urun, firma); }
      catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Ürün bilgileri geçersiz." }, { status: 400 }); }
    }
    const { baslangicStok, ...stock } = body;
    const id = await createKysStockWithOpening(stock, {
      miktar: baslangicStok,
      kullaniciId: (session.user as { userId?: string })?.userId || null,
      kullaniciAd: session.user?.name || null,
    });
    return Response.json({ id }, { status: 201 });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Stok kaydedilemedi." }, { status: 500 });
  }
}
