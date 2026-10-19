/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from "node:crypto";
import { cosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";
import { ensureKysSchema } from "@/lib/kysStore";
import { ensureKysRequestNumbers, nextSpektrotekRequestNumber } from "@/lib/kysRequestNumbers";
import { IntegrationError } from "@/lib/spektrotekIntegration";
import { spektrotekMappingSchema, spektrotekOrderSchema } from "@/lib/spektrotekContracts";
import { readKysProduct } from "@/lib/kysProduct";

let ready: Promise<void> | undefined;
export function ensureSpektrotekCommerce() {
  if (!ready) ready = (async () => {
    await ensureKysSchema();
    const pool = await cosmoPool;
    await ensureKysRequestNumbers(pool);
    await pool.request().query(hasMysqlConfig()
      ? `CREATE TABLE IF NOT EXISTS SpektrotekProductMap (StokID INT PRIMARY KEY, WebID VARCHAR(120) COLLATE utf8mb4_bin NOT NULL UNIQUE, Slug VARCHAR(180) NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      : `IF OBJECT_ID('SpektrotekProductMap','U') IS NULL CREATE TABLE SpektrotekProductMap (StokID INT PRIMARY KEY, WebID NVARCHAR(120) COLLATE Latin1_General_100_BIN2 NOT NULL UNIQUE, Slug NVARCHAR(180) NULL)`);
    await pool.request().query(hasMysqlConfig()
      ? `CREATE TABLE IF NOT EXISTS SpektrotekWebOrder (OrderID VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY, PayloadHash VARCHAR(64) NOT NULL, TalepID INT NULL, Payload MEDIUMTEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      : `IF OBJECT_ID('SpektrotekWebOrder','U') IS NULL CREATE TABLE SpektrotekWebOrder (OrderID NVARCHAR(120) COLLATE Latin1_General_100_BIN2 PRIMARY KEY, PayloadHash VARCHAR(64) NOT NULL, TalepID INT NULL, Payload NVARCHAR(MAX) NOT NULL)`);
  })().catch(error => { ready = undefined; throw error; });
  return ready;
}

const locked = (table: string, where: string) => hasMysqlConfig()
  ? `SELECT * FROM ${table} WHERE ${where} FOR UPDATE`
  : `SELECT * FROM ${table} WITH (UPDLOCK,HOLDLOCK) WHERE ${where}`;

export async function saveSpektrotekMapping(input: unknown) {
  const data = spektrotekMappingSchema.parse(input);
  await ensureSpektrotekCommerce();
  const tx = await (await cosmoPool).transaction(); await tx.begin();
  try {
    const stock = (await tx.request().input("ID", data.portalProductId).query(locked("KysStokKart", "ID=@ID AND Kaynak='Spektrotek'"))).recordset[0];
    if (!stock) throw new IntegrationError("Spektrotek ürünü bulunamadı.", 404);
    const existing = (await tx.request().input("ID", data.portalProductId).input("Web", data.webProductId).query(locked("SpektrotekProductMap", "StokID=@ID OR WebID=@Web"))).recordset;
    if (existing.some((row: any) => Number(row.StokID) !== data.portalProductId || row.WebID !== data.webProductId)) throw new IntegrationError("Ürün zaten başka bir ürünle eşleşmiş. Otomatik yeniden eşleştirme yapılamaz.", 409);
    const product = readKysProduct(stock.UrunBilgileri);
    const slug = data.webSlug ?? existing[0]?.Slug ?? product.webSlug;
    await tx.request().input("ID", data.portalProductId).input("Web", data.webProductId).input("Slug", slug || null).query(existing.length
      ? "UPDATE SpektrotekProductMap SET Slug=@Slug WHERE StokID=@ID AND WebID=@Web"
      : "INSERT INTO SpektrotekProductMap (StokID,WebID,Slug) VALUES (@ID,@Web,@Slug)");
    // Mirror the link into the product editor's existing fields, keeping all other metadata.
    product.webUrunId = data.webProductId;
    product.webSlug = slug || "";
    await tx.request().input("ID", data.portalProductId).input("Product", JSON.stringify(product))
      .query("UPDATE KysStokKart SET UrunBilgileri=@Product,UpdatedAt=GETDATE() WHERE ID=@ID");
    await tx.commit(); return { ok: true, ...data };
  } catch (error: any) {
    await tx.rollback();
    if ([1062, 2601, 2627].includes(Number(error.number ?? error.errno))) throw new IntegrationError("Eşleştirme çakışması; mevcut eşleştirmeleri okuyup tekrar deneyin.", 409);
    throw error;
  }
}

export async function receiveSpektrotekOrder(input: unknown) {
  const data = spektrotekOrderSchema.parse(input);
  const payload = JSON.stringify(data);
  const digest = createHash("sha256").update(payload).digest("hex");
  await ensureSpektrotekCommerce();
  const base = await cosmoPool;
  const tx = await base.transaction(); await tx.begin();
  try {
    // Unique insert serializes competing deliveries; the marker commits with all order rows.
    await tx.request().input("Order", data.orderId).input("Hash", digest).input("Payload", payload)
      .query("INSERT INTO SpektrotekWebOrder (OrderID,PayloadHash,Payload) VALUES (@Order,@Hash,@Payload)");
    const items = [];
    for (const item of [...data.items].sort((a, b) => a.portalProductId - b.portalProductId)) {
      const stock = (await tx.request().input("ID", item.portalProductId).query(locked("KysStokKart", "ID=@ID AND Kaynak='Spektrotek'"))).recordset[0];
      const map = (await tx.request().input("ID", item.portalProductId).query("SELECT WebID FROM SpektrotekProductMap WHERE StokID=@ID")).recordset[0];
      if (!stock || map?.WebID !== item.webProductId) throw new IntegrationError("Sipariş ürünü eşleşmemiş veya Spektrotek kaynağında değil.", 409);
      items.push({ item, stock });
    }
    const number = await nextSpektrotekRequestNumber(tx, "Sipariş", "Spektrotek");
    const notes = [`Spektrotek web siparişi: ${data.orderNumber} (${data.orderId})`, `Tarih: ${data.placedAt}`, `Müşteri: ${data.customer.name} | ${data.customer.email} | ${data.customer.phone}`, `Fatura adresi: ${data.customer.billingAddress}`, `Vergi no: ${data.customer.taxNumber || "—"}`, `Teslimat: ${data.customer.shippingAddress}`, `Ödeme: ${data.paymentStatus} | ${data.paymentReference || "—"}`, `Toplam: ${data.grandTotal} ${data.currency}; kargo: ${data.shippingTotal}; indirim: ${data.discountTotal}`, data.note || ""].join("\n");
    const result = await tx.request().input("No", number).input("Firma", data.customer.name).input("Notes", notes)
      .query("INSERT INTO KysTalep (TalepNo,Seri,FirmaAdi,TalepTuru,Durum,OlusturanAd,Notlar) OUTPUT INSERTED.ID VALUES (@No,'Spektrotek',@Firma,'Sipariş','Onay Bekliyor','Spektrotek Web',@Notes)");
    const id = Number(result.recordset[0]?.ID ?? result.recordset[0]?.id);
    if (!id) throw new Error("Sipariş kimliği alınamadı.");
    for (const { item, stock } of items) {
      await tx.request().input("Talep", id).input("Stock", item.portalProductId).input("Kod", stock.Kod).input("Ad", stock.Ad).input("Qty", item.quantity).input("Unit", stock.Birim || "Adet")
        .input("Note", `Web ürün: ${item.webProductId}; KDV hariç birim fiyat: ${item.unitPrice} ${data.currency}; KDV: %${item.vatRate}`)
        .query("INSERT INTO KysTalepKalem (TalepID,StokID,Kod,MalzemeAdi,Miktar,Birim,KullaniciNotu) VALUES (@Talep,@Stock,@Kod,@Ad,@Qty,@Unit,@Note)");
    }
    await tx.request().input("Order", data.orderId).input("ID", id).query("UPDATE SpektrotekWebOrder SET TalepID=@ID WHERE OrderID=@Order");
    await tx.commit(); return { ok: true, duplicate: false, portalOrderId: id, portalOrderNumber: number };
  } catch (error) {
    await tx.rollback();
    const old = (await base.request().input("Order", data.orderId).query("SELECT w.PayloadHash,w.TalepID,t.TalepNo FROM SpektrotekWebOrder w LEFT JOIN KysTalep t ON t.ID=w.TalepID WHERE w.OrderID=@Order")).recordset[0];
    if (old) {
      if (old.PayloadHash !== digest) throw new IntegrationError("Aynı orderId farklı içerikle gönderildi. Sipariş değişiklikleri manuel işlenmelidir.", 409);
      return { ok: true, duplicate: true, portalOrderId: Number(old.TalepID), portalOrderNumber: old.TalepNo };
    }
    throw error;
  }
}
