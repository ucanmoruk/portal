import nodemailer from "nodemailer";
import { z } from "zod";
import { getAllSettings } from "@/lib/settings";
import { CrmError } from "@/lib/crmStore";

const email = z.string().trim().email().max(320);
function address(value: string) {
  if (/[\r\n]/.test(value)) throw new CrmError("SMTP gönderen adresini kontrol edin.");
  const parts = value.trim().match(/^([^<>]*)<([^<>]+)>$/);
  return { name: parts ? parts[1].trim().replace(/^"|"$/g, "") : "", address: email.parse(parts ? parts[2] : value) };
}
export async function crmMailConfig() {
  const cfg = await getAllSettings();
  const setting = (key: string, fallback = "") => cfg[`CRM_${key}`] || process.env[`CRM_${key}`] || cfg[key] || process.env[key] || fallback;
  const host = setting("MAIL_HOST").trim().replace(/^smtps?:\/\//i, "");
  const user = setting("MAIL_USER").trim(), pass = setting("MAIL_PASS");
  const port = Number(setting("MAIL_PORT", "465"));
  const secure = setting("MAIL_SECURE", port === 465 ? "true" : "false") === "true";
  if (!host || /[\s/\\]/.test(host) || !user || !pass || !Number.isInteger(port) || port < 1 || port > 65535) throw new CrmError("SMTP ayarları eksik veya geçersiz. Yönetim › Ayarlar bölümündeki mail ayarlarını kontrol edin.", 503);
  const from = address(setting("MAIL_FROM", user));
  from.name ||= setting("MAIL_FROM_NAME", "Unique Analyse").replace(/[\r\n]/g, " ");
  const replyTo = address(setting("MAIL_REPLY_TO", from.address));
  return { host, port, secure, user, pass, from, replyTo };
}
/** Converts only in-memory raster image data. Never reads files or fetches user URLs. */
export function crmEmbeddedImages(html: string, mailId: string) {
  const attachments: { filename: string; content: Buffer; contentType: string; cid: string; contentDisposition: "inline" }[] = [];
  const content = html.replace(/(<img\b[^>]*\bsrc=")data:image\/(png|jpe?g|gif|webp|bmp);base64,([a-z0-9+/=]+)(")/gi, (_full, prefix: string, type: string, base64: string, suffix: string) => {
    const cid = `crm-${mailId}-${attachments.length}@portal.local`;
    attachments.push({ filename: `image-${attachments.length}.${type.toLowerCase()}`, content: Buffer.from(base64, "base64"), contentType: `image/${type.toLowerCase() === "jpg" ? "jpeg" : type.toLowerCase()}`, cid, contentDisposition: "inline" });
    return `${prefix}cid:${cid}${suffix}`;
  });
  return { html: content, attachments };
}
export function createCrmTransport(config: Awaited<ReturnType<typeof crmMailConfig>>) {
  return nodemailer.createTransport({ host: config.host, port: config.port, secure: config.secure, requireTLS: !config.secure,
    auth: { user: config.user, pass: config.pass }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 45000,
    disableFileAccess: true, disableUrlAccess: true });
}
