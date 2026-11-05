import { timingSafeEqual } from "node:crypto";
import { loadDotenvOnce } from "@/lib/loadDotenv";
import { syncUniqueMailbox } from "@/lib/uniqueTalepMailbox";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  loadDotenvOnce();
  const secret = process.env.KYS_TELEGRAM_CRON_SECRET || "";
  const expected = Buffer.from(`Bearer ${secret}`), actual = Buffer.from(request.headers.get("authorization") || "");
  if (secret.length < 32 || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return Response.json({ error: "Yetkisiz erişim." }, { status: 401 });
  try { return Response.json(await syncUniqueMailbox()); }
  catch { return Response.json({ error: "Info posta kutusu taranamadı; IMAP bağlantı ayarlarını kontrol edin." }, { status: 503 }); }
}
