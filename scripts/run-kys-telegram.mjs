// Run from cPanel cron every five minutes. No bot token in the URL or command output.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Cron does not inherit the cPanel app environment. Read only runner settings.
for (const filename of [".env.telegram-cron", ".env.local", ".env.production", ".env"]) {
  const file = path.resolve(filename);
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?(KYS_TELEGRAM_CRON_SECRET|KYS_TELEGRAM_PORTAL_URL)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]]) continue;
    const value = match[2];
    process.env[match[1]] = /^(['"]).*\1$/.test(value) ? value.slice(1, -1) : value.replace(/\s+#.*$/, "").trim();
  }
}
const base=process.env.KYS_TELEGRAM_PORTAL_URL||"https://lab.uniqueanalyse.com";
const secret=process.env.KYS_TELEGRAM_CRON_SECRET||"";
if(secret.length<32||new URL(base).protocol!=="https:")throw new Error("HTTPS portal adresi ve en az 32 karakterlik zamanlayıcı anahtarı gerekli.");
if (process.argv.includes("--check")) {
  console.log("Telegram cron yapılandırması hazır. Gönderim yapılmadı.");
  process.exit(0);
}
const response=await fetch(new URL("/api/cron/kys-telegram",base),{headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(180000)});
if(!response.ok)throw new Error(`Telegram zamanlayıcı HTTP ${response.status} hatası verdi.`);
const data=await response.json();
console.log(JSON.stringify(data));
