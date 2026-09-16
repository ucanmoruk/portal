/* eslint-disable @typescript-eslint/no-explicit-any */
import { loadEnvConfig } from "@next/env";
import assert from "node:assert/strict";
loadEnvConfig(process.cwd());
async function main() {
  const { cosmoPool } = await import("../lib/db");
  const store = await import("../lib/kysStore");
  const workflow = await import("../lib/kysPurchaseWorkflow");
  const rules = await import("../lib/kysRequestRules");
  assert.throws(() =>
    rules.requireRequestTransition("İşleme Alındı", "Onaylandı"),
  );
  assert.throws(() =>
    rules.requireRequestAcceptance("Kısmi Kabul", "Tamamlandı", 10, 10, 1),
  );
  const real = await cosmoPool;
  await workflow.ensureKysPurchaseSchema();
  const outer = await real.transaction();
  await outer.begin();
  const originalThen = cosmoPool.then;
  let sequence = 0;
  // All service commits stay inside this outer rollback-only transaction.
  const testPool = {
    request: () => outer.request(),
    transaction: async () => {
      const savepoint = `kys_test_${++sequence}`;
      return {
        request: () => outer.request(),
        begin: () => outer.request().query(`SAVEPOINT ${savepoint}`),
        commit: async () => {},
        rollback: () =>
          outer.request().query(`ROLLBACK TO SAVEPOINT ${savepoint}`),
      };
    },
  };
  (cosmoPool as any).then = (resolve: any, reject: any) =>
    Promise.resolve(testPool).then(resolve, reject);
  let requestId = 0,
    stockId = 0,
    supplierId = 0;
  try {
    stockId = await store.createKysStock({
      kod: `TEST-${Date.now()}`,
      ad: "Rollback test stok",
      birim: "mL",
    });
    supplierId = await workflow.saveKysSupplier({
      Ad: `Rollback test tedarikçi ${Date.now()}`,
    });
    requestId = await store.createKysRequest({
      kalemler: [
        { stokId: stockId, malzemeAdi: "Test", miktar: 10, birim: "YANLIŞ" },
      ],
    });
    let detail = (await store.getKysRequestDetail(requestId, true))!;
    assert.equal(detail.kalemler[0].birim, "mL");
    await assert.rejects(
      store.acceptKysRequestItem(requestId, {
        kalemId: detail.kalemler[0].id,
        gelenMiktar: 5,
      }),
      /işleme alınmış/,
    );
    await store.updateKysRequestStatus(requestId, { durum: "Onaylandı" });
    await store.updateKysRequestStatus(requestId, { durum: "İşleme Alındı" });
    await assert.rejects(
      store.updateKysRequestStatus(requestId, { durum: "Onaylandı" }),
      /geçirilemez/,
    );
    const input = {
      kalemId: detail.kalemler[0].id,
      gelenMiktar: 10,
      tedarikciId: supplierId,
      satinAlanId: "test",
      birimFiyat: 2,
      paraBirimi: "TRY",
      kabulTarihi: "2026-09-16",
      degerlendirenId: "test",
    };
    const accepted = await store.acceptKysRequestItem(requestId, input);
    detail = (await store.getKysRequestDetail(requestId, true))!;
    assert.equal(detail.talep.durum, "Tamamlandı");
    assert.equal(detail.kabuller[0].toplamTutar, 20);
    await assert.rejects(store.acceptKysRequestItem(requestId, input));
    await workflow.correctKysAcceptance(
      requestId,
      {
        ...input,
        kabulId: accepted.kabulId,
        gelenMiktar: 8,
        duzeltmeAciklamasi: "Test düzeltme",
      },
      true,
    );
    detail = (await store.getKysRequestDetail(requestId, true))!;
    assert.equal(detail.kalemler[0].kabulMiktari, 8);
    assert.equal(detail.kabuller[0].toplamTutar, 16);
    assert.equal(detail.talep.durum, "Kısmi Kabul");
    const stock = (
      await outer
        .request()
        .input("ID", stockId)
        .query("SELECT StokMiktari FROM KysStokKart WHERE ID=@ID")
    ).recordset[0];
    assert.equal(Number(stock.StokMiktari), 8);
    await workflow.saveKysAcceptanceFile(
      outer,
      requestId,
      accepted.kabulId,
      {
        name: "test.pdf",
        mime: "application/pdf",
        buffer: Buffer.from("%PDF-test"),
      } as any,
      "test",
    );
    assert.equal((await workflow.getKysRequestFiles(requestId)).length, 1);
    await workflow.removeKysSupplier(supplierId);
    await workflow.correctKysAcceptance(
      requestId,
      {
        ...input,
        kabulId: accepted.kabulId,
        gelenMiktar: 8,
        duzeltmeAciklamasi: "Pasif tedarikçi korunur",
      },
      true,
    );
    await workflow.deleteKysRequest(requestId, "test");
    assert.equal(await store.getKysRequestDetail(requestId, true), null);
    await workflow.restoreKysRequest(requestId, "test");
    assert.equal(
      (await store.getKysRequestDetail(requestId, true))?.talep.durum,
      "Kısmi Kabul",
    );
    assert.equal(
      Number(
        (
          await outer
            .request()
            .input("ID", stockId)
            .query("SELECT StokMiktari FROM KysStokKart WHERE ID=@ID")
        ).recordset[0].StokMiktari,
      ),
      8,
    );
    console.log(
      "PASS: durum ilerleme, stok birimi, tekrar kabul engeli, farkla düzeltme, toplam hesaplama, belge, pasif tedarikçi, arşivleme.",
    );
  } finally {
    (cosmoPool as any).then = originalThen;
    await outer.rollback();
  }
  const check = (
    await real
      .request()
      .input("ID", requestId)
      .query("SELECT ID FROM KysTalep WHERE ID=@ID")
  ).recordset;
  assert.equal(check.length, 0);
  console.log("PASS: test kayıtları rollback ile tamamen geri alındı.");
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
