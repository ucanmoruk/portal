const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, imports = {}, globals = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, {
    module: mod, exports: mod.exports, console, Buffer, Response, URL, WebSocket, setTimeout, clearTimeout, process, ...globals,
    require: name => name in imports ? imports[name]
      : name.startsWith("@/") ? load(name.slice(2) + ".ts", imports, globals) : require(name),
  });
  return mod.exports;
}

const calculations = load("lib/ugdCalculations.ts");
assert.equal(calculations.fmtSED(calculations.calcSED(0.9, 0.01, 100)), "0,00009");
assert.equal(calculations.fmtSED(0.000009), "0,000009");
assert.equal(calculations.fmtSED(1e-12), "0,000000000001");
assert.equal(calculations.fmtSED(0), "0");
assert.equal(calculations.parseUgdNumber("0,01"), 0.01);
assert.equal(calculations.parseUgdNumber("0", 100), 0);

const input = {
  form: { A: "0,90", RaporNo: "3362", Urun: "Test product", FirmaID: 1 },
  firmaAd: "Test & Company", firmaAdres: "Test address", firmaTelefon: "123456", firmaMail: "test@example.com",
  formulResults: [
    { INCIName: "CI 19140", inputAmount: "0,01", dap: 100, noael: "2640", Kategori: "Genel" },
    { INCIName: "LIMONENE", inputAmount: "0,001", dap: 100, noael: "250,5", Kategori: "Alerjen" },
    { INCIName: "PHENOXYETHANOL", inputAmount: "0.5", dap: 100, noael: "500", Functions: "PRESERVATIVE", Regulation: "V/29" },
  ],
};
const refresh = load("lib/ugdReportRefresh.ts").refreshUgdReportHtml;
for (const [language, module, fn] of [
  ["tr", "ugdReportHtml", "renderUgdReportHtml"],
  ["en", "ugdReportHtmlEn", "renderUgdReportHtmlEn"],
  ["cpsr", "ugdReportHtmlCpsr", "renderUgdReportHtmlCpsr"],
]) {
  const render = load(`lib/${module}.ts`)[fn];
  const html = render({ ...input, language });
  for (const content of ["Test &amp; Company", "Test address", "123456", "test@example.com", "0,00009"]) assert(html.includes(content), `${language}: ${content}`);
  const allergenTable = html.match(/<table\b[^>]*>[\s\S]*?<\/table>/g)?.find(table => table.includes("EINECS/ELICS"));
  assert(allergenTable?.includes("LIMONENE"), `${language}: allergen missing`);
  const stale = render({ ...input, language, firmaAd: "OLD FIRM", firmaAdres: "OLD ADDRESS", firmaTelefon: "OLD PHONE", firmaMail: "old@example.com", formulResults: [] })
    .replace("Federica Micheli", "Wrong assessor")
    .replace(/<\/section>/, "<p>Preserved custom narrative</p></section>");
  const updated = refresh(stale, html, language === "cpsr");
  assert(updated.includes("Preserved custom narrative"));
  assert(!updated.includes("OLD FIRM"));
  assert(updated.includes("LIMONENE"));
  assert(updated.includes("0,00009"));
  if (language === "cpsr") {
    assert(updated.includes("Federica Micheli"));
    assert(!updated.includes("Wrong assessor"));
    assert(html.includes("Federica Micheli"));
    assert(html.includes("Viale A. Diaz 112, Cagliari, 09125 Italy"));
    assert(html.includes("Bachelor&#39;s degree in Toxicology") || html.includes("Bachelor's degree in Toxicology"));
    assert(html.includes("Master&#39;s degree in Advanced Cosmetic Sciences") || html.includes("Master's degree in Advanced Cosmetic Sciences"));
    assert(!html.includes("imza-dilsun"));
    assert(!html.includes("imza-oguzhan"));
  }
}

const persistence = load("lib/ugdPersistence.ts");
let state, failAt = "", returnId = true;
const initial = () => ({ product: null, texts: [], formula: [{ INCIName: "OLD" }] });
function request(working) {
  const params = {};
  return {
    input(name, value) { params[name] = value; return this; },
    async query(sql) {
      if (failAt && sql.includes(failAt)) throw Error("Injected write failure");
      if (sql.includes("INSERT INTO rUGDListe")) {
        working.product = { ID: 42, ...params }; return { recordset: returnId ? [{ ID: 42 }] : [], rowsAffected: [1] };
      }
      if (sql.includes("DELETE FROM rUGDRaporMetinleri")) working.texts = [];
      else if (sql.includes("INSERT INTO rUGDRaporMetinleri")) working.texts.push({ ...params });
      else if (sql.includes("SELECT ID FROM rUGDListe")) return { recordset: working.product ? [{ ID: 42 }] : [] };
      else if (sql.includes("DELETE FROM rUGDFormul")) working.formula = [];
      else if (sql.includes("INSERT INTO rUGDFormul")) working.formula.push({ ...params });
      else if (sql.includes("UPDATE rUGDListe")) return { rowsAffected: [working.product ? 1 : 0], recordset: [] };
      else throw Error(`Unexpected SQL: ${sql}`);
      return { recordset: [], rowsAffected: [1] };
    },
  };
}
const pool = {
  transaction() {
    let working;
    return { async begin() { working = structuredClone(state); }, request: () => request(working),
      async commit() { state = working; }, async rollback() {} };
  },
};
const imports = { "next-auth": { getServerSession: async () => ({ user: {} }) }, "@/lib/auth": { authOptions: {} },
  "@/lib/db": { default: Promise.resolve(pool), __esModule: true }, "@/lib/ugdPersistence": persistence };
