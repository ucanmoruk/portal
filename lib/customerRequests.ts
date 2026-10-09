import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { cosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";
import { requestStatuses, type CustomerRequest, type RequestFields, type RequestMessage, type RequestSource } from "./customerRequestTypes";

export class RequestError extends Error { constructor(message: string, public status = 400) { super(message); } }
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
let ready: Promise<void> | undefined;
export async function schema() {
  if (!ready) ready = (async () => {
    const pool = await cosmoPool;
    const mysql = hasMysqlConfig();
    const definitions = {
      CustomerRequests: mysql
        ? "Number VARCHAR(10) PRIMARY KEY, Source VARCHAR(20) NOT NULL, ExternalID VARCHAR(80) NOT NULL, Status VARCHAR(30) NOT NULL, Payload LONGTEXT NOT NULL, CreatedAt VARCHAR(30) NOT NULL, TokenHash VARCHAR(64) NULL, TokenExpires VARCHAR(30) NULL, UNIQUE KEY UX_CustomerRequestExternal (Source,ExternalID)"
        : "Number VARCHAR(10) PRIMARY KEY, Source VARCHAR(20) NOT NULL, ExternalID VARCHAR(80) NOT NULL, Status NVARCHAR(30) NOT NULL, Payload NVARCHAR(MAX) NOT NULL, CreatedAt VARCHAR(30) NOT NULL, TokenHash VARCHAR(64) NULL, TokenExpires VARCHAR(30) NULL, CONSTRAINT UX_CustomerRequestExternal UNIQUE (Source,ExternalID)",
      CustomerRequestMessages: mysql
        ? "ID VARCHAR(36) PRIMARY KEY, RequestNumber VARCHAR(10) NOT NULL, Payload LONGTEXT NOT NULL, CreatedAt VARCHAR(30) NOT NULL, KEY IX_CustomerMessages (RequestNumber), FOREIGN KEY (RequestNumber) REFERENCES CustomerRequests(Number)"
        : "ID VARCHAR(36) PRIMARY KEY, RequestNumber VARCHAR(10) NOT NULL REFERENCES CustomerRequests(Number), Payload NVARCHAR(MAX) NOT NULL, CreatedAt VARCHAR(30) NOT NULL",
    };
    for (const [table, def] of Object.entries(definitions)) await pool.request().query(mysql
      ? `CREATE TABLE IF NOT EXISTS ${table} (${def}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci`
      : `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='${table}') CREATE TABLE ${table} (${def})`);
  })().catch(e => { ready = undefined; throw e; });
  await ready;
}
export function integrationSource(request: Request): RequestSource {
  const key = request.headers.get("x-api-key") || "";
  for (const source of ["spektrotek", "uniqueanalyse"] as const) {
    const secret = process.env[`CUSTOMER_REQUEST_${source.toUpperCase()}_API_KEY`];
    if (secret && secret.length >= 32 && key && timingSafeEqual(Buffer.from(hash(key)), Buffer.from(hash(secret)))) return source;
  }
  throw new RequestError("Geçersiz entegrasyon anahtarı.", 401);
}
export async function boundedBody(request: Request, limit = 64 * 1024) {
  if (Number(request.headers.get("content-length")) > limit) throw new RequestError("İstek boyutu sınırı aşıldı.", 413);
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw new RequestError("İstek boyutu sınırı aşıldı.", 413); } chunks.push(value); }
  return Buffer.concat(chunks);
}
export async function jsonBody(request: Request) { try { const body = JSON.parse((await boundedBody(request)).toString()); if (!body || typeof body !== "object" || Array.isArray(body)) throw new RequestError("JSON nesnesi gerekli."); return body; } catch (e) { if (e instanceof RequestError) throw e; throw new RequestError("Geçersiz JSON."); } }
export function validateFields(input: Record<string, unknown>): RequestFields {
  const result = {} as RequestFields;
  for (const [key, max] of Object.entries({ type: 100, company: 200, name: 160, email: 254, phone: 50, subject: 220, body: 20000 })) {
    const value = input[key]; if (typeof value !== "string" || !value.trim() || value.length > max) throw new RequestError(`${key} alanı gerekli; en fazla ${max} karakter olabilir.`);
    result[key as keyof RequestFields] = value.trim();
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new RequestError("Geçerli e-posta adresi girin.");
  return result;
}
const mapRequest = (row: Record<string, unknown>): CustomerRequest => ({ ...JSON.parse(String(row.Payload)), number: String(row.Number), source: row.Source as RequestSource, status: row.Status as CustomerRequest["status"], createdAt: String(row.CreatedAt) });
export async function createRequest(source: RequestSource, fields: RequestFields, externalId: unknown) {
  if (typeof externalId !== "string" || !/^[a-zA-Z0-9_-]{16,80}$/.test(externalId)) throw new RequestError("externalId 16–80 karakter benzersiz form işlem kimliği olmalı.");
  await schema(); const pool = await cosmoPool;
  const existing = async () => {
    const rows = await pool.request().input("source", source).input("external", externalId).query("SELECT Number,TokenHash FROM CustomerRequests WHERE Source=@source AND ExternalID=@external");
    if (!rows.recordset[0]) return null;
    const token = initialToken(source, externalId);
    const active = rows.recordset[0].TokenHash === hash(token);
    return { number: String(rows.recordset[0].Number), token: active ? token : null, trackingUrl: active ? trackingUrl(source, token) : null, created: false };
  };
  const previous = await existing(); if (previous) return previous;
  for (let attempt = 0; attempt < 5; attempt++) {
    const number = String(randomInt(1000000000, 10000000000)); const token = initialToken(source, externalId);
    try {
      await pool.request().input("number", number).input("source", source).input("external", externalId).input("status", requestStatuses[0]).input("payload", JSON.stringify(fields)).input("created", new Date().toISOString()).input("hash", hash(token)).input("expires", new Date(Date.now() + 180 * 86400000).toISOString()).query("INSERT INTO CustomerRequests (Number,Source,ExternalID,Status,Payload,CreatedAt,TokenHash,TokenExpires) VALUES (@number,@source,@external,@status,@payload,@created,@hash,@expires)");
      return { number, token, trackingUrl: trackingUrl(source, token), created: true };
    } catch (e) { const code = (e as { code?: string; number?: number }); if (code.code !== "ER_DUP_ENTRY" && code.number !== 2627 && code.number !== 2601) throw e; const duplicate = await existing(); if (duplicate) return duplicate; }
  }
  throw new Error("Talep numarası üretilemedi.");
}
function initialToken(source: RequestSource, externalId: string) {
  const secret = process.env[`CUSTOMER_REQUEST_${source.toUpperCase()}_API_KEY`];
  if (!secret || secret.length < 32) throw new RequestError("Entegrasyon yapılandırılmadı.", 503);
  return createHmac("sha256", secret).update(`${source}:${externalId}`).digest("hex");
}
function trackingUrl(source: RequestSource, token: string) { return `https://${source}.com/talep-takip?token=${token}`; }
export async function listRequests() {
  await schema(); const pool = await cosmoPool;
  const rows = await pool.request().query("SELECT Number,Source,Status,Payload,CreatedAt FROM CustomerRequests ORDER BY CreatedAt DESC");
  return rows.recordset.map(mapRequest);
}
export async function getRequest(number: string) {
  if (!/^\d{10}$/.test(number)) throw new RequestError("Talep bulunamadı.", 404);
  await schema(); const pool = await cosmoPool;
  const rows = await pool.request().input("number", number).query("SELECT Number,Source,Status,Payload,CreatedAt FROM CustomerRequests WHERE Number=@number");
  if (!rows.recordset[0]) throw new RequestError("Talep bulunamadı.", 404);
  const messages = await pool.request().input("number", number).query("SELECT ID,Payload,CreatedAt FROM CustomerRequestMessages WHERE RequestNumber=@number ORDER BY CreatedAt,ID");
  return { request: mapRequest(rows.recordset[0]), messages: messages.recordset.map(row => { const payload = JSON.parse(row.Payload); return { id: row.ID, role: payload.role, text: payload.text, createdAt: row.CreatedAt, files: payload.files.map((f: { name: string; data: string }) => ({ name: f.name, size: Buffer.from(f.data, "base64").length })) } as RequestMessage; }) };
}
export async function tokenNumber(token: string, source: RequestSource) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new RequestError("Takip bağlantısı geçersiz veya süresi dolmuş.", 404);
  await schema(); const pool = await cosmoPool;
  const rows = await pool.request().input("hash", hash(token)).input("source", source).input("now", new Date().toISOString()).query("SELECT Number FROM CustomerRequests WHERE TokenHash=@hash AND Source=@source AND TokenExpires>@now");
  if (!rows.recordset[0]) throw new RequestError("Takip bağlantısı geçersiz veya süresi dolmuş.", 404);
  return String(rows.recordset[0].Number);
}
export async function updateRequest(number: string, status?: string) {
  const { request } = await getRequest(number); const pool = await cosmoPool;
  if (status) {
    if (!requestStatuses.includes(status as CustomerRequest["status"])) throw new RequestError("Geçersiz durum.");
    await pool.request().input("number", number).input("status", status).query("UPDATE CustomerRequests SET Status=@status WHERE Number=@number"); return { ok: true };
  }
  const token = randomBytes(32).toString("hex");
  await pool.request().input("number", number).input("hash", hash(token)).input("expires", new Date(Date.now() + 180 * 86400000).toISOString()).query("UPDATE CustomerRequests SET TokenHash=@hash,TokenExpires=@expires WHERE Number=@number");
  return { trackingUrl: trackingUrl(request.source, token) };
}
export async function addMessage(number: string, request: Request, role: "staff" | "customer") {
  await getRequest(number);
  const bytes = await boundedBody(request, 7 * 1024 * 1024);
  let form: FormData;
  try { form = await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData(); } catch { throw new RequestError("Geçersiz dosya gönderimi."); }
  const text = String(form.get("text") || "").trim(); if (text.length > 20000) throw new RequestError("Mesaj en fazla 20000 karakter olabilir.");
  const uploaded = form.getAll("files"); if (uploaded.length > 3) throw new RequestError("En fazla 3 dosya eklenebilir.");
  const files: { name: string; data: string }[] = [];
  for (const value of uploaded) {
    if (!(value instanceof File) || !value.size) continue;
    if (value.size > 2 * 1024 * 1024) throw new RequestError("Dosya başına sınır 2 MB.", 413);
    if (!/\.(pdf|docx|xlsx|png|jpe?g|txt|csv)$/i.test(value.name)) throw new RequestError("Desteklenen dosyalar: PDF, DOCX, XLSX, PNG, JPG, TXT, CSV.");
    files.push({ name: value.name.replace(/[\x00-\x1f/\\]/g, "_").slice(0, 180), data: Buffer.from(await value.arrayBuffer()).toString("base64") });
  }
  if (!text && !files.length) throw new RequestError("Mesaj yazın veya dosya ekleyin.");
  const pool = await cosmoPool;
  await pool.request().input("id", randomUUID()).input("number", number).input("payload", JSON.stringify({ role, text, files })).input("created", new Date().toISOString()).query("INSERT INTO CustomerRequestMessages (ID,RequestNumber,Payload,CreatedAt) VALUES (@id,@number,@payload,@created)");
  return { ok: true };
}
export async function downloadFile(number: string, id: string, index: number) {
  await getRequest(number); const pool = await cosmoPool;
  const rows = await pool.request().input("number", number).input("id", id).query("SELECT Payload FROM CustomerRequestMessages WHERE RequestNumber=@number AND ID=@id");
  const file = rows.recordset[0] && JSON.parse(rows.recordset[0].Payload).files[index];
  if (!file || !Number.isInteger(index) || index < 0) throw new RequestError("Dosya bulunamadı.", 404);
  return new Response(Buffer.from(file.data, "base64"), { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" } });
}
export function errorResponse(e: unknown) { if (!(e instanceof RequestError)) console.error("Customer request operation failed", e); return Response.json({ error: e instanceof RequestError ? e.message : "İşlem tamamlanamadı. Lütfen tekrar deneyin." }, { status: e instanceof RequestError ? e.status : 500, headers: { "Cache-Control": "no-store" } }); }
