import { assertSpektrotekKey, IntegrationError, listSpektrotekProducts } from "@/lib/spektrotekIntegration";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    assertSpektrotekKey(request);
    const sp = request.nextUrl.searchParams;
    return Response.json(await listSpektrotekProducts({ page: Number(sp.get("page") || 1), limit: Number(sp.get("limit") || 100), origin: request.nextUrl.origin }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof IntegrationError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Spektrotek product feed failed:", error);
    return Response.json({ error: "Ürünler alınamadı." }, { status: 500 });
  }
}