const create = load("app/api/urunler/route.ts", imports).POST;
const update = load("app/api/urunler/[id]/route.ts", imports).PUT;
const body = () => ({ json: async () => ({ Urun: "Test", FirmaID: 1, NormalKullanim: "Preserved text", formulRows: input.formulResults }) });

(async () => {
  const cataloguePool = { request() { return { input() { return this; }, async query(sql) {
    return { recordset: sql.includes("FROM rCosing")
      ? [{ ID: 10, INCIName: "LIMONENE", Kategori: "Alerjen" }] : [] };
  } }; } };
  const enriched = await load("lib/ugdRegulationLookup.ts", {
    "@/lib/db": { __esModule: true, default: Promise.resolve(cataloguePool) },
  }).enrichUgdFormulaRows([{ INCIName: "LIMONENE", HammaddeID: 10, Miktar: "0,01", DaP: 0, Noael: "250,5", Kategori: "Genel" }]);
  assert.equal(enriched[0].Kategori, "Alerjen");
  assert.equal(enriched[0].inputAmount, "0,01");
  assert.equal(enriched[0].dap, 0);
  assert.equal(enriched[0].noael, "250,5");
  state = initial();
  let response = await create(body());
  assert.equal(response.status, 200); assert.equal((await response.json()).id, 42);
  assert.equal(state.product.Durum, "Aktif"); assert.equal(state.product.BirimID, "1005");
  assert.equal(state.formula.length, 3); assert(state.texts.some(row => row.Metin === "Preserved text"));
  for (const failure of ["INSERT INTO rUGDRaporMetinleri", "INSERT INTO rUGDFormul", "missing id"]) {
    state = initial(); const before = structuredClone(state);
    returnId = failure !== "missing id"; failAt = returnId ? failure : "";
    response = await create(body()); assert.equal(response.status, 500); assert.deepEqual(state, before);
  }
  failAt = ""; returnId = true; state = initial();
  response = await update(body(), { params: Promise.resolve({ id: "42" }) });
  assert.equal(response.status, 500); assert.equal(state.product, null);

  // Verify the actual Postgres compatibility transaction pins queries to one connection.
  const events = [];
  const client = { async query(sql) { events.push(sql); return { rows: [], rowCount: 1 }; }, release() { events.push("release"); } };
  const pg = { async connect() { events.push("connect"); return client; }, async query(sql) {
    assert(sql.includes("information_schema"), "Transaction query escaped to the pool"); return { rows: [] };
  } };
  const db = load("lib/db.ts", {
    "@vercel/postgres": { createPool: () => pg }, "./socketGuard": { installSocketGuard() {} },
    "./mysqlCompat": { hasMysqlConfig: () => false, MysqlCompatPool: class {} },
  }, { process: { env: { UGD_POSTGRES_URL: "postgres://fixture" }, on() {} } });
  const compat = await db.default;
  await persistence.withUgdTransaction(compat, tx => tx.request().query("SELECT 42"));
  assert.deepEqual(events, ["connect", "BEGIN", "SELECT 42", "COMMIT", "release"]);
  events.length = 0;
  await assert.rejects(persistence.withUgdTransaction(compat, async tx => { await tx.request().query("SELECT 43"); throw Error("rollback"); }));
  assert.deepEqual(events, ["connect", "BEGIN", "SELECT 43", "ROLLBACK", "release"]);

  let firmaFailure = false;
  const firmaPool = { request() { return { input() { return this; }, async query(sql) {
    assert(sql.includes("Email FROM RootTedarikci"), "Wrong company email column");
    if (firmaFailure) throw Error("Injected company query failure");
    return { recordset: [{ Ad: input.firmaAd, Adres: input.firmaAdres, Telefon: input.firmaTelefon, Email: input.firmaMail }] };
  } }; } };
  const report = load("app/api/urunler/rapor-sablon/route.ts", {
    ...imports, "@/lib/db": { __esModule: true, default: Promise.resolve(firmaPool) },
    "@/lib/ugdRegulationLookup": { enrichUgdFormulaRows: async rows => rows },
  }, { console: { ...console, error() {} } }).POST;
  for (const language of ["tr", "en", "cpsr"]) {
    const pdf = process.argv.includes("--pdf");
    const response = await report({ url: `http://localhost/api/urunler/rapor-sablon?format=${pdf ? "pdf" : "html"}&language=${language}`,
      json: async () => ({ ...input, firmaAd: "Stale client name", language }) });
    assert.equal(response.status, 200, await (response.status !== 200 ? response.text() : Promise.resolve("")));
    if (pdf) {
      fs.mkdirSync("tmp/pdfs/ugd-qa", { recursive: true });
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
      fs.writeFileSync(`tmp/pdfs/ugd-qa/${language}.pdf`, bytes);
    } else {
      const html = await response.text(); assert(html.includes("test@example.com")); assert(!html.includes("Stale client name"));
    }
  }
  firmaFailure = true;
  const failure = await report({ url: "http://localhost/api/urunler/rapor-sablon?format=html", json: async () => input });
  assert.equal(failure.status, 500);
  console.log("PASS: TR/EN/CPSR firm, allergen and decimal SED output; saved HTML refresh preserves edits; assessor credentials; atomic product/formula saves, missing ID and rollback; real PgCompat connection pinning. No database writes performed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
