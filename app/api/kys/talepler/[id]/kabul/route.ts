import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { acceptKysRequestItem, getKysRequestDetail } from "@/lib/kysStore";
import { getPortalUser } from "@/lib/portalYetki";
import {
  correctKysAcceptance,
  deleteKysAcceptance,
  readKysAcceptanceInput,
} from "@/lib/kysPurchaseWorkflow";

const PURCHASE_KEY = "laboratuvar.kys.satin-alma-gecmisi";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session)
    return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  const portalUser = await getPortalUser();
  if (!portalUser?.can("laboratuvar.kys.talep-listesi"))
    return Response.json({ error: "Yetkiniz yok." }, { status: 403 });

  try {
    const { id } = await params;
    const current = await getKysRequestDetail(Number(id), false);
    if (!current || !portalUser.firmalar.includes(current.talep.seri))
      return Response.json({ error: "Bu firmanın talebine erişiminiz yok." }, { status: 403 });
    const body = await readKysAcceptanceInput(request);
    const canEnterPurchase = Boolean(portalUser?.can(PURCHASE_KEY));
    const result = await acceptKysRequestItem(Number(id), {
      ...body,
      degerlendirenId: (session.user as { userId?: string })?.userId || null,
      degerlendirenAd: session.user?.name || null,
      tedarikci: canEnterPurchase ? body.tedarikci : null,
      tedarikciId: canEnterPurchase ? body.tedarikciId : null,
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
    return Response.json(
      { error: e instanceof Error ? e.message : "Talep kabulü kaydedilemedi." },
      { status: 400 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getPortalUser();
  if (!user)
    return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  if (!user.can("laboratuvar.kys.talep-listesi"))
    return Response.json({ error: "Yetkiniz yok." }, { status: 403 });
  try {
    const { id } = await params;
    const current = await getKysRequestDetail(Number(id), false);
    if (!current || !user.firmalar.includes(current.talep.seri))
      return Response.json({ error: "Bu firmanın talebine erişiminiz yok." }, { status: 403 });
    const body = await readKysAcceptanceInput(request);
    return Response.json(
      await correctKysAcceptance(
        Number(id),
        {
          ...body,
          degerlendirenId: user.userId,
          degerlendirenAd: user.userName,
        },
        false,
      ),
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Düzeltme kaydedilemedi." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  if (!user.can("laboratuvar.kys.talep-listesi")) return Response.json({ error: "Yetkiniz yok." }, { status: 403 });
  try {
    const { id } = await params;
    const current = await getKysRequestDetail(Number(id), false);
    if (!current || !user.firmalar.includes(current.talep.seri))
      return Response.json({ error: "Bu firmanın talebine erişiminiz yok." }, { status: 403 });
    const body = await request.json();
    return Response.json(await deleteKysAcceptance(Number(id), Number(body.kabulId), user.userId));
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Kabul silinemedi." }, { status: 400 }); }
}
