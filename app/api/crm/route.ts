import { z } from "zod";
import { getPortalUser } from "@/lib/portalYetki";
import { crmPool, CrmError, insertCrmRecord, listCrmRecords, saveCrmRecord } from "@/lib/crmStore";
import { CompanyFields, companyDuplicate, crmLegacyContacts, CRM_STATUSES, type CrmCampaign, type CrmCompany, type CrmList, type CrmRecord, type CrmTemplate } from "@/lib/crmRules";
import { CRM_EMAIL_LIMIT, emailHasContent, sanitizeCrmEmailHtml } from "@/lib/crmEmail";

export const dynamic = "force-dynamic";
const id = z.string().uuid();
const name = z.string().trim().min(1).max(200);
const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete"), id, version: z.number().int().positive(), kind: z.enum(["company", "list", "template", "campaign"]) }),
  z.object({ action: z.literal("restore"), id, version: z.number().int().positive(), kind: z.enum(["company", "list", "template", "campaign"]) }),
  z.object({ action: z.literal("list"), name, description: z.string().trim().max(2000).default("") }),
  z.object({ action: z.literal("companies"), listId: id.optional(), companies: z.array(CompanyFields).min(1).max(500), imported: z.boolean().default(false) }),
  z.object({ action: z.literal("customers"), listId: id.optional(), customerIds: z.array(z.number().int().positive()).min(1).max(100) }),
  z.object({ action: z.literal("company"), id, version: z.number().int().positive(), company: CompanyFields }),
  z.object({ action: z.literal("membership"), id, version: z.number().int().positive(), companyIds: z.array(id).max(10000) }),
  z.object({ action: z.literal("template"), id: id.optional(), version: z.number().int().positive().optional(), name, subject: z.string().trim().min(1).max(500), body: z.string().trim().min(1).max(CRM_EMAIL_LIMIT), format: z.enum(["text", "html"]).default("text") }),
  z.object({ action: z.literal("campaign"), name, listId: id, templateId: id }),
  z.object({ action: z.literal("campaignState"), id, version: z.number().int().positive(), state: z.enum(["Taslak", "Devam ediyor", "Duraklatıldı", "Tamamlandı"]) }),
  z.object({ action: z.literal("activity"), id, version: z.number().int().positive(), companyId: id, status: z.enum(CRM_STATUSES), note: z.string().trim().max(4000), nextContact: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]) }),
  z.object({ action: z.literal("convert"), id, version: z.number().int().positive() }),
  z.object({ action: z.literal("linkCustomer"), id, version: z.number().int().positive(), customerId: z.number().int().positive() }),
]);
function failure(error: unknown) {
  if (error instanceof z.ZodError) return Response.json({ error: error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  if (error instanceof CrmError) return Response.json({ error: error.message }, { status: error.status });
  console.error("CRM", error);
  return Response.json({ error: "CRM işlemi tamamlanamadı. Kaydı yenileyerek tekrar deneyin." }, { status: 500 });
}
export async function GET(request: Request) {
  const user = await getPortalUser();
  if (!user?.can("iletisim.crm")) return Response.json({ error: "CRM erişim yetkiniz yok." }, { status: user ? 403 : 401 });
  try {
    const search = new URL(request.url).searchParams.get("customers");
    if (search !== null) {
      if (!user.can("musteriler.musteri-listesi")) throw new CrmError("Müşteri listesi yetkiniz yok.", 403);
      const pool = await crmPool();
      const result = await pool.request().input("Q", `%${search.slice(0, 200)}%`).query("SELECT TOP 50 ID,Firma_Adi AS name,Mail AS email,Yetkili AS contact FROM Firma WHERE Durum='Aktif' AND (Firma_Adi LIKE @Q OR Mail LIKE @Q) ORDER BY Firma_Adi");
      return Response.json({ customers: result.recordset });
    }
    const all = await listCrmRecords(), rows = all.filter(r => !r.deletedAt);
    const companyIds = new Set(rows.filter(r => r.kind === "company").map(r => r.id));
    return Response.json({ companies: rows.filter(r => r.kind === "company"), lists: rows.filter(r => r.kind === "list").map(r => ({ ...r, data: { ...r.data, companyIds: (r.data as CrmList).companyIds.filter(id => companyIds.has(id)) } })), templates: rows.filter(r => r.kind === "template"), campaigns: rows.filter(r => r.kind === "campaign"), deleted: all.filter(r => r.deletedAt), canUseCustomers: user.can("musteriler.musteri-listesi"), mailMode: "research" });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const user = await getPortalUser();
  if (!user?.can("iletisim.crm")) return Response.json({ error: "CRM erişim yetkiniz yok." }, { status: user ? 403 : 401 });
  // Reject cross-site mutations even when a browser has a valid portal session.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Geçersiz kaynak." }, { status: 403 });
  try {
    if (Number(request.headers.get("content-length") || 0) > 2_000_000) throw new CrmError("Dosya / istek çok büyük.", 413);
    const raw = await request.text();
    if (raw.length > 2_000_000) throw new CrmError("Dosya / istek çok büyük.", 413);
    const body = command.parse(JSON.parse(raw)), all = await listCrmRecords(), rows = all.filter(r => !r.deletedAt || body.action === "restore"), by = user.userName;
    function get<T>(recordId: string, kind: CrmRecord["kind"], version?: number) {
      const record = rows.find(r => r.id === recordId && r.kind === kind);
      if (!record) throw new CrmError("Kayıt bulunamadı.", 404);
      if (version !== undefined && record.version !== version) throw new CrmError("Kayıt değişti. Yenileyip tekrar deneyin.", 409);
      return record as CrmRecord<T>;
    }
    if (body.action === "delete" || body.action === "restore") {
      const record = get<CrmRecord["data"]>(body.id, body.kind, body.version);
      if (body.action === "delete") {
        if (record.kind === "company" && (record.data as CrmCompany).conversion) throw new CrmError("Müşteriye aktarımı kontrol edilen firma silinemez.", 409);
        await saveCrmRecord(record, { ...record.data, _deleted: { at: new Date().toISOString(), by } }, by);
        return Response.json({ message: "Kayıt silinenlere taşındı. Silinenler bölümünden geri alabilirsiniz." });
      }
      if (!record.deletedAt) throw new CrmError("Kayıt zaten aktif.", 409);
      if (record.kind === "company" && rows.some(r => r.kind === "company" && !r.deletedAt && companyDuplicate(r.data as CrmCompany, record.data as CrmCompany))) throw new CrmError("Aynı firmaya ait aktif kayıt var. Önce bu kaydı kontrol edin.", 409);
      const restored = { ...record.data }; delete restored._deleted;
      await saveCrmRecord(record, restored, by);
      return Response.json({ message: "Kayıt geri alındı." });
    } else if (body.action === "list") {
      await insertCrmRecord("list", { name: body.name, description: body.description, companyIds: [] }, by);
    } else if (body.action === "companies" || body.action === "customers") {
      const list = body.listId ? get<CrmList>(body.listId, "list") : null;
      let input: CrmCompany[] = [];
      if (body.action === "customers") {
        if (!user.can("musteriler.musteri-listesi")) throw new CrmError("Müşteri listesi yetkiniz yok.", 403);
        const pool = await crmPool();
        for (const customerId of new Set(body.customerIds)) {
          const row = (await pool.request().input("ID", customerId).query("SELECT ID,Firma_Adi,Mail,Telefon,Yetkili,Adres,Vergi_No FROM Firma WHERE ID=@ID AND Durum='Aktif'")).recordset[0];
          if (!row) throw new CrmError(`Müşteri #${customerId} bulunamadı.`);
          input.push({ ...CompanyFields.parse({ name: row.Firma_Adi, ...crmLegacyContacts(row.Mail?.trim() || "", row.Yetkili || ""), phone: row.Telefon || "", address: row.Adres || "", taxNumber: row.Vergi_No || "" }), customerId, source: "Müşteri listesi" });
        }
      } else input = body.companies.map(company => ({ ...company, customerId: null, source: body.imported ? "İçe aktarma" : "Manuel" }));
      const companies = rows.filter(r => r.kind === "company") as CrmRecord<CrmCompany>[];
      const ids: string[] = [];
      let added = 0;
      for (const company of input) {
        const duplicate = companies.find(r => companyDuplicate(r.data, company));
        if (duplicate) { ids.push(duplicate.id); continue; }
        const record = await insertCrmRecord("company", company, by) as CrmRecord<CrmCompany>;
        companies.push(record); ids.push(record.id); added++;
      }
      if (list) await saveCrmRecord(list, { ...list.data, companyIds: [...new Set([...list.data.companyIds, ...ids])] }, by);
      return Response.json({ ids, message: `${added} yeni firma eklendi; ${input.length - added} mevcut kayıt kullanıldı.${list ? " Liste güncellendi." : ""}` });
    } else if (body.action === "company") {
      const record = get<CrmCompany>(body.id, "company", body.version);
      if (record.data.conversion) throw new CrmError("Müşteriye aktarım kontrolü devam ediyor.", 409);
      await saveCrmRecord(record, { ...record.data, ...body.company }, by);
    } else if (body.action === "membership") {
      const record = get<CrmList>(body.id, "list", body.version);
      for (const companyId of body.companyIds) get<CrmCompany>(companyId, "company");
      await saveCrmRecord(record, { ...record.data, companyIds: [...new Set(body.companyIds)] }, by);
    } else if (body.action === "template") {
      const content = body.format === "html" ? sanitizeCrmEmailHtml(body.body) : body.body;
      if (body.format === "html" && !emailHasContent(content)) throw new CrmError("Mail içeriği boş olamaz.");
      const data = { name: body.name, subject: body.subject, body: content, format: body.format };
      if (body.id) {
        if (!body.version) throw new CrmError("Şablon sürümü eksik.");
        await saveCrmRecord(get<CrmTemplate>(body.id, "template", body.version), data, by);
      } else await insertCrmRecord("template", data, by);
    } else if (body.action === "campaign") {
      const list = get<CrmList>(body.listId, "list"), template = get<CrmTemplate>(body.templateId, "template");
      const companyIds = list.data.companyIds.filter(companyId => rows.some(r => r.id === companyId && r.kind === "company"));
      if (!companyIds.length) throw new CrmError("Kampanya için önce listeye firma ekleyin.");
      await insertCrmRecord("campaign", { name: body.name, listId: list.id, templateId: template.id, subject: template.data.subject, body: template.data.body, format: template.data.format || "text", state: "Taslak", members: companyIds.map(companyId => ({ companyId, status: "Yeni", note: "", nextContact: "", history: [] })) }, by);
    } else if (body.action === "campaignState") {
      const record = get<CrmCampaign>(body.id, "campaign", body.version);
      await saveCrmRecord(record, { ...record.data, state: body.state }, by);
    } else if (body.action === "activity") {
      const record = get<CrmCampaign>(body.id, "campaign", body.version);
      if (!record.data.members.some(m => m.companyId === body.companyId)) throw new CrmError("Firma bu kampanyada bulunmuyor.");
      await saveCrmRecord(record, { ...record.data, members: record.data.members.map(m => m.companyId === body.companyId ? { ...m, status: body.status, note: body.note, nextContact: body.nextContact, history: [...m.history, { at: new Date().toISOString(), by, status: body.status, note: body.note }] } : m) }, by);
    } else if (body.action === "convert" || body.action === "linkCustomer") {
      if (!user.can("musteriler.musteri-listesi")) throw new CrmError("Müşteri listesine aktarım yetkiniz yok.", 403);
      const record = get<CrmCompany>(body.id, "company", body.version), company = record.data, pool = await crmPool();
      if (company.customerId) return Response.json({ message: `Firma zaten müşteri listesinde (#${company.customerId}).` });
      if (body.action === "linkCustomer") {
        const found = (await pool.request().input("ID", body.customerId).query("SELECT ID FROM Firma WHERE ID=@ID AND Durum='Aktif'")).recordset[0];
        if (!found) throw new CrmError("Müşteri bulunamadı.");
        await saveCrmRecord(record, { ...company, conversion: undefined, customerId: body.customerId }, by);
      } else {
        if (company.conversion) throw new CrmError("Önceki aktarımın sonucu kontrol edilmeli. Müşteri listesinde arayıp mevcut müşteriyle eşleştirin.", 409);
        const match = (await pool.request().input("Name", company.name).input("Email", company.email).input("Tax", company.taxNumber).query("SELECT TOP 1 ID FROM Firma WHERE Durum='Aktif' AND (Firma_Adi=@Name OR (Mail=@Email AND @Email<>'') OR (Vergi_No=@Tax AND @Tax<>''))")).recordset[0];
        if (match) throw new CrmError(`Müşteri listesinde benzer kayıt var (#${match.ID}). Mevcut müşteriyle eşleştirin.`, 409);
        const locked = await saveCrmRecord(record, { ...company, conversion: "Hazırlanıyor" }, by);
        try {
          const inserted = await pool.request().input("Name", company.name).input("Email", company.email).input("Phone", company.phone).input("Contact", company.contact).input("Address", company.address).input("Tax", company.taxNumber)
            .query("INSERT INTO Firma (Firma_Adi,Mail,Telefon,Yetkili,Adres,Vergi_No,Tur,Durum) OUTPUT INSERTED.ID VALUES (@Name,@Email,@Phone,@Contact,@Address,@Tax,N'Müşteri',N'Aktif')");
          await saveCrmRecord(locked, { ...company, customerId: Number(inserted.recordset[0].ID) }, by);
        } catch (error) {
          // Do not repeat an INSERT after a timeout: its commit may already have happened.
          await saveCrmRecord(locked, { ...company, conversion: "Kontrol gerekli" }, by).catch(() => {});
          console.error("CRM müşteri aktarımı kontrol gerekli", error);
          throw new CrmError("Aktarım sonucu doğrulanamadı. Müşteri listesinde arayın ve mevcut müşteriyle eşleştirin; yeniden firma oluşturulmadı.", 409);
        }
      }
    }
    return Response.json({ message: "Kaydedildi." });
  } catch (error) { return failure(error); }
}
