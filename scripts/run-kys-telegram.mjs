// Run from cPanel cron every five minutes. No bot token in the URL or command output.
import env from "@next/env";
env.loadEnvConfig(process.cwd());
const base=process.env.KYS_TELEGRAM_PORTAL_URL||"https://lab.uniqueanalyse.com";
const secret=process.env.KYS_TELEGRAM_CRON_SECRET||"";
if(secret.length<32||new URL(base).protocol!=="https:")throw new Error("HTTPS portal adresi ve en az 32 karakterlik zamanlayıcı anahtarı gerekli.");
const response=await fetch(new URL("/api/cron/kys-telegram",base),{headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(180000)});
if(!response.ok)throw new Error(`Telegram zamanlayıcı HTTP ${response.status} hatası verdi.`);
const data=await response.json();
console.log(JSON.stringify(data));
