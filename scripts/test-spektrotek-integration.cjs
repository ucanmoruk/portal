// Spektrotek ürün beslemesi: anahtar doğrulaması ve iç alanların dışarı verilmemesi.
require("./register-local-ts.cjs");
const assert = require("node:assert/strict");
(async () => {
  const { assertSpektrotekKey, listSpektrotekProducts } = require("../lib/spektrotekIntegration.ts");
  const req = headers => new Request("http://test/api/integrations/spektrotek/products", { headers });
  delete process.env.SPEKTROTEK_INTEGRATION_KEY;
  assert.throws(() => assertSpektrotekKey(req({})), e => e.status === 503);
  process.env.SPEKTROTEK_INTEGRATION_KEY = "k".repeat(40);
  assert.throws(() => assertSpektrotekKey(req({})), e => e.status === 401);
  assert.throws(() => assertSpektrotekKey(req({ "x-api-key": "wrong" })), e => e.status === 401);
  assert.doesNotThrow(() => assertSpektrotekKey(req({ "x-api-key": "k".repeat(40) })));
  assert.doesNotThrow(() => assertSpektrotekKey(req({ authorization: `Bearer ${"k".repeat(40)}` })));
  const result = await listSpektrotekProducts({ page: 1, limit: 500, origin: "https://lab.example" });
  assert.ok(result.total > 0 && result.data.length === Math.min(result.total, 500));
  for (const item of result.data) {
    for (const hidden of ["icNotlar", "referansFiyat", "arastirmaKaynaklari", "aktarimKimligi", "casNo", "kritikLimit"]) assert.equal(item[hidden], undefined, hidden);
    for (const image of item.images) assert.match(image.url, /^https:\/\/lab\.example\/api\/integrations\/spektrotek\/products\/\d+\/images\/\d+$/);
  }
  console.log(`PASS: key auth (missing/wrong/x-api-key/Bearer) and ${result.total} Spektrotek products without internal fields, ${result.data.filter(p => p.images.length).length} with images.`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
