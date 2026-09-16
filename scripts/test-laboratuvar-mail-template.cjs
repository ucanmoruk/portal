// Pure template checks: no SMTP connection or database access.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const cache = {};
function load(file) {
  if (cache[file]) return cache[file];
  const moduleObject = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(source, {
    exports: moduleObject.exports, module: moduleObject, process: { env: {} },
    require: name => {
      if (name === "@/lib/laboratuvarMailTemplate") return load("lib/laboratuvarMailTemplate.ts");
      if (name === "@/lib/numuneKabulMailTemplate") return load("lib/numuneKabulMailTemplate.ts");
      if (name === "@/lib/db") return { cosmoPool: null };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return cache[file] = moduleObject.exports;
}
const { laboratoryMailBrand, renderLaboratoryMail } = load("lib/laboratuvarMailTemplate.ts");
const { buildKabulMail } = load("lib/numuneKabulMail.ts");
const brand = laboratoryMailBrand({ SIRKET_ADI: 'UNIQUE & "Analyse"', SIRKET_ADRES: "İstanbul <Adres>", SIRKET_EMAIL: "info@example.com", SIRKET_WEB: "https://example.com" });
const data = { firmaAd: "Müşteri <Firma>", rows: [{ evrakNo: "123", kabulTarihi: "16.09.2026", urunAdi: "Ürün <A>", test: "Test & Analiz", termin: "20.09.2026" }] };
const content = buildKabulMail(data, "<script>unsafe</script>\nİkinci satır", brand);
assert(!content.html.includes("<script>"));
assert(content.html.includes("&lt;script&gt;unsafe&lt;/script&gt;\nİkinci satır"));
assert(content.html.includes("UNIQUE &amp; &quot;Analyse&quot;"));
assert(content.html.includes("Müşteri &lt;Firma&gt;"));
assert(content.html.includes("Ürün &lt;A&gt;"));
assert(content.html.includes("Test &amp; Analiz"));
assert(content.html.includes('src="cid:unique-logo"'));
assert(content.html.includes("max-width:640px"));
assert(content.html.includes("font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif"));
assert(content.html.includes("İstanbul &lt;Adres&gt;"));
assert(content.text.includes("Ürün <A>"));
assert(buildKabulMail(data, "Mesaj", brand, "/unique-logo.png").html.includes('src="/unique-logo.png"'));
const report = renderLaboratoryMail({ brand, title: "Analiz Raporunuz", message: "Mesaj", intro: "Raporlar", headings: ["Rapor No", "Numune"], rows: [["123", "Ürün"]], note: "Doğrulama" });
for (const html of [content.html, report]) {
  assert(html.includes('height:32px;display:block;'));
  assert(html.includes('padding:18px 28px;background:#ffffff;border-top:1px solid #eaeaea;font-size:12px'));
}
console.log("PASS: shared report/information mail layout, company branding, CID/preview logos, multiline message and HTML escaping. No mail sent.");
