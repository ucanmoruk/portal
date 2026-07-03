import { PDFDocument } from "pdf-lib";
import { getRaporEk } from "@/lib/raporEk";

// İki PDF'i birleştir: base (üretilen ilk sayfa) + ek (yüklenen Ek-1 PDF).
// Ek'in tüm sayfaları base'in ARKASINA eklenir.
export async function mergeEkPdf(baseBuf: Buffer, ekBuf: Buffer): Promise<Buffer> {
  const base = await PDFDocument.load(baseBuf, { ignoreEncryption: true });
  const ek = await PDFDocument.load(ekBuf, { ignoreEncryption: true });
  const pages = await base.copyPages(ek, ek.getPageIndices());
  for (const p of pages) base.addPage(p);
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

  return mergeEkPdf(baseBuf, ekBuf);
}
