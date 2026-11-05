import { getPortalUser } from "@/lib/portalYetki";
import { listUniqueRequests } from "@/lib/uniqueTalepStore";
import { syncUniqueMailbox } from "@/lib/uniqueTalepMailbox";

export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET() {
  const user = await getPortalUser();
  if (!user?.can("iletisim.unique-talep")) return Response.json({ error: "Yetkisiz erişim" }, { status: user ? 403 : 401 });
  try {
    const rows = await listUniqueRequests();
    return Response.json({ data: rows.map(({ text, offer, ...row }) => ({ ...row, summary: text.slice(0, 250), hasOffer: !!offer })) });
  } catch { return Response.json({ error: "Talepler okunamadı." }, { status: 500 }); }
}
export async function POST() {
  const user = await getPortalUser();
  if (!user?.can("iletisim.unique-talep")) return Response.json({ error: "Yetkisiz erişim" }, { status: user ? 403 : 401 });
  try { return Response.json(await syncUniqueMailbox()); }
  catch { return Response.json({ error: "Posta kutusu taranamadı. IMAP erişimini ve info hesabının ayarlarını kontrol edin." }, { status: 503 }); }
}
