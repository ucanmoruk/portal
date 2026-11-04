// Render/click only with isolated permission state and mocked HTTP; no report is changed.
const fs = require("node:fs"), ts = require("typescript"), assert = require("node:assert/strict"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
let stateIndex = 0, approve = false, recall = false, modal = false;
const hooks = { ...React, useEffect() {}, useState(initial) {
  const index = stateIndex++;
  const value = index === 1 ? approve : index === 2 ? recall : index === 9 ? modal : index === 10 ? "Düzeltme gerekli" : typeof initial === "function" ? initial() : initial;
  return [value, next => { if (index === 9) modal = next; }];
} };
const source = ts.transpileModule(fs.readFileSync("app/rapor-onay-print/[nkrId]/OnayToolbar.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const moduleValue = { exports: {} };
new Function("require", "module", "exports", source)(name => name === "react" ? hooks : name === "./duzenle/EkYukleBox" ? { default: () => null } : name === "@/lib/challengeImport" ? { isChallengeFormat: format => /^challenge(en)?$/i.test(format) } : name === "qrcode" ? {} : require(name), moduleValue, moduleValue.exports);
const Toolbar = moduleValue.exports.default;
function render(format, durum = null) {
  stateIndex = 0;
  return Toolbar({ nkrId: 77, format, raporNo: "TEST-77", initialOnay: durum ? { durum, token: "test" } : null });
}
function buttons(node) {
  if (!node || typeof node !== "object") return [];
  const children = React.Children.toArray(node.props?.children);
  return [...(node.type === "button" ? [node] : []), ...children.flatMap(buttons)];
}
function label(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  return React.Children.toArray(node?.props?.children).map(label).join("");
}
(async () => {
  const original = { fetch: global.fetch, window: global.window, setTimeout: global.setTimeout };
  const requests = [];
  try {
    global.fetch = async (url, init) => { requests.push({ url, body: JSON.parse(init.body) }); return Response.json({ ok: true }); };
    global.window = { closed: true, close() {}, location: { href: "" } };
    global.setTimeout = callback => { callback(); return 0; };
    for (const format of ["Challenge", "ChallengeEn"]) {
      approve = false; recall = false; modal = false;
      assert.ok(!buttons(render(format)).some(button => label(button).includes("Geri Al")));
      recall = true;
      let tree = render(format);
      assert.equal(buttons(tree).filter(button => label(button).includes("Geri Al")).length, 1);
      assert.ok(renderToStaticMarkup(tree).includes('class="onay-toolbar"'));
      const count = requests.length;
      buttons(tree).find(button => label(button).includes("Geri Al")).props.onClick();
      assert.equal(requests.length, count, "Üst bar düğmesi önce onay penceresini açmalı");
      tree = render(format);
      await buttons(tree).filter(button => label(button).includes("Geri Al")).at(-1).props.onClick();
      assert.deepEqual(requests.at(-1), { url: "/api/rapor-takip/77/geri-gonder", body: { format, notlar: "Düzeltme gerekli" } });
      modal = false; approve = true;
      assert.equal(buttons(render(format)).filter(button => label(button).includes("Geri Al")).length, 1);
      assert.ok(!buttons(render(format)).some(button => label(button).includes("Geri Gönder")), "İkinci geri gönder düğmesi olmamalı");
      for (const status of ["Onaylandı", "Yayınlandı", "Ödeme bekliyor", "Arşiv"]) assert.ok(!buttons(render(format, status)).some(button => label(button).includes("Geri Al")));
    }
    assert.ok(buttons(render("Genel")).some(button => label(button).includes("Geri Gönder")));
    console.log("PASS: Challenge TR/EN recall in preview toolbar, permission visibility, confirmation before HTTP, correct endpoint/format, protected statuses and unchanged other report actions.");
  } finally { Object.assign(global, original); }
})().catch(error => { console.error(error); process.exit(1); });
