import { z } from "zod";
import { getPortalUser } from "@/lib/portalYetki";
import { getAllSettings, setSettings } from "@/lib/settings";
import { crmSalesAiConfig } from "@/lib/crmSalesAi";

export const dynamic = "force-dynamic";
const fields = z.object({ provider: z.enum(["anthropic", "openai"]), model: z.string().trim().max(120).regex(/^[a-zA-Z0-9._:/-]*$/), apiKey: z.string().trim().max(4096).refine(s => !s || (s.length >= 10 && !/\s/.test(s)), "API anahtarını kontrol edin.") }).strict();
export async function GET() {
  const user = await getPortalUser();
  if (!user?.isAdmin) return Response.json({ error: "Yönetici yetkisi gerekir." }, { status: user ? 403 : 401 });
  try {
    const settings = await getAllSettings();
    let configured = false;
    try { await crmSalesAiConfig(); configured = true; } catch { /* no secrets in response */ }
    return Response.json({ provider: settings.CRM_SALES_AI_PROVIDER || process.env.CRM_AI_PROVIDER || (process.env.ANTHROPIC_API_KEY ? "anthropic" : "openai"), model: settings.CRM_SALES_AI_MODEL || "", configured });
  } catch { return Response.json({ error: "AI ayarları okunamadı." }, { status: 500 }); }
}
export async function POST(request: Request) {
  const user = await getPortalUser();
  if (!user?.isAdmin) return Response.json({ error: "Yönetici yetkisi gerekir." }, { status: user ? 403 : 401 });
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Geçersiz kaynak." }, { status: 403 });
  try {
    const raw = await request.text();
    if (raw.length > 6000) return Response.json({ error: "İstek çok büyük." }, { status: 413 });
    const body = fields.parse(JSON.parse(raw));
    const updates: Record<string, string> = { CRM_SALES_AI_PROVIDER: body.provider, CRM_SALES_AI_MODEL: body.model };
    if (body.apiKey) updates[body.provider === "anthropic" ? "CRM_SALES_ANTHROPIC_API_KEY" : "CRM_SALES_OPENAI_API_KEY"] = body.apiKey;
    await setSettings(updates);
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof z.ZodError ? "Sağlayıcı, model veya API anahtarını kontrol edin." : "AI ayarları kaydedilemedi." }, { status: error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 500 }); }
}
