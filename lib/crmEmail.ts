import { sanitizeDocumentHtml, htmlToPlainText } from "@/lib/htmlSanitize";
import type { CrmCompany } from "@/lib/crmRules";

export const CRM_EMAIL_LIMIT = 750000;
export const escapeEmailHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
export const textToEmailHtml = (text: string) => `<p>${escapeEmailHtml(text).replace(/\n/g, "<br />")}</p>`;
export function sanitizeCrmEmailHtml(html: string) {
  return sanitizeDocumentHtml(html, { preserveHeadingCase: true });
}
export function emailHasContent(html: string) {
  return Boolean(htmlToPlainText(html).trim() || /<img\b[^>]*\bsrc=/i.test(html));
}
export function renderCrmEmail(body: string, format: "text" | "html" | undefined, company: CrmCompany) {
  const html = format === "html" ? sanitizeCrmEmailHtml(body) : textToEmailHtml(body);
  return sanitizeCrmEmailHtml(html.replace(/\{\{(firma|yetkili)\}\}/g, (_, key: string) => escapeEmailHtml(key === "firma" ? company.name : company.contact || "Yetkili")));
}
export function emailPreviewDocument(html: string) {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>body{margin:0;padding:20px;font:14px/1.6 Arial,sans-serif;color:#20242a;background:#fff;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%;border-collapse:collapse}td,th{padding:8px}pre{white-space:pre-wrap}a{color:#1769aa}</style></head><body>${sanitizeCrmEmailHtml(html)}</body></html>`;
}
