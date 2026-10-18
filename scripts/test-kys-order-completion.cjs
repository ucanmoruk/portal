// Integration test: all fixtures and service commits stay inside an outer rollback.
require("./import-spektrotek-products.cjs"); // Shared local TypeScript loader.
const assert = require("node:assert/strict");
async function main() {
  const store = require("../lib/kysStore.ts");
  const workflow = require("../lib/kysPurchaseWorkflow.ts");
  const { cosmoPool } = require("../lib/db.ts");
  const { ensureFaturaTrackingSchema } = require("../lib/faturaSchema.ts");
  await workflow.ensureKysPurchaseSchema();
  const real = await cosmoPool;
  await ensureFaturaTrackingSchema(real);
  await require("../lib/kysRequestNumbers.ts").ensureKysRequestNumbers(real);
  const outer = await real.transaction(); await outer.begin();
  const originalThen = cosmoPool.then;
  let sequence = 0;
  const testPool = { request: () => outer.request(), transaction: async () => {
    const name = `order_test_${++sequence}`;
    return { request: () => outer.request(), begin: () => outer.request().query(`SAVEPOINT ${name}`), commit: async () => {}, rollback: () => outer.request().query(`ROLLBACK TO SAVEPOINT ${name}`) };
  } };
  cosmoPool.then = (resolve, reject) => Promise.resolve(testPool).then(resolve, reject);
  let orderId;
  try {
    const depot = Number((await outer.request().query("SELECT ID FROM KysLaboratuvarBirim WHERE Ad='Depo' AND Durum='Aktif'")).recordset[0].ID);
    const stocks = [];
    for (const quantity of [5, 1]) {
      const id = await store.createKysStock({ kaynak: "Spektrotek", kod: `ORDER-TEST-${Date.now()}-${stocks.length}`, ad: "Rollback test", birim: "Adet" });
      stocks.push(id);
      await store.createKysStockMovement(id, { hareketTipi: "Giriş", miktar: quantity, hedefBirimId: depot });
    }
    orderId = await store.createKysRequest({ seri: "Spektrotek", firmaAdi: "Rollback test", talepTuru: "Sipariş", kalemler: stocks.map(stokId => ({ stokId, malzemeAdi: "Test", miktar: 2, birim: "Adet" })) });
    await store.updateKysRequestStatus(orderId, { durum: "Onaylandı" });
    await store.updateKysRequestStatus(orderId, { durum: "İşleme Alındı" });
    const draft = { kabulTarihi: "2026-10-18", hedefBirimId: depot, degerlendirenAd: "Rollback test" };
    const before = await store.getKysRequestDetail(orderId);
    await store.acceptKysRequestItem(orderId, { ...draft, kalemId: before.kalemler[0].id, gelenMiktar: 1 });
    await assert.rejects(store.completeKysOrder(orderId, draft), /yeterli stok/);
    let detail = await store.getKysRequestDetail(orderId);
    assert.equal(detail.kabuller.length, 1, "A later shortage rolls back all new shipment rows");
    assert.equal(Number(detail.kalemler[0].kabulMiktari), 1);
    await store.createKysStockMovement(stocks[1], { hareketTipi: "Giriş", miktar: 2, hedefBirimId: depot });
    await store.completeKysOrder(orderId, draft);
    detail = await store.getKysRequestDetail(orderId);
    assert.equal(detail.talep.durum, "Tamamlandı");
    assert.deepEqual(detail.kalemler.map(item => Number(item.kabulMiktari)), [2, 2]);
    await assert.rejects(store.completeKysOrder(orderId, draft), /işleme alınmış/);
    await assert.rejects(store.completeKysOrder(orderId, { ...draft, kabulTarihi: "2026-02-31" }), /tarihi/);
    const invoiceId = Number((await outer.request().input("No", `TEST-${Date.now()}`).query("INSERT INTO Fatura (Fatura_No,Toplam,Tutar,KDV,Odenen_Tutar,Tarih,Durum,Kaynak) OUTPUT INSERTED.ID VALUES (@No,120,100,20,0,'2026-10-18','Aktif','Spektrotek')")).recordset[0].ID);
    await outer.request().input("ID", invoiceId).query("INSERT INTO Odeme (Fatura_ID,Odeme_Durumu,Tarih) VALUES (@ID,N'Kısmen Ödendi',GETDATE())");
    await store.updateKysOrderBilling(orderId, { faturaId: invoiceId });
    const invoice = (await outer.request().input("ID", invoiceId).query("SELECT ProformaNo FROM Fatura WHERE ID=@ID")).recordset[0];
    assert.equal(invoice.ProformaNo, detail.talep.talepNo);
    const payment = (await outer.request().input("ID", invoiceId).query("SELECT TOP 1 Evrak_No,Odeme_Durumu FROM Odeme WHERE Fatura_ID=@ID ORDER BY ID DESC")).recordset[0];
    assert.equal(payment.Evrak_No, detail.talep.talepNo);
    assert.equal(payment.Odeme_Durumu, "Kısmen Ödendi");
    let listed = await store.listKysRequests({ search: detail.talep.talepNo, seri: "Spektrotek", tur: "Sipariş" });
    assert.equal(listed.data.find(row => row.id === orderId).odemeDurumu, "Kısmen Ödendi");
    await outer.request().input("ID", invoiceId).input("Evrak", detail.talep.talepNo).query("INSERT INTO Odeme (Fatura_ID,Evrak_No,Odeme_Durumu,Tarih) VALUES (@ID,@Evrak,N'Ödendi',GETDATE())");
    listed = await store.listKysRequests({ search: detail.talep.talepNo, seri: "Spektrotek", tur: "Sipariş" });
    assert.equal(listed.data.find(row => row.id === orderId).odemeDurumu, "Ödendi");
    const history = await store.listKysPurchases({ search: detail.talep.talepNo });
    assert.equal(history.data.length, 2, "One sale per order item, even after partial shipments");
    assert.ok(history.data.every(row => row.islem === "Satış" && row.tedarikci === "Rollback test" && row.faturaNo && row.toplamTutar === null));
    assert.equal((await store.listKysPurchases({ search: detail.talep.talepNo, islem: "Alış" })).data.length, 0);
    assert.equal((await store.listKysPurchases({ search: detail.talep.talepNo, allowedFirmalar: ["Unique"] })).data.length, 0);
    const stock = await store.getKysStockDetail(stocks[0]);
    const outgoing = stock.movements.filter(row => row.hareketTipi === "Çıkış");
    assert.equal(outgoing.length, 2);
    assert.ok(outgoing.every(row => row.siparis && row.talepId === orderId && row.talepNo === detail.talep.talepNo));
    const purchaseId = await store.createKysRequest({ kalemler: [{ stokId: stocks[0], malzemeAdi: "Test", miktar: 1, birim: "Adet" }] });
    await store.updateKysRequestStatus(purchaseId, { durum: "Onaylandı" });
    await store.updateKysRequestStatus(purchaseId, { durum: "İşleme Alındı" });
    const purchase = await store.getKysRequestDetail(purchaseId);
    const accepted = await store.acceptKysRequestItem(purchaseId, { ...draft, kalemId: purchase.kalemler[0].id, gelenMiktar: 1 });
    await store.updateKysPurchase(accepted.kabulId, { tedarikci: "Rollback vendor", birimFiyat: "10", paraBirimi: "TRY" }, { userId: "test", userName: "Test", firmalar: ["Unique"] });
    const combined = await store.listKysPurchases({ search: stock.stock.kod });
    assert.equal(combined.data.length, 2);
    assert.ok(combined.data.some(row => row.islem === "Alış" && row.tedarikci === "Rollback vendor" && row.toplamTutar === 10));
    assert.ok(combined.data.some(row => row.islem === "Satış" && row.tedarikci === "Rollback test"));
    assert.equal((await store.listKysPurchases({ search: stock.stock.kod, allowedFirmalar: ["Unique"] })).data.length, 1);
    await store.updateKysOrderBilling(orderId, { faturaId: null });
    assert.equal((await outer.request().input("ID", orderId).query("SELECT SiparisFaturaID FROM KysTalep WHERE ID=@ID")).recordset[0].SiparisFaturaID, null);
    for (const series of ["Root", "Spektrotek"]) {
      const code = `AUTO-${series}-${Date.now()}`;
      const automaticOrder = await store.createKysRequest({ seri: series, talepTuru: "Sipariş", firmaAdi: "Automatic catalogue test", kalemler: [{ kod: code, malzemeAdi: "Automatic product", miktar: 2, birim: "Adet" }] });
      let automatic = await store.getKysRequestDetail(automaticOrder);
      const automaticStock = automatic.kalemler[0].stokId;
      assert.ok(automaticStock);
      assert.match(automatic.talep.talepNo, series === "Root" ? /^R\d+$/ : /^S\d+$/);
      let product = await store.getKysStockDetail(automaticStock);
      assert.equal(product.stock.kaynak, series);
      assert.equal(product.stock.stokMiktari, 0, "Creating an order creates no inventory");
      await store.editKysRequest(automaticOrder, { firmaAdi: "Updated catalogue test", talepTuru: "Sipariş", kalemler: [{ kod: code, malzemeAdi: "Automatic product", miktar: 3, birim: "Adet" }] });
      automatic = await store.getKysRequestDetail(automaticOrder);
      assert.equal(automatic.kalemler[0].stokId, automaticStock, "Edits reuse the product card");
      await store.createKysStockMovement(automaticStock, { hareketTipi: "Giriş", miktar: 10, hedefBirimId: depot });
      await store.updateKysRequestStatus(automaticOrder, { durum: "Onaylandı" });
      await store.updateKysRequestStatus(automaticOrder, { durum: "İşleme Alındı" });
      await store.completeKysOrder(automaticOrder, draft);
      product = await store.getKysStockDetail(automaticStock);
      assert.equal(product.stock.stokMiktari, 7);
      assert.ok(product.movements.some(row => row.siparis && row.talepId === automaticOrder));
      const companyOrders = await store.listKysRequests({ tur: "Sipariş", seri: series, allowedFirmalar: [series] });
      assert.ok(companyOrders.data.some(row => row.id === automaticOrder));
      const companyHistory = await store.listKysPurchases({ search: code, allowedFirmalar: [series] });
      assert.equal(companyHistory.data.length, 1);
      assert.equal(companyHistory.data[0].islem, "Satış");
      const automaticInvoice = Number((await outer.request().input("No", code).input("Series", series).query("INSERT INTO Fatura (Fatura_No,Toplam,Tutar,KDV,Odenen_Tutar,Tarih,Durum,Kaynak) OUTPUT INSERTED.ID VALUES (@No,120,100,20,0,'2026-10-18','Aktif',@Series)")).recordset[0].ID);
      await store.updateKysOrderBilling(automaticOrder, { faturaId: automaticInvoice });
      assert.equal((await outer.request().input("ID", automaticInvoice).query("SELECT ProformaNo FROM Fatura WHERE ID=@ID")).recordset[0].ProformaNo, automatic.talep.talepNo);
      const automaticPurchase = await store.createKysRequest({ seri: series, talepTuru: "Satın Alma", firmaAdi: "Vendor", kalemler: [{ kod: code, malzemeAdi: "Automatic product", miktar: 1, birim: "Adet" }] });
      const purchaseDetail = await store.getKysRequestDetail(automaticPurchase);
      assert.match(purchaseDetail.talep.talepNo, series === "Root" ? /^RA\d+$/ : /^A\d+$/);
      await store.updateKysRequestStatus(automaticPurchase, { durum: "Onaylandı" });
      await store.updateKysRequestStatus(automaticPurchase, { durum: "İşleme Alındı" });
      await store.acceptKysRequestItem(automaticPurchase, { ...draft, kalemId: purchaseDetail.kalemler[0].id, gelenMiktar: 1 });
      assert.equal((await store.getKysStockDetail(automaticStock)).stock.stokMiktari, 8);
      const failedCode = `${code}-ROLLBACK`;
      await assert.rejects(store.createKysRequest({ seri: series, talepTuru: "Sipariş", firmaAdi: "Invalid second item", kalemler: [
        { kod: failedCode, malzemeAdi: "Must roll back", miktar: 1, birim: "Adet" },
        { kod: "X".repeat(81), malzemeAdi: "Invalid code", miktar: 1, birim: "Adet" },
      ] }), /80/);
      assert.equal((await outer.request().input("Code", failedCode).query("SELECT ID FROM KysStokKart WHERE Kod=@Code")).recordset.length, 0);
      const convertible = await store.createKysRequest({ seri: series, talepTuru: "Satın Alma", firmaAdi: "Type change test", kalemler: [{ kod: code, malzemeAdi: "Automatic product", miktar: 1, birim: "Adet" }] });
      await store.editKysRequest(convertible, { talepTuru: "Sipariş", firmaAdi: "Type change test", kalemler: [{ kod: code, malzemeAdi: "Automatic product", miktar: 1, birim: "Adet" }] });
      const converted = await store.getKysRequestDetail(convertible);
      assert.match(converted.talep.talepNo, series === "Root" ? /^R\d+$/ : /^S\d+$/);
      assert.equal(converted.kalemler[0].stokId, automaticStock);
    }
    console.log("PASS: shipment rollback, completion, invoice/payment links, combined purchase/sale product search, filtering, permissions and stock movement links.");
  } finally { cosmoPool.then = originalThen; await outer.rollback(); }
  assert.equal((await real.request().input("ID", orderId).query("SELECT ID FROM KysTalep WHERE ID=@ID")).recordset.length, 0);
  console.log("PASS: all integration fixtures rolled back.");
}
const timer = setTimeout(() => process.exit(1), 180000);
main().then(() => { clearTimeout(timer); process.exit(0); }).catch(error => { console.error(error); clearTimeout(timer); process.exit(1); });
