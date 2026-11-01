import { PDFDocument, StandardFonts, rgb, pushGraphicsState, popGraphicsState } from "pdf-lib";
import { getRaporEk } from "@/lib/raporEk";

// Ek sayfaları, raporun kendi logo/üst bilgi ve doküman alt bilgisini taşır.
// Dosya adı belgeye yazılmaz. Birleştirme dijital imzadan önce yapılır.
export async function mergeEkPdf(baseBuf: Buffer, ekBuf: Buffer): Promise<Buffer> {
  const base = await PDFDocument.load(baseBuf);
  const frame = await PDFDocument.load(baseBuf);
  const ek = await PDFDocument.load(ekBuf);
  if (!base.getPageCount() || !ek.getPageCount()) throw new Error("Rapor veya ek PDF boş.");
  const font = await base.embedFont(StandardFonts.Helvetica);
  const first = frame.getPage(0);
  const { width, height } = first.getSize();
  const headerBottom = height - 190;
  const footerTop = 55;
  const header = await base.embedPage(first, { left: 0, bottom: headerBottom, right: width, top: height });
  const footer = await base.embedPage(first, { left: 0, bottom: 0, right: width, top: footerTop });
  const total = base.getPageCount() + ek.getPageCount();
  const numberPage = (page: ReturnType<typeof base.getPage>, index: number) => {
    const w = page.getWidth();
    page.drawRectangle({ x: w - 150, y: 14, width: 130, height: 20, color: rgb(1, 1, 1) });
    const label = `Sayfa: ${index} / ${total}`;
    page.drawText(label, { x: w - 23 - font.widthOfTextAtSize(label, 8), y: 22, size: 8, font });
  };
  base.getPages().forEach((page, index) => numberPage(page, index + 1));
  for (const source of ek.getPages()) {
    source.pushOperators(pushGraphicsState(), popGraphicsState());
    const embedded = await base.embedPage(source);
    const page = base.addPage([width, height]);
    page.drawPage(header, { x: 0, y: headerBottom, width, height: height - headerBottom });
    page.drawPage(footer, { x: 0, y: 0, width, height: footerTop });
    page.drawText("EK-1", { x: 23, y: headerBottom - 18, size: 11, font });
    const contentBottom = footerTop + 18;
    const contentHeight = headerBottom - 35 - contentBottom;
    const scale = Math.min((width - 80) / embedded.width, contentHeight / embedded.height);
    page.drawPage(embedded, {
      x: (width - embedded.width * scale) / 2,
      y: contentBottom + (contentHeight - embedded.height * scale) / 2,
      width: embedded.width * scale, height: embedded.height * scale,
    });
    numberPage(page, base.getPageCount());
  }
  return Buffer.from(await base.save());
}

// Tüm rapor formatlarında: kayıtlı Ek-1 PDF varsa indir ve base PDF'e ekle.
// Ek yoksa base'i olduğu gibi döndürür. İmzalamadan HEMEN ÖNCE çağrılmalı.
export async function maybeMergeEk(
  pool: any,
  baseBuf: Buffer,
  nkrId: number,
  format: string,
): Promise<Buffer> {
  const ek = await getRaporEk(pool, nkrId, format);
  if (!ek?.ekUrl) return baseBuf;

  let ekBuf: Buffer;
  try {
    const resp = await fetch(ek.ekUrl, {
      redirect: "follow",
      headers: { "User-Agent": "UniquePortalMerge/1.0", Accept: "application/pdf,*/*" },
    });
    if (!resp.ok) throw new Error(`Ek-1 indirilemedi (HTTP ${resp.status})`);
    ekBuf = Buffer.from(await resp.arrayBuffer());
    if (ekBuf.length < 5 || ekBuf.subarray(0, 5).toString("latin1") !== "%PDF-") {
      throw new Error("Ek-1 geçerli bir PDF değil.");
    }
  } catch (e) {
    // Ek indirilemezse raporu Ek'siz üretmeyelim — hata fırlat ki kullanıcı görsün.
    throw new Error(`Ek-1 PDF birleştirilemedi: ${e instanceof Error ? e.message : "bilinmeyen hata"}`);
  }

  return mergeEkPdf(baseBuf, ekBuf);
}
