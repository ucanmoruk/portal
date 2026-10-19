import { createHash, timingSafeEqual } from "node:crypto";
import { cosmoPool } from "@/lib/db";
import { readKysProduct } from "@/lib/kysProduct";
import { ensureKysSchema } from "@/lib/kysStore";

type AnyRow = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export class IntegrationError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const hash = (value: string) => createHash("sha256").update(value).digest();

/** Spektrotek mağazası `x-api-key` veya `Authorization: Bearer` başlığıyla SPEKTROTEK_INTEGRATION_KEY gönderir. */
export function assertSpektrotekKey(request: Request) {
  const secret = (process.env.SPEKTROTEK_INTEGRATION_KEY || "").trim();
  if (secret.length < 32) throw new IntegrationError("Spektrotek entegrasyon anahtarı sunucuda tanımlı değil.", 503);
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  const key = (request.headers.get("x-api-key") || bearer).trim();
  if (!key || !timingSafeEqual(hash(key), hash(secret))) throw new IntegrationError("Geçersiz entegrasyon anahtarı.", 401);
}

function str(row: AnyRow, key: string): string {
  return String(row[key] ?? row[key.toLowerCase()] ?? "");
}

/** Web mağazası için Spektrotek ürünleri; iç notlar, referans fiyat ve araştırma kaynakları dışarı verilmez. */
export async function listSpektrotekProducts(params: { page?: number; limit?: number; origin: string }) {
  const { ensureSpektrotekCommerce } = await import("@/lib/spektrotekCommerce");
  await ensureSpektrotekCommerce();
  const pool = await cosmoPool;
  const page = Math.max(1, Math.floor(Number(params.page) || 1));
  const limit = Math.min(500, Math.max(1, Math.floor(Number(params.limit) || 100)));
  const where = "WHERE Kaynak = 'Spektrotek'";
  const total = Number((await pool.request().query(`SELECT COUNT(*) AS total FROM KysStokKart ${where}`)).recordset[0]?.total || 0);
  const rows: AnyRow[] = (await pool.request().input("offset", (page - 1) * limit).input("limit", limit).query(`
    SELECT ID, Barkod, Kod, Ad, Name, Ozellik, UrunBilgileri, StokMiktari, StokDurumu, Birim, UpdatedAt,
           CASE WHEN GorselData IS NULL THEN 0 ELSE 1 END AS HasLegacyImage
    FROM KysStokKart ${where}
    ORDER BY ID
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `)).recordset;
  const ids = rows.map(row => Number(row.ID ?? row.id)).filter(Number.isInteger);
  const mappings: AnyRow[] = ids.length ? (await pool.request().query(`SELECT StokID,WebID,Slug FROM SpektrotekProductMap WHERE StokID IN (${ids.join(",")})`)).recordset : [];
  const gallery: AnyRow[] = ids.length
    ? (await pool.request().query(`SELECT ID, StokID, AltMetin FROM KysStokGorsel WHERE Silindi = 0 AND StokID IN (${ids.join(",")}) ORDER BY StokID, Sira, ID`)).recordset
    : [];
  const imageUrl = (stockId: number, imageId: number) => `${params.origin}/api/integrations/spektrotek/products/${stockId}/images/${imageId}`;
  const data = rows.map(row => {
    const id = Number(row.ID ?? row.id);
    const urun = readKysProduct(row.UrunBilgileri ?? row.urunbilgileri);
    const mapping = mappings.find(item => Number(item.StokID ?? item.stokid) === id);
    const images = gallery.filter(image => Number(image.StokID ?? image.stokid) === id)
      .map(image => ({ id: Number(image.ID ?? image.id), url: imageUrl(id, Number(image.ID ?? image.id)), alt: str(image, "AltMetin") }));
    if (!images.length && Number(row.HasLegacyImage ?? row.haslegacyimage)) images.push({ id: 0, url: imageUrl(id, 0), alt: "" });
    const product = {
      id, sku: str(row, "Kod"), barkod: str(row, "Barkod"), ad: str(row, "Ad"), name: str(row, "Name"), ozellik: str(row, "Ozellik"),
      kategori: urun.kategori, marka: urun.marka,
      satisFiyati: urun.satisFiyati, listeFiyati: urun.listeFiyati, paraBirimi: urun.paraBirimi, kdvOrani: urun.kdvOrani,
      kisaAciklama: urun.kisaAciklama, urunAciklamasi: urun.urunAciklamasi,
      tedarikDurumu: urun.tedarikDurumu, teslimSuresi: urun.teslimSuresi,
      webSecili: urun.webSecili, webUrunId: mapping ? str(mapping, "WebID") : urun.webUrunId, webSlug: mapping ? str(mapping, "Slug") : urun.webSlug,
      stokMiktari: Number(row.StokMiktari ?? row.stokmiktari ?? 0), birim: str(row, "Birim"), stokDurumu: str(row, "StokDurumu"),
      updatedAt: row.UpdatedAt ?? row.updatedat ?? null,
      images,
    };
    return { ...product, revision: createHash("sha256").update(JSON.stringify(product)).digest("hex"), createStatus: "draft" };
  });
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
}

export async function getSpektrotekProductImage(stockId: number, imageId: number) {
  await ensureKysSchema();
  const pool = await cosmoPool;
  const result = imageId === 0
    ? await pool.request().input("ID", stockId).query("SELECT GorselDosyaAdi AS DosyaAdi, GorselMimeType AS MimeType, GorselData AS DosyaData FROM KysStokKart WHERE ID=@ID AND Kaynak='Spektrotek' AND GorselData IS NOT NULL")
    : await pool.request().input("ID", stockId).input("PhotoID", imageId).query(`
        SELECT g.DosyaAdi, g.MimeType, g.DosyaData FROM KysStokGorsel g
        JOIN KysStokKart s ON s.ID = g.StokID
        WHERE g.StokID=@ID AND g.ID=@PhotoID AND g.Silindi=0 AND s.Kaynak='Spektrotek'`);
  return result.recordset[0] ?? null;
}
