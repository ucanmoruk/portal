import { listSupplierMail, prepareSupplierMail, sendQueuedSupplierMail } from "@/lib/kysSupplierMail";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { completeKysOrder, updateKysOrderBilling, editSpektrotekRequestNumber, editKysRequest, getKysRequestDetail, updateKysRequestStatus } from "@/lib/kysStore";
import { getPortalUser } from "@/lib/portalYetki";
import {
  deleteKysRequest,
  getKysRequestFiles,
  restoreKysRequest,
} from "@/lib/kysPurchaseWorkflow";

export const maxDuration = 180;

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
    if (!user.firmalar.includes(detail.talep.seri))
      return Response.json({ error: "Bu firmanın talebini görüntüleme yetkiniz yok." }, { status: 403 });
    return Response.json({
      ...detail,
      belgeler: await getKysRequestFiles(Number(id)),
      satinAlmaYetkisi,
      tedarikciMailleri:await listSupplierMail(Number(id)),
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
    const current = await getKysRequestDetail(Number(id), false);
    if (!current) return Response.json({ error: "Talep bulunamadı" }, { status: 404 });
    if (!user.firmalar.includes(current.talep.seri))
      return Response.json({ error: "Bu firmanın talebini düzenleme yetkiniz yok." }, { status: 403 });
    const body = await request.json();
    if (body.islem === "siparis-tamamla") {
      return Response.json(await completeKysOrder(Number(id), {
        kabulTarihi: body.kabulTarihi, hedefBirimId: body.hedefBirimId,
        genelDegerlendirme: body.genelDegerlendirme,
        degerlendirenId: user.userId, degerlendirenAd: user.userName,
      }));
    }
    if (body.islem === "siparis-fatura") { await updateKysOrderBilling(Number(id),body);return Response.json({ok:true}); }
    if (body.islem === "numara-duzenle") {
      await editSpektrotekRequestNumber(Number(id), body.talepNo);
      return Response.json({ ok: true });
    }
    if (body.islem === "duzenle") {
      await editKysRequest(Number(id), body);
      return Response.json({ ok: true });
    }
    if (body.islem === "geri-al") {
      await restoreKysRequest(Number(id), user.userId);
      return Response.json({ ok: true });
    }
    if(body.islem === "tedarikci-mail-gonder" || body.islem === "tedarikci-mail-tekrar") {
      if(body.islem === "tedarikci-mail-gonder")await prepareSupplierMail(Number(id),body.tedarikciIds||[],body.ekAlicilar||[],body.yenidenGonder===true,body.gonderimAnahtari);
      try {return Response.json({ok:true,mail:await sendQueuedSupplierMail(Number(id),true,{userId:user.userId,userName:user.userName})});}
      catch(error) {console.error("[KYS supplier mail]", error instanceof Error?error.message:"Gönderim hatası");return Response.json({error:"Mail gönderimi tamamlanamadı. Kayıtlı gönderim durumunu kontrol edin."},{status:503});}
    }
    await updateKysRequestStatus(Number(id), {
      durum: body.durum,
      tedarikciIds:body.tedarikciIds,
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
    const current = await getKysRequestDetail(Number(id), false);
    if (!current) return Response.json({ error: "Talep bulunamadı" }, { status: 404 });
    if (!user.firmalar.includes(current.talep.seri))
      return Response.json({ error: "Bu firmanın talebini silme yetkiniz yok." }, { status: 403 });
    await deleteKysRequest(Number(id), user.userId);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Talep silinemedi." },
      { status: 400 },
    );
  }
}
