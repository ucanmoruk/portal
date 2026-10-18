import { cosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";
import { ensureKysSchema } from "@/lib/kysStore";

export async function getKysStockSource(id: number): Promise<string | null> {
  await ensureKysSchema();
  const result = await (await cosmoPool).request().input("ID", id)
    .query("SELECT Kaynak FROM KysStokKart WHERE ID=@ID");
  return result.recordset[0]?.Kaynak ?? null;
}

export function validateStockPhoto(data: Buffer, mimeType: string) {
  const jpeg = data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const png = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP";
  if (!data.length || data.length > 5 * 1024 * 1024) throw new Error("Her görsel 5 MB veya daha küçük olmalıdır.");
  if (!(mimeType === "image/jpeg" && jpeg || mimeType === "image/png" && png || mimeType === "image/webp" && webp)) throw new Error("Geçerli bir JPG, PNG veya WebP dosyası seçin.");
}

export async function addKysStockPhoto(id: number, input: { fileName: string; mimeType: string; data: Buffer }) {
  validateStockPhoto(input.data, input.mimeType);
  await ensureKysSchema();
  const tx = await (await cosmoPool).transaction();
  await tx.begin();
  try {
    const stock = await tx.request().input("ID", id).query(hasMysqlConfig()
      ? "SELECT ID FROM KysStokKart WHERE ID=@ID FOR UPDATE"
      : "SELECT ID FROM KysStokKart WITH (UPDLOCK,HOLDLOCK) WHERE ID=@ID");
    if (!stock.recordset[0]) throw new Error("Stok kartı bulunamadı.");
    // Move the original cover into the gallery atomically; preserve its bytes and filename.
    await tx.request().input("ID", id).query(`
      INSERT INTO KysStokGorsel (StokID,DosyaAdi,MimeType,DosyaData,Sira)
      SELECT ID,GorselDosyaAdi,GorselMimeType,GorselData,0 FROM KysStokKart
      WHERE ID=@ID AND GorselData IS NOT NULL
    `);
    await tx.request().input("ID", id).query("UPDATE KysStokKart SET GorselData=NULL,GorselDosyaAdi=NULL,GorselMimeType=NULL WHERE ID=@ID AND GorselData IS NOT NULL");
    const existing = await tx.request().input("ID", id).query("SELECT COUNT(*) AS Total, MAX(Sira) AS LastOrder FROM KysStokGorsel WHERE StokID=@ID AND Silindi=0");
    if (Number(existing.recordset[0]?.Total) >= 24) throw new Error("Bir ürüne en fazla 24 görsel eklenebilir.");
    const result = await tx.request().input("ID", id).input("Name", input.fileName.slice(0, 260))
      .input("Mime", input.mimeType).input("Data", input.data).input("Order", Number(existing.recordset[0]?.LastOrder ?? -1) + 1)
      .query("INSERT INTO KysStokGorsel (StokID,DosyaAdi,MimeType,DosyaData,Sira) OUTPUT INSERTED.ID VALUES (@ID,@Name,@Mime,@Data,@Order)");
    await tx.request().input("ID", id).query("UPDATE KysStokKart SET UpdatedAt=GETDATE() WHERE ID=@ID");
    await tx.commit();
    return Number(result.recordset[0]?.ID);
  } catch (error) { await tx.rollback(); throw error; }
}

export async function getKysStockPhoto(id: number, photoId: number) {
  await ensureKysSchema();
  const result = await (await cosmoPool).request().input("ID", id).input("PhotoID", photoId)
    .query("SELECT DosyaAdi,MimeType,DosyaData FROM KysStokGorsel WHERE StokID=@ID AND ID=@PhotoID AND Silindi=0");
  return result.recordset[0] ?? null;
}

export async function editKysStockPhoto(id: number, photoId: number, input: { altMetin?: unknown; sira?: unknown; kapak?: unknown; silindi?: unknown }) {
  if (input.altMetin !== undefined && (typeof input.altMetin !== "string" || input.altMetin.length > 220)) throw new Error("Görsel açıklaması en fazla 220 karakter olabilir.");
  if (input.sira !== undefined && (!Number.isInteger(input.sira) || Number(input.sira) < 0 || Number(input.sira) > 10000)) throw new Error("Görsel sırası 0–10000 arasında bir tam sayı olmalıdır.");
  if (input.kapak !== undefined && typeof input.kapak !== "boolean" || input.silindi !== undefined && typeof input.silindi !== "boolean") throw new Error("Görsel işlemi geçersiz.");
  await ensureKysSchema();
  const tx = await (await cosmoPool).transaction();
  await tx.begin();
  try {
    await tx.request().input("ID", id).query(hasMysqlConfig()
      ? "SELECT ID FROM KysStokKart WHERE ID=@ID FOR UPDATE"
      : "SELECT ID FROM KysStokKart WITH (UPDLOCK,HOLDLOCK) WHERE ID=@ID");
    if (input.kapak === true) await tx.request().input("ID", id)
      .query("UPDATE KysStokGorsel SET Sira=Sira+1 WHERE StokID=@ID AND Silindi=0");
    const result = await tx.request().input("ID", id).input("PhotoID", photoId)
      .input("Alt", input.altMetin === undefined ? null : input.altMetin)
      .input("Order", input.kapak === true ? 0 : input.sira === undefined ? null : Number(input.sira))
      .input("Deleted", input.silindi === true ? 1 : 0)
      .query("UPDATE KysStokGorsel SET AltMetin=COALESCE(@Alt,AltMetin), Sira=COALESCE(@Order,Sira), Silindi=@Deleted WHERE StokID=@ID AND ID=@PhotoID AND Silindi=0");
    if (!result.rowsAffected?.[0]) throw new Error("Görsel bulunamadı.");
    await tx.request().input("ID", id).query("UPDATE KysStokKart SET UpdatedAt=GETDATE() WHERE ID=@ID");
    await tx.commit();
  } catch (error) { await tx.rollback(); throw error; }
}
