import { z } from "zod";
import { getPortalUser } from "@/lib/portalYetki";
import { CrmError, findCrmRecord, insertCrmRecord, listCrmRecords, saveCrmRecord } from "@/lib/crmStore";
import { crmCompanyContacts, renderCrmTemplate, type CrmCompany, type CrmMail, type CrmRecord } from "@/lib/crmRules";
import { CRM_EMAIL_LIMIT, emailHasContent, renderCrmEmail, sanitizeCrmEmailHtml } from "@/lib/crmEmail";
import { htmlToPlainText } from "@/lib/htmlSanitize";
import { createCrmTransport, crmEmbeddedImages, crmMailConfig } from "@/lib/crmMailer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;
const id = z.string().uuid(), version = z.number().int().nonnegative();
const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("draft"), id, version, companyId: id, to: z.string().trim().email().max(320).optional(), subject: z.string().trim().min(1).max(500).refine(s => !/[\r\n]/.test(s)), body: z.string().trim().min(1).max(CRM_EMAIL_LIMIT), format: z.enum(["text", "html"]).default("html") }).strict(),
  z.object({ action: z.literal("send"), id, version: version.positive(), confirmTo: z.string().email(), confirmFrom: z.string().min(1).max(500) }).strict(),
  z.object({ action: z.literal("resolve"), id, version: version.positive(), outcome: z.enum(["Gönderildi", "Gönderilmedi"]), note: z.string().trim().min(5).max(2000) }).strict(),
]);
function failure(error: unknown) {
  if (error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({ error: "Firma, konu ve mail içeriğini kontrol edin." }, { status: 400 });
  if (error instanceof CrmError) return Response.json({ error: error.message }, { status: error.status });
  console.error("CRM birebir mail", error);
  return Response.json({ error: "Mail işlemi tamamlanamadı. Kaydı yenileyerek sonucunu kontrol edin." }, { status: 500 });
}
async function getCompany(companyId: string) {
  const record = await findCrmRecord(companyId);
  if (!record || record.kind !== "company" || record.deletedAt) throw new CrmError("Aktif firma bulunamadı.", 404);
  return record as CrmRecord<CrmCompany>;
}
async function getMail(mailId: string) {
  const record = await findCrmRecord(mailId);
  if (!record || record.kind !== "mail" || record.deletedAt) throw new CrmError("Mail kaydı bulunamadı.", 404);
  return record as CrmRecord<CrmMail>;
}
export async function GET(request: Request) {
  const user = await getPortalUser();
  if (!user?.can("iletisim.crm")) return Response.json({ error: "CRM erişim yetkiniz yok." }, { status: user ? 403 : 401 });
  try {
    const companyId = id.parse(new URL(request.url).searchParams.get("companyId"));
    await getCompany(companyId);
    let sender = "", configured = false, reason = "";
    try { const config = await crmMailConfig(); sender = `${config.from.name} <${config.from.address}>`; configured = true; }
    catch { reason = "Mail ayarları hazır değil. Yönetim › Ayarlar bölümündeki SMTP ayarlarını kontrol edin."; }
    const records = (await listCrmRecords("mail")).filter(r => (r.data as CrmMail).companyId === companyId && !r.deletedAt);
    return Response.json({ records, configured, sender, reason, canSend: user.can("iletisim.crm.mail-gonder"), canResolve: user.isAdmin });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const user = await getPortalUser();
  if (!user?.can("iletisim.crm")) return Response.json({ error: "CRM erişim yetkiniz yok." }, { status: user ? 403 : 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Geçersiz kaynak." }, { status: 403 });
  try {
    if (Number(request.headers.get("content-length") || 0) > 2_000_000) throw new CrmError("Mail içeriği çok büyük.", 413);
    const raw = await request.text();
    if (raw.length > 2_000_000) throw new CrmError("Mail içeriği çok büyük.", 413);
    const body = command.parse(JSON.parse(raw)), by = user.userName;
    if (body.action === "draft") {
      const company = await getCompany(body.companyId), existing = await findCrmRecord(body.id);
      if (existing && (existing.kind !== "mail" || (existing.data as CrmMail).companyId !== company.id)) throw new CrmError("Geçersiz taslak kimliği.", 409);
      if (existing && !["Taslak", "Hata"].includes((existing.data as CrmMail).state)) throw new CrmError("İşleme alınmış mail değiştirilemez. Yeni mail oluşturun.", 409);
      const recipients = crmCompanyContacts(company.data);
      if (!body.to && recipients.length > 1) throw new CrmError("Bu firmada birden fazla adres var. Gönderilecek kişiyi / e-posta adresini seçin.");
      const recipient = recipients.find(c => c.email.toLowerCase() === (body.to || recipients[0]?.email || "").toLowerCase());
      if (body.to && !recipient) throw new CrmError("Seçilen e-posta bu firmaya kayıtlı değil. Alıcıyı yeniden seçin.", 409);
      const recipientCompany = { ...company.data, contact: recipient ? recipient.name : company.data.contact };
      const content = body.format === "html" ? sanitizeCrmEmailHtml(body.body) : body.body;
      const html = renderCrmEmail(content, body.format, recipientCompany);
      if (!emailHasContent(html)) throw new CrmError("Mail içeriği boş olamaz.");
      const draft: CrmMail = { name: `${company.data.name} · ${body.subject}`, companyId: company.id, companyVersion: company.version, companyName: company.data.name,
        to: recipient?.email || "", toName: recipient?.name || "", toRole: recipient?.role || "", subject: body.subject, body: content, format: body.format, html, renderedSubject: renderCrmTemplate(body.subject, recipientCompany).replace(/[\r\n]/g, " "),
        state: "Taslak", from: "", startedAt: null, sentAt: null, messageId: "", error: "", history: (existing?.data as CrmMail | undefined)?.history || [] };
      if (existing) {
        const old = existing.data as CrmMail;
        if (body.version === 0 && old.companyVersion === draft.companyVersion && old.to.toLowerCase() === draft.to.toLowerCase() && old.subject === draft.subject && old.body === draft.body && old.format === draft.format) return Response.json({ record: existing });
        if (body.version !== existing.version) throw new CrmError("Taslak değişti. Yenileyip tekrar deneyin.", 409);
        return Response.json({ record: await saveCrmRecord(existing, draft, by) });
      }
      if (body.version !== 0) throw new CrmError("Taslak bulunamadı.", 404);
      try { return Response.json({ record: await insertCrmRecord("mail", draft, by, body.id) }); }
      catch (error) {
        const duplicate = await findCrmRecord(body.id);
        const other = duplicate?.data as CrmMail | undefined;
        if (duplicate?.kind === "mail" && other?.companyId === draft.companyId && other.companyVersion === draft.companyVersion && other.to.toLowerCase() === draft.to.toLowerCase() && other.subject === draft.subject && other.body === draft.body && other.format === draft.format && other.state === "Taslak") return Response.json({ record: duplicate });
        throw error;
      }
    }
    let record = await getMail(body.id);
    if (body.version !== record.version) throw new CrmError("Mail kaydı değişti. Yenileyip sonucunu kontrol edin.", 409);
    if (body.action === "resolve") {
      if (!user.isAdmin) throw new CrmError("Gönderim sonucu kontrolü için yönetici yetkisi gerekir.", 403);
      const stale = record.data.state === "Gönderiliyor" && record.data.startedAt && Date.now() - new Date(record.data.startedAt).getTime() > 5 * 60_000;
      if (record.data.state !== "Belirsiz" && !stale) throw new CrmError("Bu mailin kontrol gerektiren bir gönderimi yok.", 409);
      const state = body.outcome === "Gönderildi" ? "Gönderildi" : "Taslak";
      return Response.json({ record: await saveCrmRecord(record, { ...record.data, state, error: "", history: [...record.data.history, { at: new Date().toISOString(), by, state, note: `Yönetici kontrolü: ${body.outcome}. ${body.note}` }] }, by) });
    }
    if (!user.can("iletisim.crm.mail-gonder")) throw new CrmError("Mail gönderim yetkiniz yok.", 403);
    if (!["Taslak", "Hata"].includes(record.data.state)) throw new CrmError("Bu mail zaten işleme alındı. Tekrar gönderilmedi; geçmişteki sonucunu kontrol edin.", 409);
    const company = await getCompany(record.data.companyId);
    const recipient = crmCompanyContacts(company.data).find(c => c.email.toLowerCase() === record.data.to.toLowerCase());
    if (!recipient) throw new CrmError("Kaydedilen alıcı artık bu firmaya kayıtlı değil. Alıcıyı seçip taslağı yeniden kaydedin.", 409);
    const to = z.string().email().max(320).parse(recipient.email);
    if (to.toLowerCase() !== record.data.to.toLowerCase() || to.toLowerCase() !== body.confirmTo.toLowerCase() || company.version !== record.data.companyVersion) throw new CrmError("Firma veya alıcı bilgisi değişti. Taslağı yeniden kaydedip önizleyin.", 409);
    const rows = await listCrmRecords();
    if (rows.some(r => r.kind === "company" && crmCompanyContacts(r.data as CrmCompany).some(c => c.email.toLowerCase() === to.toLowerCase()) && (r.data as CrmCompany).permission === "Ret")) throw new CrmError("Bu e-posta adresi için ret kaydı var. Mail gönderilmedi.", 409);
    const config = await crmMailConfig();
    if (body.confirmFrom !== `${config.from.name} <${config.from.address}>`) throw new CrmError("Gönderen hesabı değişti. Gönderim kontrolünü yeniden açın.", 409);
    const transport = createCrmTransport(config);
    const startedAt = new Date().toISOString();
    const messageId = `<crm-${record.id}@${config.from.address.split("@")[1]}>`;
    // Atomic version claim precedes SMTP. Another process cannot send the same draft.
    record = await saveCrmRecord(record, { ...record.data, state: "Gönderiliyor", from: config.from.address, startedAt, messageId, error: "",
      history: [...record.data.history, { at: startedAt, by, state: "Gönderiliyor", note: `Alıcı: ${to}` }] }, by) as CrmRecord<CrmMail>;
    let attempted = false;
    try {
      // Recheck the company after claiming, immediately before the external side effect.
      const latest = await getCompany(company.id);
      if (latest.version !== company.version || latest.data.permission === "Ret") throw new CrmError("Firma bilgileri gönderim hazırlanırken değişti. Taslağı yenileyin.", 409);
      const embedded = crmEmbeddedImages(record.data.html, record.id);
      attempted = true;
      const result = await transport.sendMail({ from: config.from, replyTo: config.replyTo, to: { name: record.data.toName || record.data.companyName, address: to },
        envelope: { from: config.from.address, to: [to] }, subject: record.data.renderedSubject, messageId,
        text: htmlToPlainText(record.data.html.replace(/<br\s*\/?\s*>|<\/(?:p|div|h[1-6]|li|tr)>/gi, "\uE000")).replace(/\s*\uE000\s*/g, "\n").trim(),
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#20242a">${embedded.html}</div>`, attachments: embedded.attachments,
        disableFileAccess: true, disableUrlAccess: true });
      const accepted = (result.accepted || []).map(value => (typeof value === "string" ? value : value.address).toLowerCase());
      if (!accepted.includes(to.toLowerCase()) || result.rejected?.length) throw new Error("SMTP alıcı kabulü doğrulanamadı.");
      const sentAt = new Date().toISOString();
      const sent = await saveCrmRecord(record, { ...record.data, state: "Gönderildi", sentAt, messageId: result.messageId || messageId,
        history: [...record.data.history, { at: sentAt, by, state: "Gönderildi", note: "SMTP sunucusu alıcıyı kabul etti. Teslim / okunma teyidi değildir." }] }, by);
      return Response.json({ record: sent, message: "Mail SMTP sunucusuna iletildi. Teslim ve açılma teyidi henüz yok." });
    } catch (error) {
      const code = (error as { code?: string }).code;
      const uncertain = attempted && !["EAUTH", "EDNS", "EENVELOPE"].includes(code || "");
      const state = uncertain ? "Belirsiz" : "Hata";
      const note = uncertain ? "Gönderimin sonucu belirsiz. Tekrar göndermeden önce SMTP kayıtları veya posta kutusu üzerinden kontrol edin." : "Mail gönderilemedi. SMTP ayarlarını ve firma bilgilerini kontrol edin.";
      console.error("CRM mail gönderimi", { id: record.id, code, uncertain });
      await saveCrmRecord(record, { ...record.data, state, error: note, history: [...record.data.history, { at: new Date().toISOString(), by, state, note }] }, by).catch(() => {});
      throw new CrmError(note, uncertain ? 409 : 502);
    } finally { transport.close(); }
  } catch (error) { return failure(error); }
}
