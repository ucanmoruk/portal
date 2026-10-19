import nodemailer from "nodemailer";
import { existsSync } from "node:fs";
import path from "node:path";
import { cosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";
import { getAllSettings } from "@/lib/settings";
import { escapeMailHtml, laboratoryMailBrand, renderLaboratoryMail } from "@/lib/laboratuvarMailTemplate";
import { invoiceMailClosing } from "@/lib/invoiceMailContent";
import { dueInvoice, istanbulDate, paymentReportRecipients, type DueInvoice } from "@/lib/paymentReminderRules";

let schema: Promise<void> | undefined;
export function ensureReminderSchema() {
  return schema ??= (async () => {
    const pool = await cosmoPool;
    const columns = `DeliveryKey VARCHAR(160) NOT NULL PRIMARY KEY, State VARCHAR(20) NOT NULL,
      Recipient VARCHAR(500) NOT NULL, ApprovedBy VARCHAR(100) NULL, Details ${hasMysqlConfig() ? "LONGTEXT" : "NVARCHAR(MAX)"} NULL`;
    await pool.request().query(hasMysqlConfig()
      ? `CREATE TABLE IF NOT EXISTS PaymentReminderDelivery (${columns}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      : `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='PaymentReminderDelivery') CREATE TABLE PaymentReminderDelivery (${columns})`);
  })().catch(error => { schema = undefined; throw error; });
}

export async function listDueInvoices(today = istanbulDate()) {
  await ensureReminderSchema();
  const pool = await cosmoPool;
  // Use the same allocation and latest-status rules as the customer ledger.
  const result = await pool.request().input("today", today).query(`
    SELECT f.ID, f.Fatura_No AS FaturaNo, f.VadeTarihi,
      ISNULL(f.Toplam,0) AS Tutar, ISNULL(f.Odenen_Tutar,0) AS DirektOdenen,
      ISNULL((SELECT SUM(d.Tutar) FROM FirmaCariOdemeDagitim d WHERE d.FaturaID=f.ID),0) AS Mahsup,
      COALESCE(
        (SELECT TOP 1 o.Odeme_Durumu FROM Odeme o WHERE o.Fatura_ID=f.ID AND ISNULL(o.Odeme_Durumu,N'')<>N'Proforma' ORDER BY o.ID DESC),
        (SELECT TOP 1 o.Odeme_Durumu FROM Odeme o WHERE o.Evrak_No=f.ProformaNo AND o.Fatura_ID IS NULL AND ISNULL(o.Odeme_Durumu,N'')<>N'Proforma' ORDER BY o.ID DESC),
        N'Ödeme Bekliyor') AS OdemeDurumu,
      COALESCE(NULLIF(fr.Firma_Adi,''),NULLIF(f.FirmaAdManuel,''),'') AS FirmaAd, ISNULL(fr.Mail,'') AS FirmaEmail
    FROM Fatura f LEFT JOIN Firma fr ON fr.ID=f.FaturaFirmaID
    WHERE f.Durum='Aktif' AND f.Kaynak='Unique' AND f.VadeTarihi<=@today
    ORDER BY f.VadeTarihi, f.ID`);
  const deliveries = await pool.request().input("prefix", `reminder:${today}:%`).query("SELECT DeliveryKey, State FROM PaymentReminderDelivery WHERE DeliveryKey LIKE @prefix");
  const states = new Map(deliveries.recordset.map(row => [String(row.DeliveryKey), String(row.State)]));
  return result.recordset.flatMap(row => {
    const invoice = dueInvoice(row, today);
    return invoice ? [{ ...invoice, deliveryState: states.get(`reminder:${today}:${invoice.id}`) || "" }] : [];
  });
}

async function mailer() {
  const cfg = await getAllSettings();
  const setting = (key: string, fallback = "") => cfg[key] || process.env[key] || fallback;
  const host = setting("MAIL_HOST").trim().replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, "");
  const user = setting("MAIL_USER"), pass = setting("MAIL_PASS");
  if (!host || !user || !pass) throw new Error("SMTP ayarları eksik. Admin → Ayarlar bölümünü kontrol edin.");
  const transporter = nodemailer.createTransport({ host, port: Number(setting("MAIL_PORT", "587")), secure: setting("MAIL_SECURE", "false") === "true", auth: { user, pass }, connectionTimeout: 15000, socketTimeout: 30000 });
  const logo = path.join(process.cwd(), "public", "unique-logo.png");
  return { cfg, transporter, from: setting("MAIL_FROM", user), attachments: existsSync(logo) ? [{ filename: "unique-logo.png", path: logo, cid: "unique-logo" }] : [] };
}

// A unique primary key claims each delivery across workers. Unknown SMTP outcomes
// remain claimed: retries must never silently send a second copy.
async function claim(key: string, recipient: string, approvedBy: string | null, details: unknown) {
  const pool = await cosmoPool;
  try {
    await pool.request().input("key", key).input("recipient", recipient).input("approvedBy", approvedBy)
      .input("details", JSON.stringify({ at: new Date().toISOString(), data: details }))
      .query("INSERT INTO PaymentReminderDelivery (DeliveryKey,State,Recipient,ApprovedBy,Details) VALUES (@key,'sending',@recipient,@approvedBy,@details)");
    return true;
  } catch (error) {
    const existing = await pool.request().input("key", key).query("SELECT State FROM PaymentReminderDelivery WHERE DeliveryKey=@key");
    if (existing.recordset.length) return false;
    throw error;
  }
}

async function finish(key: string, state: string, details: unknown) {
  const pool = await cosmoPool;
  await pool.request().input("key", key).input("state", state).input("details", JSON.stringify({ at: new Date().toISOString(), data: details }))
    .query("UPDATE PaymentReminderDelivery SET State=@state, Details=@details WHERE DeliveryKey=@key");
}

const money = (value: number) => `${value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
const displayDate = (value: string) => value.split("-").reverse().join(".");
const headings = ["Firma", "Fatura", "Vade", "Gecikme (gün)", "Açık bakiye", "Alıcı"];
const invoiceRow = (invoice: DueInvoice) => [invoice.company, invoice.invoiceNo, displayDate(invoice.dueDate), String(invoice.daysLate), money(invoice.balance), invoice.email || "Geçerli e-posta yok"];

export async function sendDailyPaymentReport() {
  const today = istanbulDate();
  const invoices = await listDueInvoices(today);
  const mail = await mailer();
  const base = process.env.PAYMENT_PORTAL_URL || process.env.NEXTAUTH_URL;
  if (!base || !/^https:\/\//.test(base)) throw new Error("PAYMENT_PORTAL_URL için portalın HTTPS adresini tanımlayın.");
  const approvalUrl = new URL("/musteriler/fatura-takip/hatirlatmalar", base).href;
  const html = renderLaboratoryMail({ brand: laboratoryMailBrand(mail.cfg), title: `Günlük Vade Raporu — ${displayDate(today)}`,
    message: "Bugün vadesi gelen ve vadesi geçmiş Unique faturaları. Bu rapor müşteriye hatırlatma göndermez; hatırlatmalar ayrıca onayınızı gerektirir.",
    intro: invoices.length ? `${invoices.length} açık fatura bulundu.` : "Bugün vadesi gelen veya geçmiş açık fatura bulunmuyor.",
    headings, rows: invoices.map(invoiceRow), summary: [{ label: "Açık bakiye", value: money(invoices.reduce((sum, invoice) => sum + invoice.balance, 0)) }],
    note: `Rapor Europe/Istanbul takvimine göre hazırlanmıştır. <a href="${escapeMailHtml(approvalUrl)}">Portala giriş yapıp hatırlatmaları inceleyin ve onaylayın</a>.`,
  });
  const results = [];
  for (const recipient of paymentReportRecipients) {
    const key = `report:${today}:${recipient}`;
    if (!await claim(key, recipient, null, { count: invoices.length })) {
      const pool = await cosmoPool;
      const previous = await pool.request().input("key", key).query("SELECT State FROM PaymentReminderDelivery WHERE DeliveryKey=@key");
      results.push({ recipient, state: previous.recordset[0]?.State === "sent" ? "already-sent" : "uncertain" });
      continue;
    }
    try {
      const info = await mail.transporter.sendMail({ from: mail.from, to: recipient, subject: `Günlük Vade Raporu — ${displayDate(today)}`, html, attachments: mail.attachments });
      await finish(key, "sent", { messageId: info.messageId, count: invoices.length });
      results.push({ recipient, state: "sent" });
    } catch (error) {
      await finish(key, "uncertain", { error: error instanceof Error ? error.message : "SMTP hatası" });
      results.push({ recipient, state: "uncertain" });
    }
  }
  return results;
}

export async function sendApprovedReminder(id: number, fingerprint: string, approvedBy: string) {
  const today = istanbulDate();
  const mail = await mailer();
  const invoice = (await listDueInvoices(today)).find(invoice => invoice.id === id);
  if (!invoice || invoice.fingerprint !== fingerprint) return { id, state: "changed", message: "Fatura değişti veya kapandı. Listeyi yenileyin ve tekrar inceleyin." };
  if (!invoice.email) return { id, state: "invalid", message: "Geçerli müşteri e-posta adresi yok." };
  const key = `reminder:${today}:${id}`;
  if (!await claim(key, invoice.email, approvedBy, invoice)) return { id, state: "already-claimed", message: "Bu fatura için bugün gönderim kaydı var." };
  const html = renderLaboratoryMail({ brand: laboratoryMailBrand(mail.cfg), title: "Ödeme Hatırlatması",
    message: "Sayın Yetkili,\n\nKayıtlarımızda aşağıdaki faturanızın ödeme vadesine ulaştığı ve açık bakiyesi bulunduğu görülmektedir. Ödeme planınız hakkında bilgi paylaşmanızı rica ederiz. Ödemenizi gerçekleştirdiyseniz dekontunuzu iletebilirsiniz.",
    intro: `${invoice.company} için ödeme bilgileri:`, headings, rows: [invoiceRow(invoice)], closing: invoiceMailClosing,
    note: `Bu hatırlatma ${displayDate(today)} tarihli kayıtlar esas alınarak yetkili onayıyla gönderilmiştir.`,
  });
  try {
    const info = await mail.transporter.sendMail({ from: mail.from, to: invoice.email, subject: `Ödeme Hatırlatması — ${invoice.invoiceNo}`, html, attachments: mail.attachments });
    const rejected = Array.isArray(info.rejected) ? info.rejected.map(String) : [];
    const state = rejected.length ? "uncertain" : "sent";
    await finish(key, state, { invoice, messageId: info.messageId, rejected });
    return { id, state, message: rejected.length ? "Bazı adreslere gönderim başarısız. Gönderim kaydını kontrol edin." : "Gönderildi." };
  } catch (error) {
    await finish(key, "uncertain", { invoice, error: error instanceof Error ? error.message : "SMTP hatası" });
    return { id, state: "uncertain", message: "Gönderim sonucu doğrulanamadı; çift gönderimi önlemek için tekrar gönderilmedi." };
  }
}
