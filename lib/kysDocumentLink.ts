/** Prefer an uploaded PDF; use the publisher URL when the document has no PDF. */
export function externalDocumentLink(document: { pdfPath?: string; yayinLinki?: string }): string | null {
  for (const raw of [document.pdfPath, document.yayinLinki]) {
    const url = raw?.trim();
    if (!url) continue;
    if (url.startsWith("/") && !url.startsWith("//") && !url.includes("\\")) return url;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.href;
    } catch { /* Invalid URL: try the next available source. */ }
  }
  return null;
}
