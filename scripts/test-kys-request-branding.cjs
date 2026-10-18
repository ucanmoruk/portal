require("./register-local-ts.cjs");
const fs = require("node:fs"), vm = require("node:vm"), ts = require("typescript"), assert = require("node:assert/strict");
const React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
let series = "Root", type = "Sipariş", allowed = ["Root", "Spektrotek", "Unique"];
const source = ts.transpileModule(fs.readFileSync("app/kys-talep-yazdir/[id]/page.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const mod = { exports: {} };
vm.runInNewContext(source, { module: mod, exports: mod.exports, process, require(name) {
  if (name === "next/image") return props => React.createElement("img", { src: props.src, alt: props.alt, width: props.width, height: props.height });
  if (name === "next/link") return props => React.createElement("a", { href: props.href }, props.children);
  if (name === "@/lib/portalYetki") return { getPortalUser: async () => ({ can: () => true, firmalar: allowed }) };
  if (name === "@/lib/kysStore") return { getKysRequestDetail: async () => ({ talep: { seri: series, talepTuru: type, talepNo: type === "Sipariş" ? "R1001" : "RA1001", olusturmaTarihi: "2026-10-18", firmaAdi: "Test Company" }, kalemler: [{ id: 1, kod: "TEST", malzemeAdi: "Test", miktar: 1, birim: "Adet" }] }) };
  if (name === "@/lib/settings") return { getAllSettings: async () => ({}) };
  if (name === "./PrintButton") return () => React.createElement("button", null, "Print");
  if (name.endsWith(".css")) return {};
  return require(name);
} });
(async () => {
  const render = async () => renderToStaticMarkup(await mod.exports.default({ params: Promise.resolve({ id: "1" }) }));
  let html = await render();
  for (const expected of ["Root Kozmetik A.Ş.", "root-logo.png", "www.rootkozmetik.com", "info@rootkozmetik.com", "+90 212 909 82 08", "Sipariş Formu", "R1001"]) assert.ok(html.includes(expected), expected);
  assert.ok(!html.includes("info@spektrotek.com"));
  type = "Satın Alma"; html = await render();
  assert.ok(html.includes("PURCHASE ORDER") && html.includes("RA1001") && html.includes("root-logo.png"));
  series = "Spektrotek"; html = await render();
  assert.ok(html.includes("spektrotek-logo.png") && html.includes("info@spektrotek.com") && !html.includes("rootkozmetik.com"));
  series = "Root"; allowed = ["Unique"];
  assert.ok((await render()).includes("yetkiniz yok"));
  console.log("PASS: Root order/purchase form rendering, logo/contact details, Spektrotek branding preservation and company authorization.");
})().catch(error => { console.error(error); process.exitCode = 1; });
