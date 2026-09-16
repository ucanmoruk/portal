import nodemailer from "nodemailer";
import { getPortalUser } from "@/lib/portalYetki";
import { getAllSettings } from "@/lib/settings";
import { buildKabulMail, KABUL_MAIL_MESAJ, loadKabulMailData } from "@/lib/numuneKabulMail";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const user = await getPortalUser();
  if (!user) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  if (!user.can("laboratuvar.numune-takip")) return Response.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Geçersiz istek" }, { status: 400 }); }
  if (!body || typeof body !== "object") return Response.json({ error: "Geçersiz istek" }, { status: 400 });
  if (!Array.isArray(body.ids) || body.ids.length < 1 || body.ids.length > 200 || body.ids.some((id: unknown) => !Number.isSafeInteger(id) || Number(id) <= 0)) return Response.json({ error: "1–200 numune seçin." }, { status: 400 });
  if (!["preview", "send"].includes(body.action)) return Response.json({ error: "Geçersiz işlem" }, { status: 400 });
  const ids = [...new Set<number>(body.ids)];
  let data;
  try { data = await loadKabulMailData(ids); } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Veriler alınamadı" }, { status: 400 }); }
  if (body.action === "preview") return Response.json({ ...data, mesaj: KABUL_MAIL_MESAJ, html: buildKabulMail(data).html });
  const to = typeof body.to === "string" ? body.to.split(/[;,]/).map((s: string) => s.trim()).filter(Boolean) : [];
  const cc = typeof body.cc === "string" ? body.cc.split(/[;,]/).map((s: string) => s.trim()).filter(Boolean) : [];
  if (!to.length || to.length + cc.length > 20 || [...to,...cc].some(s => !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s))) return Response.json({ error: "Geçerli alıcı e-posta adresleri girin (en fazla 20)." }, { status: 400 });
  const konu = typeof body.konu === "string" ? body.konu.trim() : data.konu;
  const mesaj = typeof body.mesaj === "string" ? body.mesaj.trim() : KABUL_MAIL_MESAJ;
  if (!konu || konu.length > 250 || /[\r\n]/.test(konu) || mesaj.length > 5000) return Response.json({ error: "Konu veya mesaj geçersiz." }, { status: 400 });
  try {
    const cfg = await getAllSettings();
    const setting = (key: string, fallback = "") => cfg[key] || process.env[key] || fallback;
    const host = setting("MAIL_HOST").trim().replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, "");
    const port = Number(setting("MAIL_PORT", "587"));
    const user = setting("MAIL_USER").trim(), pass = setting("MAIL_PASS");
    if (!host || !user || !pass) return Response.json({ error: "SMTP ayarları yapılmamış. Admin → Ayarlar bölümünü kontrol edin." }, { status: 503 });
    const transporter = nodemailer.createTransport({ host, port, secure: setting("MAIL_SECURE", "false") === "true", auth: { user, pass }, connectionTimeout: 15000, socketTimeout: 30000 });
    try {
      const content = buildKabulMail(data, mesaj);
      const info = await transporter.sendMail({ from: { name: "UNIQUE Analyse", address: setting("MAIL_FROM", user).trim() }, to, cc, subject: konu, ...content });
      if (info.rejected?.length) return Response.json({ error: "Bazı alıcılar sunucu tarafından reddedildi. Tekrar göndermeden önce alıcıları kontrol edin.", accepted: info.accepted, rejected: info.rejected }, { status: 502 });
      return Response.json({ success: true });
    } finally { transporter.close(); }
  } catch (e) { console.error("Numune kabul bilgi maili gönderilemedi", e); return Response.json({ error: "Mail gönderilemedi. SMTP ayarlarını kontrol edin; tekrar göndermeden önce gönderim durumunu kontrol edin." }, { status: 502 }); }
}
