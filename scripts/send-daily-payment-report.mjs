// Run from the deployed project directory; secrets remain in the environment.
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
const base = process.env.PAYMENT_PORTAL_URL || process.env.NEXTAUTH_URL;
const secret = process.env.PAYMENT_REPORT_CRON_SECRET;
if (!base || !base.startsWith("https://") || !secret || secret.length < 32) {
  throw new Error("PAYMENT_PORTAL_URL (HTTPS) ve PAYMENT_REPORT_CRON_SECRET (en az 32 karakter) gerekli.");
}
const response = await fetch(new URL("/api/cron/payment-report", base), {
  headers: { Authorization: `Bearer ${secret}` },
  redirect: "error",
  signal: AbortSignal.timeout(180000),
});
const result = await response.json();
if (!response.ok) throw new Error(`Günlük vade raporu başarısız: HTTP ${response.status}`);
console.log(JSON.stringify(result));
