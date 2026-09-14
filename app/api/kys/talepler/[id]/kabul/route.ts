import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { acceptKysRequestItem } from "@/lib/kysStore";
import { getPortalUser } from "@/lib/portalYetki";

const PURCHASE_KEY = "laboratuvar.kys.satin-alma-gecmisi";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  const portalUser = await getPortalUser();

  try {
    const { id } = await params;
    const body = await request.json();
    const canEnterPurchase = Boolean(portalUser?.can(PURCHASE_KEY));
    const result = await acceptKysRequestItem(Number(id), {
      ...body,
      degerlendirenId: (session.user as { userId?: string })?.userId || null,
      degerlendirenAd: session.user?.name || null,
      tedarikci: canEnterPurchase ? body.tedarikci : null,
      satinAlmaTarihi: canEnterPurchase ? body.satinAlmaTarihi : null,
      birimFiyat: canEnterPurchase ? body.birimFiyat : null,
      paraBirimi: canEnterPurchase ? body.paraBirimi : null,
      toplamTutar: canEnterPurchase ? body.toplamTutar : null,
      faturaNo: canEnterPurchase ? body.faturaNo : null,
      satinAlanId: canEnterPurchase ? portalUser?.userId : null,
      satinAlanAd: canEnterPurchase ? portalUser?.userName : null,
    });
    return Response.json(result, { status: 201 });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Talep kabulü kaydedilemedi." }, { status: 500 });
  }
}
