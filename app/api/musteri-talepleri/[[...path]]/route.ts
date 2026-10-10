import { getPortalUser } from "@/lib/portalYetki";
import { after } from "next/server";
import { dispatchNotifications } from "@/lib/customerRequestNotifications";
import { addMessage, downloadFile, errorResponse, getRequest, jsonBody, listRequests, RequestError, updateRequest } from "@/lib/customerRequests";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path?: string[] }> };
async function handle(request: Request, context: Context) {
  try {
    const user = await getPortalUser();
    if (!user) throw new RequestError("Oturum açmanız gerekiyor.", 401);
    if (!user.can("iletisim.musteri-talep")) throw new RequestError("Bu bölüme erişim yetkiniz yok.", 403);
    const origin = request.headers.get("origin");
    if (request.method !== "GET" && origin && new URL(origin).host !== (request.headers.get("host") || new URL(request.url).host)) throw new RequestError("İstek kaynağı doğrulanamadı.", 403);
    const path = (await context.params).path || []; const [number, action, id, index] = path;
    let result: unknown;
    if (request.method === "GET" && !path.length) result = await listRequests();
    else if (request.method === "GET" && path.length === 1) result = await getRequest(number);
    else if (request.method === "GET" && action === "files" && path.length === 4) return await downloadFile(number, id, Number(index));
    else if (request.method === "PATCH" && path.length === 1) { const body = await jsonBody(request); if (typeof body.status !== "string" || !body.status) throw new RequestError("Durum gerekli."); result = await updateRequest(number, body.status); }
    else if (request.method === "POST" && action === "messages" && path.length === 2) result = await addMessage(number, request, "staff");
    else if (request.method === "POST" && action === "tracking-link" && path.length === 2) result = await updateRequest(number);
    else throw new RequestError("İşlem bulunamadı.", 404);
    after(() => dispatchNotifications());
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return errorResponse(e); }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
