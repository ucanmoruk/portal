import { paymentReminderApprover } from "@/lib/paymentReminderAuth";
import { listDueInvoices, sendApprovedReminder } from "@/lib/paymentReminders";
import { paymentReportRecipients } from "@/lib/paymentReminderRules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!await paymentReminderApprover()) return Response.json({ error: "Bu işlem için yönetici yetkisi gereklidir." }, { status: 403 });
  try {
    return Response.json({ invoices: await listDueInvoices(), recipients: paymentReportRecipients });
  } catch (error) {
    console.error("[payment-reminders:list]", error);
    return Response.json({ error: "Vade listesi alınamadı. Veritabanı bağlantısını kontrol edin." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const approvedBy = await paymentReminderApprover();
  if (!approvedBy) return Response.json({ error: "Bu işlem için yönetici yetkisi gereklidir." }, { status: 403 });
  // A cross-origin form or request must never count as an approval.
  const origin = request.headers.get("origin");
  const expectedOrigin = new URL(process.env.PAYMENT_PORTAL_URL || process.env.NEXTAUTH_URL || request.url).origin;
  if (origin !== expectedOrigin || !request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Geçersiz istek." }, { status: 400 }); }
  if (!body || body.approved !== true || !Array.isArray(body.invoices) || !body.invoices.length || body.invoices.length > 10 ||
    body.invoices.some((invoice: { id?: unknown; fingerprint?: unknown } | null) => !invoice || !Number.isSafeInteger(invoice.id) || Number(invoice.id) <= 0 || typeof invoice.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(invoice.fingerprint))) {
    return Response.json({ error: "Bir seferde en fazla 10 faturayı açıkça onaylayın." }, { status: 400 });
  }
  try {
    const results = [];
    for (const invoice of body.invoices) results.push(await sendApprovedReminder(invoice.id, invoice.fingerprint, approvedBy));
    return Response.json({ results });
  } catch (error) {
    console.error("[payment-reminders:approve]", error);
    return Response.json({ error: "İşlem tamamlanamadı. Tekrar denemeden önce listeyi yenileyip gönderim durumlarını kontrol edin." }, { status: 500 });
  }
}
