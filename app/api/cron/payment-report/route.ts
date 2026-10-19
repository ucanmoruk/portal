import { timingSafeEqual } from "node:crypto";
import { sendDailyPaymentReport } from "@/lib/paymentReminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.PAYMENT_REPORT_CRON_SECRET;
  const token = request.headers.get("authorization") || "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(token);
  if (!secret || secret.length < 32 || received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  }
  try {
    const results = await sendDailyPaymentReport();
    return Response.json({ results }, { status: results.some(result => result.state === "uncertain") ? 502 : 200 });
  } catch (error) {
    console.error("[payment-report]", error);
    return Response.json({ error: "Günlük rapor gönderilemedi. Sunucu kayıtlarını kontrol edin." }, { status: 500 });
  }
}
