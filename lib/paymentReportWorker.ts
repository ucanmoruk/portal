import { loadDotenvOnce } from "@/lib/loadDotenv";
import { istanbulDate } from "@/lib/paymentReminderRules";
import { paymentReportComplete, sendDailyPaymentReport } from "@/lib/paymentReminders";

// The external cron remains the primary wake-up trigger. While Passenger is
// running, this worker recovers missed runs without depending on the HTTP proxy.
const worker = globalThis as typeof globalThis & {
  paymentReportTimer?: ReturnType<typeof setInterval>;
};

export function startPaymentReportWorker() {
  if (worker.paymentReportTimer) return;
  let busy = false;
  let completedDate = "";
  let nextAttempt = 0;
  const tick = async () => {
    loadDotenvOnce();
    if ((process.env.PAYMENT_REPORT_CRON_SECRET?.length || 0) < 32) return;
    const today = istanbulDate();
    const hour = Number(new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Istanbul", hour: "2-digit", hourCycle: "h23",
    }).format(new Date()));
    if (busy || hour < 9 || completedDate === today || Date.now() < nextAttempt) return;
    busy = true;
    nextAttempt = Date.now() + 5 * 60_000;
    try {
      if (await paymentReportComplete(today)) { completedDate = today; return; }
      const results = await sendDailyPaymentReport();
      if (results.every(result => result.state === "sent" || result.state === "already-sent")) completedDate = today;
      else console.warn("[payment-report:worker] Eksik iç raporlar 5 dakika sonra yeniden denenecek.");
    } catch (error) {
      console.error("[payment-report:worker]", error);
    } finally { busy = false; }
  };
  worker.paymentReportTimer = setInterval(() => { void tick(); }, 60_000);
  worker.paymentReportTimer.unref();
  // Defer network activity until after application startup has completed.
  setTimeout(() => { void tick(); }, 5_000).unref();
}
