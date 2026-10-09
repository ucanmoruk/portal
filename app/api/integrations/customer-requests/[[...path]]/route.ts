import { addMessage, createRequest, downloadFile, errorResponse, getRequest, integrationSource, jsonBody, RequestError, tokenNumber, validateFields } from "@/lib/customerRequests";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path?: string[] }> };
async function handle(request: Request, context: Context) {
  try {
    const source = integrationSource(request);
    const path = (await context.params).path || [];
    if (!path.length && request.method === "POST") {
      const body = await jsonBody(request);
      const result = await createRequest(source, validateFields(body), body.externalId);
      return Response.json(result, { status: result.created ? 201 : 200, headers: { "Cache-Control": "no-store" } });
    }
    const number = await tokenNumber(path[0] || "", source);
    let result: unknown;
    if (request.method === "GET" && path.length === 1) result = await getRequest(number);
    else if (request.method === "POST" && path.length === 2 && path[1] === "messages") result = await addMessage(number, request, "customer");
    else if (request.method === "GET" && path.length === 4 && path[1] === "files") return await downloadFile(number, path[2], Number(path[3]));
    else throw new RequestError("İşlem bulunamadı.", 404);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return errorResponse(e); }
}
export const GET = handle;
export const POST = handle;
