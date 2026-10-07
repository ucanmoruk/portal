import { sanitizeDocumentHtml } from "@/lib/htmlSanitize";
import { normalizeKysDocumentSpacing } from "@/lib/kysDocumentSpacing";

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const normalized = (value: string) => value.replace(/\s+/g, " ").trim().toLocaleLowerCase("tr-TR");

function pdfPagesToHtml(pages: Array<{ text: string }>) {
  const linesByPage = pages.map(page => page.text.split(/\r?\n/).map(line => line.trim()));
  const edgeCounts = new Map<string, number>();
  for (const lines of linesByPage) {
    const nonEmpty = lines.filter(Boolean);
    const candidates = new Set([...nonEmpty.slice(0, 2), ...nonEmpty.slice(-2)].map(normalized).filter(Boolean));
    candidates.forEach(line => edgeCounts.set(line, (edgeCounts.get(line) || 0) + 1));
  }
  const threshold = Math.max(2, Math.ceil(linesByPage.length * 0.6));
  const repeatedEdges = new Set([...edgeCounts].filter(([, count]) => count >= threshold).map(([line]) => line));
  const output: string[] = [];
  let paragraph: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  const flushParagraph = () => {
    if (paragraph.length) output.push(`<p>${escapeHtml(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) output.push(`<${list.type}>${list.items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</${list.type}>`);
    list = null;
  };

  linesByPage.forEach(lines => {
    lines.forEach(rawLine => {
      const line = rawLine.trim();
      if (!line || repeatedEdges.has(normalized(line)) || /^sayfa\s*\d+(\s*\/\s*\d+)?$/i.test(line)) {
        flushParagraph(); flushList(); return;
      }
      const bullet = line.match(/^[•●▪◦\-–]\s+(.+)$/);
      if (bullet) {
        flushParagraph();
        if (list?.type !== "ul") { flushList(); list = { type: "ul", items: [] }; }
        list.items.push(bullet[1]); return;
      }
      const heading = line.match(/^(\d+(?:\.\d+){0,2})[.)]?\s+(.+)$/);
      if (heading && line.length <= 160) {
        flushParagraph(); flushList();
        const level = Math.min(4, 2 + (heading[1].match(/\./g)?.length || 0));
        output.push(`<h${level}>${escapeHtml(line)}</h${level}>`); return;
      }
      if (line.length <= 120 && line === line.toLocaleUpperCase("tr-TR") && /[A-ZÇĞİÖŞÜ]/.test(line)) {
        flushParagraph(); flushList(); output.push(`<h2>${escapeHtml(line)}</h2>`); return;
      }
      flushList(); paragraph.push(line);
    });
    flushParagraph(); flushList();
  });
  return output.join("\n");
}

export async function importKysDocument(fileName: string, buffer: Buffer) {
  const extension = fileName.toLocaleLowerCase("tr-TR").split(".").pop();
  if (extension === "docx") {
    const { default: mammoth } = await import("mammoth");
    const result = await mammoth.convertToHtml(
      { buffer },
      {
        styleMap: [
          "p[style-name='Heading 1'] => h2:fresh", "p[style-name='Başlık 1'] => h2:fresh",
          "p[style-name='Heading 2'] => h3:fresh", "p[style-name='Başlık 2'] => h3:fresh",
          "p[style-name='Heading 3'] => h4:fresh", "p[style-name='Başlık 3'] => h4:fresh",
        ],
        convertImage: mammoth.images.dataUri,
        externalFileAccess: false,
      },
    );
    const html = result.value.replace(/<h1\b/gi, "<h2").replace(/<\/h1>/gi, "</h2>");
    return { html: normalizeKysDocumentSpacing(sanitizeDocumentHtml(html)), warnings: result.messages.map(message => message.message), type: "docx" as const };
  }
  if (extension === "pdf") {
    // Load inside the request's error boundary, and only for PDF imports.
    const { PDFParse } = await import("pdf-parse");
    const { getData } = await import("pdf-parse/worker");
    PDFParse.setWorker(getData());
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      const html = sanitizeDocumentHtml(pdfPagesToHtml(result.pages));
      if (!html.replace(/<[^>]+>/g, "").trim()) {
        throw new Error("Bu PDF metin içermiyor veya taranmış görüntülerden oluşuyor. Önce OCR uygulanmış bir PDF kullanın.");
      }
      return { html, warnings: [], type: "pdf" as const, pageCount: result.pages.length };
    } finally {
      await parser.destroy();
    }
  }
  throw new Error("Yalnızca DOCX veya PDF dosyaları içe aktarılabilir.");
}
