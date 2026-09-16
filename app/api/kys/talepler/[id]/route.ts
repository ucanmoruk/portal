import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getKysRequestDetail, updateKysRequestStatus } from "@/lib/kysStore";
import { getPortalUser } from "@/lib/portalYetki";
import {
  deleteKysRequest,
  getKysRequestFiles,
  restoreKysRequest,
} from "@/lib/kysPurchaseWorkflow";

const PURCHASE_KEY = "laboratuvar.kys.satin-alma-gecmisi";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getPortalUser();
  if (!user)
    return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  if (!user.can("laboratuvar.kys.talep-listesi"))
    return Response.json({ error: "Yetkiniz yok." }, { status: 403 });

  try {
    const { id } = await params;
    const satinAlmaYetkisi = user.can(PURCHASE_KEY);
    const detail = await getKysRequestDetail(Number(id), satinAlmaYetkisi);
    if (!detail)
      return Response.json({ error: "Talep bulunamadı" }, { status: 404 });
    return Response.json({
      ...detail,
      belgeler: await getKysRequestFiles(Number(id)),
      satinAlmaYetkisi,
    });
  } catch (e: unknown) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Talep detayı alınamadı." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session)
    return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  const user = await getPortalUser();
  if (!user?.can("laboratuvar.kys.talep-listesi"))
    return Response.json({ error: "Yetkiniz yok." }, { status: 403 });

  try {
    const { id } = await params;
    const body = await request.json();
    if (body.islem === "geri-al") {
      await restoreKysRequest(Number(id), user.userId);
      return Response.json({ ok: true });
    }
    await updateKysRequestStatus(Number(id), {
      durum: body.durum,
      userId: (session.user as { userId?: string })?.userId || null,
      userName: session.user?.name || null,
    });
    return Response.json({ ok: true });
  } catch (e: unknown) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Talep güncellenemedi." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getPortalUser();
  if (!user)
    return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  if (!user.can("laboratuvar.kys.talep-listesi"))
    return Response.json({ error: "Yetkiniz yok." }, { status: 403 });
  try {
    const { id } = await params;
    await deleteKysRequest(Number(id), user.userId);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Talep silinemedi." },
      { status: 400 },
    );
  }
}
