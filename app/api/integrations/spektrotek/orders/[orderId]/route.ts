import { cosmoPool } from "@/lib/db";
import { assertSpektrotekKey, IntegrationError } from "@/lib/spektrotekIntegration";
import { ensureSpektrotekCommerce } from "@/lib/spektrotekCommerce";

export async function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    assertSpektrotekKey(request);
    const { orderId } = await context.params;
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(orderId)) throw new IntegrationError("Sipariş kimliği geçersiz.", 400);
    await ensureSpektrotekCommerce();
    const pool = await cosmoPool;
    const row = (await pool.request().input("Order", orderId).query("SELECT w.TalepID,t.TalepNo,t.Durum FROM SpektrotekWebOrder w INNER JOIN KysTalep t ON t.ID=w.TalepID WHERE w.OrderID=@Order")).recordset[0];
    if (!row) throw new IntegrationError("Web siparişi bulunamadı.", 404);
    const items = (await pool.request().input("ID", row.TalepID).query("SELECT StokID,Miktar,KabulMiktari FROM KysTalepKalem WHERE TalepID=@ID ORDER BY ID")).recordset;
    return Response.json({ orderId, portalOrderId: Number(row.TalepID), portalOrderNumber: row.TalepNo, status: row.Durum,
      items: items.map(item => ({ portalProductId: Number(item.StokID), quantity: Number(item.Miktar), shippedQuantity: Number(item.KabulMiktari || 0) })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof IntegrationError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "Sipariş durumu alınamadı." }, { status: 503, headers: { "Retry-After": "30" } });
  }
}
