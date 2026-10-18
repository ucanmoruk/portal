const assert = require("node:assert/strict");
const { validate, productInput, planImport, rows } = require("./import-spektrotek-products.cjs");
validate();
assert.equal(rows.reduce((sum, row) => sum + row.quantity, 0), 189);
assert.deepEqual(rows.filter(row => row.temporaryCode).map(row => row.no), [54, 57, 59, 63, 67]);
for (const row of rows) {
  const product = productInput(row);
  assert.equal(product.referansFiyat, row.originalPrice);
  assert.equal(product.satisFiyati, null);
  assert.equal(product.kdvOrani, null);
  assert.equal(product.webSecili, false);
  assert.equal(product.webSlug, row.slug);
}
assert.equal(planImport([]).filter(row => row.action === "create").length, 67);
const existing = rows.map(row => ({ ID: row.no, Kod: row.code, Kaynak: "Spektrotek", UrunBilgileri: JSON.stringify(productInput(row)) }));
assert.equal(planImport(existing).filter(row => row.action === "skip").length, 67);
assert.throws(() => planImport([{ ID: 1, Kod: rows[0].code, Kaynak: "Unique", UrunBilgileri: null }]), /collision/);
assert.throws(() => planImport(existing.map((row, index) => index ? row : { ...row, Kaynak: "Unique" })), /identity changed/);
assert.equal(rows[24].stockStatus, "Pasif");
assert.equal(rows[18].quantity, 1);
console.log("Spektrotek import tests PASS");
