import { PDFParse } from "pdf-parse";
import path from "node:path";
import { getRaporEk } from "@/lib/raporEk";
import type { ReportAnnexPage } from "@/app/rapor-onay-print/[nkrId]/reportTypes";

// Render the complete visible page, including annotation/signature appearances.
// Never crop, reflow, or copy PDF content streams: the report embeds only PNGs.
export async function rasterizeAnnexPdf(buffer: Buffer): Promise<ReportAnnexPage[]> {
  const pdfjsRoot = path.join(process.cwd(), "node_modules/pdfjs-dist");
  const parser = new PDFParse({
    data: new Uint8Array(buffer),
    standardFontDataUrl: `${path.join(pdfjsRoot, "standard_fonts").replace(/\\/g, "/")}/`,
    cMapUrl: `${path.join(pdfjsRoot, "cmaps").replace(/\\/g, "/")}/`,
    wasmUrl: `${path.join(pdfjsRoot, "wasm").replace(/\\/g, "/")}/`,
    cMapPacked: true,
    isEvalSupported: false,
  });
  try {
    const info = await parser.getInfo();
    if (!info.total) throw new Error("Ek PDF boş.");
    const pages: ReportAnnexPage[] = [];
    for (let pageNumber = 1; pageNumber <= info.total; pageNumber++) {
      const result = await parser.getScreenshot({
        partial: [pageNumber], scale: 300 / 72,
        imageDataUrl: true, imageBuffer: false,
      });
      const page = result.pages[0];
      if (!page?.dataUrl) throw new Error(`Ek PDF'nin ${pageNumber}. sayfası görüntülenemedi.`);
      pages.push({ dataUrl: page.dataUrl, width: page.width, height: page.height });
    }
    return pages;
  } finally {
    await parser.destroy();
  }
}

export async function loadRaporAnnexPages(pool: any, nkrId: number, format: string): Promise<ReportAnnexPage[]> {
  const ek = await getRaporEk(pool, nkrId, format);
  if (!ek?.ekUrl) return [];
  const response = await fetch(ek.ekUrl, {
    cache: "no-store", redirect: "follow",
    headers: { "User-Agent": "UniquePortalAnnex/1.0", Accept: "application/pdf" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Ek PDF indirilemedi (HTTP ${response.status}).`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("Ek dosyası geçerli bir PDF değil.");
  return rasterizeAnnexPdf(buffer);
}
