import { getPortalUser } from "@/lib/portalYetki";
import { listUniqueRequests, insertUniqueRequest, getUniqueRequestBySource } from "@/lib/uniqueTalepStore";
import { syncUniqueMailbox } from "@/lib/uniqueTalepMailbox";
import { UniqueManualCreate, type UniqueRequest } from "@/lib/uniqueTalepRules";
import { z } from "zod";
import { cosmoPool } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET() {
  const user = await getPortalUser();
  if (!user?.can("iletisim.unique-talep")) return Response.json({ error: "Yetkisiz erişim" }, { status: user ? 403 : 401 });
  try {
    const rows = await listUniqueRequests();
    return Response.json({ data: rows.map(({ text, offer, ...row }) => ({ ...row, summary: text.slice(0, 250), hasOffer: !!offer })) });
  } catch { return Response.json({ error: "Talepler okunamadı." }, { status: 500 }); }
}
export async function POST(request: Request) {
  const user = await getPortalUser();
  if (!user?.can("iletisim.unique-talep")) return Response.json({ error: "Yetkisiz erişim" }, { status: user ? 403 : 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Geçersiz kaynak." }, { status: 403 });
  let manual = false;
  try {
    if (Number(request.headers.get("content-length") || 0) > 100000) return Response.json({ error: "Talep içeriği çok büyük." }, { status: 413 });
    const raw = await request.text();
    if (raw.length > 100000) return Response.json({ error: "Talep içeriği çok büyük." }, { status: 413 });
    // Existing empty-body POST remains the mailbox scan action.
    if (!raw.trim()) return Response.json(await syncUniqueMailbox());
    manual = true;
    const body = UniqueManualCreate.parse(JSON.parse(raw));
    let companyName = body.companyName;
    if (body.companyId) {
      const pool = await cosmoPool;
      const company = (await pool.request().input("ID", body.companyId).query("SELECT ID,Firma_Adi FROM Firma WHERE ID=@ID AND Durum='Aktif'")).recordset[0];
      if (!company) return Response.json({ error: "Seçilen firma artık aktif değil. Yeniden firma seçin veya seçimi kaldırıp manuel devam edin." }, { status: 409 });
      companyName = String(company.Firma_Adi || "").trim();
      if (!companyName) return Response.json({ error: "Seçilen firmanın adı boş. Başka firma seçin veya manuel devam edin." }, { status: 409 });
    }
    const source = `manual:${body.requestId}`;
    const value: Omit<UniqueRequest, "id" | "version"> = {
      source, date: new Date().toISOString(), companyName, name: body.name || companyName,
      email: body.email, subject: body.subject, text: body.text, category: body.category,
      potential: true, reason: "Portalda manuel oluşturulan müşteri talebi.", status: "Bekliyor", createdBy: user.userName,
      messageId: "", companyId: body.companyId, offer: null, quoteId: null, mailState: "Taslak", sentAt: null, sentMessageId: "", error: "",
    };
    const created = await insertUniqueRequest(value);
    const item = await getUniqueRequestBySource(source);
    if (!item) throw new Error("Manuel kayıt okunamadı.");
    if (item.deletedAt || item.email !== value.email || item.subject !== value.subject || item.text !== value.text || item.name !== value.name || item.companyName !== value.companyName || item.companyId !== value.companyId || item.category !== value.category) return Response.json({ error: "Bu kayıt isteği daha önce farklı bilgilerle işlendi. Listeyi yenileyip kaydı kontrol edin." }, { status: 409 });
    return Response.json({ item, created }, { status: created ? 201 : 200 });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({ error: "Firma adı, geçerli e-posta, konu ve talep açıklamasını kontrol edin." }, { status: 400 });
    return Response.json({ error: manual ? "Manuel talep kaydedilemedi. Bilgileriniz korunuyor; tekrar deneyebilirsiniz." : "Posta kutusu taranamadı. IMAP erişimini ve info hesabının ayarlarını kontrol edin." }, { status: manual ? 500 : 503 });
  }
}
