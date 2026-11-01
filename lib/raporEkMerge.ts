import { PDFDocument, StandardFonts, rgb, pushGraphicsState, popGraphicsState } from "pdf-lib";
import { getRaporEk } from "@/lib/raporEk";

// İki PDF'i birleştir: base (üretilen ilk sayfa) + ek (yüklenen Ek-1 PDF).
// Ek'in tüm sayfaları base'in ARKASINA eklenir.
export async function mergeEkPdf(baseBuf: Buffer, ekBuf: Buffer, raporNo = ""): Promise<Buffer> {
  const base = await PDFDocument.load(baseBuf, { ignoreEncryption: true });
  const ek = await PDFDocument.load(ekBuf, { ignoreEncryption: true });
  const font = await base.embedFont(StandardFonts.Helvetica);
  const start = base.getPageCount();
  const total = start + ek.getPageCount();
  for (const source of ek.getPages()) {
    source.pushOperators(pushGraphicsState(), popGraphicsState());
    const embedded = await base.embedPage(source);
    const page = base.addPage([595.28, 841.89]);
    const scale = Math.min(523.28 / embedded.width, 701.89 / embedded.height);
    page.drawPage(embedded, {
      x: (595.28 - embedded.width * scale) / 2,
      y: 50 + (701.89 - embedded.height * scale) / 2,
      width: embedded.width * scale, height: embedded.height * scale,
    });
    const safe = (value: string) => value.replace(/[^\x20-\x7e\xa0-\xff]/g, '-');
    page.drawText(safe(`Rapor No / Report No: ${raporNo}`), { x: 36, y: 805, size: 11, font });
    page.drawText('EK-1 / ANNEX-1', { x: 36, y: 783, size: 10, font });
    page.drawLine({ start: { x: 36, y: 772 }, end: { x: 559, y: 772 }, thickness: 0.7, color: rgb(0.3, 0.3, 0.3) });
    page.drawText(`Sayfa / Page: ${base.getPageCount()} / ${total}`, { x: 410, y: 28, size: 10, font });
  }
  const out = await base.save();
  return Buffer.from(out);
}

// "Diğer" formatı raporlarda: kayıtlı Ek-1 PDF varsa indir ve base PDF'e ekle.
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

  const report = await pool.request().input("nkrId", nkrId)
    .query("SELECT RaporNo FROM NKR WHERE ID = @nkrId");
  return mergeEkPdf(baseBuf, ekBuf, String(report.recordset[0]?.RaporNo || nkrId));
}
