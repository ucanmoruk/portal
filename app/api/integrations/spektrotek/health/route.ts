import { assertSpektrotekKey, IntegrationError } from "@/lib/spektrotekIntegration";

export async function GET(request: Request) {
  try {
    assertSpektrotekKey(request);
    return Response.json({ ok: true, service: "spektrotek-commerce", version: 1 }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof IntegrationError) return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    throw error;
  }
}
