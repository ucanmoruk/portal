import { getPortalUser } from "@/lib/portalYetki";
import { crmDraftPool } from "@/lib/crmDraftStore";
import { CrmOfferEdit } from "@/lib/crmOffer";

export async function GET() {
  const user = await getPortalUser();
  if (!user) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  if (!user.isAdmin && !user.can("musteriler.musteri-listesi") && !user.can("musteriler.notlar")) return Response.json({ error: "CRM erişim yetkiniz yok." }, { status: 403 });
  const pool = await crmDraftPool();
  const result = await pool.request().input("Owner", user.userId).query("SELECT TOP 50 ID,Payload,CreatedAt FROM CrmOfferDraft WHERE OwnerKey=@Owner ORDER BY ID DESC");
  return Response.json({ data: result.recordset.map((row: { ID: number; Payload: string; CreatedAt: string }) => ({ id: row.ID, offer: JSON.parse(row.Payload), createdAt: row.CreatedAt })) });
}

export async function PUT(request: Request) {
  const user = await getPortalUser();
  if (!user) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  if (!user.isAdmin && !user.can("musteriler.musteri-listesi") && !user.can("musteriler.notlar")) return Response.json({ error: "CRM erişim yetkiniz yok." }, { status: 403 });
  const body = await request.json();
  const parsed = CrmOfferEdit.safeParse(body.offer);
  if (!Number.isSafeInteger(body.id) || body.id < 1 || !parsed.success) return Response.json({ error: "Geçersiz taslak." }, { status: 400 });
  const pool = await crmDraftPool();
  const result = await pool.request().input("ID", body.id).input("Owner", user.userId).input("Payload", JSON.stringify(parsed.data)).query("UPDATE CrmOfferDraft SET Payload=@Payload WHERE ID=@ID AND OwnerKey=@Owner");
  if (!result.rowsAffected.some((count: number) => count > 0)) return Response.json({ error: "Taslak bulunamadı." }, { status: 404 });
  return Response.json({ ok: true });
}
