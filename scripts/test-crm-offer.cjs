require("./register-local-ts.cjs");
const assert = require("node:assert/strict");
const { CrmAnalysis, CrmOfferEdit, hydrateCrmOffer } = require("../lib/crmOffer.ts");
const { SpektrotekTalepStatus, SPEKTROTEK_TALEP_DURUMLAR } = require("../lib/spektrotekTalepRules.ts");
const input = { recipient: "Test Şahıs", email: "test@example.com", subject: "Analiz teklifi", warnings: [], items: [{ serviceId: 1, quantity: 3 }, { serviceId: 999, quantity: 1 }, { serviceId: 2, quantity: 1 }] };
const offer = hydrateCrmOffer(input, [
  { ID: 1, Ad: "Analiz", Fiyat: "123.45", ParaBirimi: "EUR", Metot: "ISO", Akreditasyon: "Var" },
  { ID: 2, Ad: "Fiyatsız analiz", Fiyat: null, ParaBirimi: "TRY" },
]);
assert.equal(offer.recipient, "Test Şahıs");
assert.deepEqual(offer.items, [{ serviceId: 1, name: "Analiz", quantity: 3, price: 123.45, currency: "EUR", method: "ISO", accreditation: "Var" }]);
assert.equal(offer.warnings.length, 2);
assert.ok(CrmAnalysis.safeParse({ answer: "Özet", offer: null }).success);
assert.ok(!CrmAnalysis.safeParse({ answer: "", offer: { ...input, items: [{ serviceId: 1, quantity: -1 }] } }).success);
assert.ok(CrmOfferEdit.safeParse(offer).success);
assert.ok(!CrmOfferEdit.safeParse({ ...offer, items: [{ ...offer.items[0], price: -1 }] }).success);
assert.deepEqual(SPEKTROTEK_TALEP_DURUMLAR, ["Bekliyor", "Teklif Gönderildi", "Onaylandı", "Uygun Değil", "Ret"]);
for (const durum of SPEKTROTEK_TALEP_DURUMLAR) assert.ok(SpektrotekTalepStatus.safeParse({ durum, surum: 1 }).success);
assert.ok(!SpektrotekTalepStatus.safeParse({ durum: "Geçersiz", surum: 1 }).success);
const packaged = CrmAnalysis.parse({ answer: "Teklif ve cevap hazır", offer: {
  recipient: "Örnek", email: "", subject: "Teklif", replySubject: "Yanıt", replyBody: "Örnek yanıt metni", warnings: [], items: [],
  packages: [{ packageId: 10, quantity: 2, products: ["Ürün A", "Ürün B"] }],
} }).offer;
const packageCatalog = [{ ID: 10, Ad: "Mikrobiyoloji Paketi", serviceIds: [1, 3] }];
const serviceCatalog = [
  { ID: 1, Ad: "Parametre A", Fiyat: 250, ParaBirimi: "₺", Metot: "ISO A", Akreditasyon: "Var", Sure: "7", NumGereklilik: "100 g" },
  { ID: 3, Ad: "Parametre B", Fiyat: 200, ParaBirimi: "TL", Metot: "ISO B", Akreditasyon: "Yok" },
];
const expanded = hydrateCrmOffer(packaged, serviceCatalog, packageCatalog);
assert.equal(expanded.replyBody, "Örnek yanıt metni");
assert.equal(expanded.items.length, 2);
assert.ok(expanded.items.every(item => item.quantity === 2 && item.currency === "TRY"));
assert.equal(expanded.items[0].packageGroup, expanded.items[1].packageGroup);
assert.equal(expanded.items[0].packageTitle, "Mikrobiyoloji Paketi");
assert.deepEqual(expanded.items[0].products, ["Ürün A", "Ürün B"]);
assert.equal(expanded.items[0].duration, "7");
assert.equal(expanded.items.reduce((sum, item) => sum + item.price * item.quantity, 0), 900);
assert.deepEqual(CrmOfferEdit.parse(expanded).items, expanded.items);
const missingMember = hydrateCrmOffer(packaged, serviceCatalog.slice(0, 1), packageCatalog);
assert.equal(missingMember.items.length, 0, "Eksik paket kısmen fiyatlandırılmamalı");
assert.equal(missingMember.warnings.length, 1);
console.log("PASS: CRM catalog pricing, missing services/prices, quantities, editable draft validation, and all five Spektrotek statuses.");
console.log("PASS: reply template persistence, package expansion, quantities, currencies, product scope, sample/duration, missing package prices.");
