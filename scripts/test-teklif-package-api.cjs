require("./register-local-ts.cjs");
const assert = require("node:assert/strict");
let lines = [], total = 0;
const pool = { request() {
  const params = {};
  return { input(key, value) { params[key] = value; return this; }, async query(sql) {
    if (/INSERT INTO TeklifKalem/.test(sql)) lines.push({ ...params, ID: lines.length + 1 });
    if (/DELETE FROM TeklifKalem/.test(sql)) lines = [];
    if (/INSERT INTO TeklifBaslik|UPDATE TeklifBaslik SET/.test(sql)) total = params.Toplam;
    if (/INSERT INTO TeklifBaslik/.test(sql)) return { recordset: [{ ID: 501 }] };
    if (/AS nextNo/.test(sql)) return { recordset: [{ nextNo: 260201 }] };
    if (/SELECT TeklifNo/.test(sql)) return { recordset: [{ TeklifNo: 260201, RevNo: 0 }] };
    if (/FROM TeklifBaslik t/.test(sql)) return { recordset: [{ ID: 501, TeklifNo: 260201, MusteriID: 10, Toplam: total }] };
    if (/FROM TeklifKalem/.test(sql)) return { recordset: lines.map(row => ({ ...row })) };
    return { recordset: [], rowsAffected: [1] };
  } };
} };
require.cache[require.resolve("next-auth")] = { exports: { getServerSession: async () => ({ user: { userId: "2", name: "Test" } }) } };
require.cache[require.resolve("../lib/auth.ts")] = { exports: { authOptions: {} } };
require.cache[require.resolve("../lib/db.ts")] = { exports: { cosmoPool: Promise.resolve(pool) } };
require.cache[require.resolve("../lib/teklifLog.ts")] = { exports: { writeInternalTeklifLog: async () => {}, teklifNoLabel: () => "260201", clientIpFromRequest: () => "test" } };
require.cache[require.resolve("../lib/settings.ts")] = { exports: { getAllSettings: async () => ({}) } };
const { POST } = require("../app/api/teklifler/route.ts");
const { GET, PUT } = require("../app/api/teklifler/[id]/route.ts");
const payload = { musteriId: 10, satirlar: [
  { hizmetId: 1, hizmetAdi: "Analiz A", adet: 2, fiyat: 100, iskonto: 10, paketGrup: "pack-1", paketAdi: "Paket Başlık" },
  { hizmetId: 2, hizmetAdi: "Analiz B", adet: 2, fiyat: 200, paketGrup: "pack-1", paketAdi: "Paket Başlık" },
  { hizmetId: 3, hizmetAdi: "Ayrı analiz", adet: 1, fiyat: 50 },
] };
const request = (method, body) => new Request("http://test/api/teklifler", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const context = () => ({ params: Promise.resolve({ id: "501" }) });
(async () => {
  assert.equal((await POST(request("POST", payload))).status, 201);
  assert.equal(lines.length, 3);
  assert.equal(total, 630);
  const data = await (await GET(new Request("http://test"), context())).json();
  assert.equal(data.satirlar[0].PaketGrup, "pack-1");
  assert.equal(data.satirlar[1].PaketAdi, "Paket Başlık");
  assert.equal(data.satirlar[2].PaketGrup, null);
  assert.deepEqual(data.satirlar.map(row => row.HizmetID), [1, 2, 3]);
  const updated = { ...payload, satirlar: payload.satirlar.map(row => ({ ...row, paketAdi: row.paketGrup ? "Yeni başlık" : null })) };
  assert.equal((await PUT(request("PUT", updated), context())).status, 200);
  assert.equal(lines.length, 3);
  assert.equal(lines[0].PaketAdi, "Yeni başlık");
  assert.equal(total, 630);
  const mail = require("../app/api/teklifler/[id]/mail/route.ts");
  const preview = await mail.GET(new Request("http://test/api/teklifler/501/mail"), context());
  assert.equal(preview.status, 200);
  const html = await preview.text();
  assert.match(html, /<strong>Yeni başlık<\/strong>/);
  assert.match(html, /Uygulanan parametreler:/);
  assert.match(html, /Analiz A/);
  assert.match(html, /Analiz B/);
  const doc = require("../app/api/teklifler/[id]/export/route.ts");
  const exported = await doc.GET(new Request("http://test/api/teklifler/501/export"), context());
  assert.equal(exported.status, 200);
  const JSZip = require("jszip");
  const zip = await JSZip.loadAsync(Buffer.from(await exported.arrayBuffer()));
  const xml = await zip.file("word/document.xml").async("string");
  assert.match(xml, /Yeni başlık/);
  assert.match(xml, /Uygulanan parametreler:/);
  assert.match(xml, /<w:br\/>/);
  assert.match(xml, /Analiz A/);
  assert.match(xml, /Analiz B/);
  const fs = require("node:fs"), ts = require("typescript"), Module = require("node:module");
  const originalLoad = Module._load;
  Module._load = function(name, ...args) {
    if (name === "next/font/google") return { JetBrains_Mono: () => ({ variable: "", className: "" }) };
    if (name === "@/app/fonts/reportFonts") return { ttInterphases: { className: "" } };
    return originalLoad.call(this, name, ...args);
  };
  require.extensions[".tsx"] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
  const React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
  const Print = require("../app/teklif-print/[id]/TeklifPrintDocument.tsx").default;
  const print = renderToStaticMarkup(React.createElement(Print, { header: { TeklifNo: 260201, RevNo: 0, MusteriAd: "Test", Tarih: "03.11.2026", KdvOran: 20 }, satirlar: lines }));
  assert.match(print, /Uygulanan parametreler:/);
  assert.match(print, /Yeni başlık/);
  assert.match(print, /Analiz A/);
  assert.match(print, /Analiz B/);
  assert.equal((print.match(/class="center no"/g) || []).length, 2);
  console.log("PASS: offer create/read/update preserves package grouping, analysis IDs, standalone lines and totals.");
  console.log("PASS: print/PDF document HTML, mail preview and Word export show package title and applied parameters.");
})().catch(error => { console.error(error); process.exit(1); });
