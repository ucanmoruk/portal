import { CRM_SYSTEM_PROMPT } from "@/lib/crmPrompt";
import { getCrmCatalog } from "@/lib/crmCatalog";
import { getCrmKnowledge } from "@/lib/crmKnowledgeStore";
import { crmKnowledgePrompt } from "@/lib/crmKnowledgeRules";
import { createCrmDraft } from "@/lib/crmDraftStore";
import { hydrateCrmOffer } from "@/lib/crmOffer";
import { crmAiConfig, requestCrmAnalysis } from "@/lib/crmAi";
import { getPortalUser } from "@/lib/portalYetki";
import { cosmoPool } from "@/lib/db";
import { ensureFirmaGenelNotSchema } from "@/lib/firmaGenelNotStore";
import { ensureMusteriNotSchema } from "@/lib/musteriNotStore";

const fail = (message: string, status: number) => Response.json({ error: message }, { status });
type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  const user = await getPortalUser();
  if (!user) return fail("Yetkisiz erişim", 401);
  if (!user.isAdmin && !user.can("musteriler.musteri-listesi") && !user.can("musteriler.notlar")) return fail("CRM Agent erişim yetkiniz yok.", 403);
  try {
    const body = await request.json();
    const question = String(body.question || "").trim();
    const firmaId = body.firmaId ? Number(body.firmaId) : null;
    if (question.length < 3 || question.length > 12000) return fail("Soru 3-12000 karakter arasında olmalıdır.", 400);
    if (firmaId != null && (!Number.isInteger(firmaId) || firmaId <= 0)) return fail("Geçersiz firma.", 400);
    let config;
    try { config = crmAiConfig(); } catch (error) { return fail(error instanceof Error ? error.message : "AI yapılandırması eksik.", 503); }

    await Promise.all([ensureFirmaGenelNotSchema(), ensureMusteriNotSchema()]);
    const pool = await cosmoPool;
    const firm = firmaId ? (await pool.request().input("FirmaID", firmaId).query("SELECT TOP 1 ID,Firma_Adi,Yetkili,Telefon,Mail FROM Firma WHERE ID=@FirmaID")).recordset[0] : null;
    if (firmaId && !firm) return fail("Firma bulunamadı.", 404);
    const where = firmaId ? "AND f.ID=@FirmaID" : "";
    const bind = () => pool.request().input("FirmaID", firmaId);

    const [generalNotes, followUps, invoices, offers, proformas] = await Promise.all([
      bind().query(`SELECT TOP 80 f.Firma_Adi AS Firma,n.NotMetni,n.OlusturanAd,n.CreatedAt FROM FirmaGenelNot n INNER JOIN Firma f ON f.ID=n.FirmaID WHERE 1=1 ${where} ORDER BY n.ID DESC`),
      bind().query(`SELECT TOP 80 COALESCE(f.Firma_Adi,n.ManuelFirmaAdi) AS Firma,n.Baslik,n.NotMetni,n.GorusmeTarihi,n.OdemeTarihi,n.Durum FROM MusteriNot n LEFT JOIN Firma f ON f.ID=n.FirmaID WHERE n.Durum<>'Tamamlandı' ${firmaId ? "AND n.FirmaID=@FirmaID" : ""} ORDER BY CASE WHEN n.GorusmeTarihi IS NULL THEN 1 ELSE 0 END,n.GorusmeTarihi`),
      bind().query(`SELECT TOP 100 f.Firma_Adi AS Firma,fa.Fatura_No,fa.Tarih,fa.VadeTarihi,fa.Toplam,'TRY' AS ParaBirimi,COALESCE((SELECT TOP 1 o.Odeme_Durumu FROM Odeme o WHERE o.Fatura_ID=fa.ID ORDER BY o.ID DESC),'Ödeme Bekliyor') AS OdemeDurumu FROM Fatura fa INNER JOIN Firma f ON f.ID=fa.FaturaFirmaID WHERE fa.Durum='Aktif' ${where} ORDER BY fa.VadeTarihi DESC,fa.ID DESC`),
      bind().query(`SELECT TOP 60 f.Firma_Adi AS Firma,t.TeklifNo,t.Tarih,t.Toplam,t.TeklifDurum FROM TeklifBaslik t INNER JOIN Firma f ON f.ID=t.MusteriID WHERE t.Durum='Aktif' ${where} ORDER BY t.ID DESC`),
      bind().query(`SELECT TOP 60 f.Firma_Adi AS Firma,p.ProformaNo,p.Tarih,p.GenelToplam,p.Durum FROM ProformaBaslik p INNER JOIN Firma f ON f.ID=p.FirmaID WHERE COALESCE(p.SilindiMi,0)=0 ${where} ORDER BY p.ID DESC`),
    ]);
    const { services, packages } = await getCrmCatalog();
    const context = { hizmetler: services, paketler: packages, scope: firm ? { mode: "selected-company", firm } : { mode: "all-companies" }, today: new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" }), firmaNotlari: generalNotes.recordset, takipNotlari: followUps.recordset, faturalar: invoices.recordset, teklifler: offers.recordset, proformalar: proformas.recordset };
    const history = (Array.isArray(body.messages) ? body.messages : []).slice(-8).filter((item: ChatMessage) => ["user", "assistant"].includes(item?.role) && typeof item?.content === "string").map((item: ChatMessage) => ({ role: item.role, content: item.content.slice(0, 1500) }));
    const knowledge = await getCrmKnowledge();
    const analysis = await requestCrmAnalysis(config, CRM_SYSTEM_PROMPT + crmKnowledgePrompt(knowledge.content), [
      ...history, { role: "user", content: JSON.stringify({ question, context }) },
    ]);
    const offer = analysis.offer ? hydrateCrmOffer(analysis.offer, services, packages) : null;
    const draftId = offer ? await createCrmDraft(user.userId, offer) : null;
    return Response.json({ answer: analysis.answer, offer, draftId, scope: firm ? firm.Firma_Adi : "Tüm firmalar" });
  } catch (error) { return fail(error instanceof Error ? error.message : "CRM Agent çalışamadı.", 500); }
}
