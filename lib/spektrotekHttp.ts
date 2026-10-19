import { ZodError } from "zod";
import { assertSpektrotekKey, IntegrationError } from "@/lib/spektrotekIntegration";

export async function spektrotekJson(request: Request, action: (body: unknown) => Promise<unknown>) {
  try {
    assertSpektrotekKey(request);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new IntegrationError("Content-Type application/json olmalı.", 415);
    const reader = request.body?.getReader();
    if (!reader) throw new IntegrationError("JSON gövdesi zorunlu.", 400);
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 131072) { await reader.cancel(); throw new IntegrationError("Gövde en fazla 128 KiB olabilir.", 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new IntegrationError("Geçersiz JSON.", 400); }
    return Response.json(await action(body), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof IntegrationError) return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    if (error instanceof ZodError) return Response.json({ error: "İstek alanları geçersiz.", issues: error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message })) }, { status: 400 });
    // Do not log payloads, customer details or database errors containing values.
    console.error("Spektrotek integration operation failed");
    return Response.json({ error: "Entegrasyon işlemi tamamlanamadı. Aynı isteği tekrar deneyin." }, { status: 503, headers: { "Retry-After": "30", "Cache-Control": "no-store" } });
  }
}
