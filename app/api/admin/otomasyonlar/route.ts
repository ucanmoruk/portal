import { paymentReminderApprover } from "@/lib/paymentReminderAuth";
import { getPaymentAutomationOverview } from "@/lib/paymentReminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!await paymentReminderApprover()) return Response.json({ error: "Bu alan yalnızca yöneticiye açıktır." }, { status: 403 });
  try {
    return Response.json(await getPaymentAutomationOverview(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[payment-automation:overview]", error);
    return Response.json({ error: "Otomasyon kayıtları alınamadı. Veritabanı ve sunucu ayarlarını kontrol edin." }, { status: 500 });
  }
}
