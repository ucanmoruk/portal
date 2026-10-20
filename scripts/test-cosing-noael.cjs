const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

async function check(value, expected, exists) {
  const writes = [];
  const pool = {
    request() {
      const inputs = {};
      return {
        input(name, value) { inputs[name] = value; return this; },
        async query(sql) {
          if (sql.includes("SELECT ID")) return { recordset: exists ? [{ ID: 1 }] : [] };
          writes.push({ sql, inputs });
          return { recordset: [] };
        },
      };
    },
  };
  const mod = { exports: {} };
  const imports = {
    "next-auth": { getServerSession: async () => ({ user: { id: 1 } }) },
    "@/lib/auth": { authOptions: {} },
    "@/lib/db": { default: Promise.resolve(pool), __esModule: true },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("app/api/cosing/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, {
    module: mod, exports: mod.exports, Response,
    require(name) {
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
      return imports[name];
    },
  });
  const response = await mod.exports.POST(new Request("http://localhost/api/cosing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: 1, hammadde: { Noael2: value, GenelAd: "ALOE BARBADENSIS FLOWER EXTRACT" } }),
  }));
  assert.equal(response.status, 200);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].inputs.Noael2, expected);
  assert.equal(writes[0].inputs.GenelAd, "ALOE BARBADENSIS FLOWER EXTRACT");
  assert.match(writes[0].sql, exists ? /UPDATE rHammadde/ : /INSERT INTO rHammadde/);
}

(async () => {
  for (const exists of [true, false]) {
    for (const [value, expected] of [["", null], ["   ", null], [null, null], [undefined, null], [0, 0], ["0", "0"], ["250.5", "250.5"]]) {
      await check(value, expected, exists);
    }
  }
  console.log("CoSing NOAEL: 14 update/insert regression cases passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
