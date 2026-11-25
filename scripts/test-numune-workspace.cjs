/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, imports = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, {
    module: mod, exports: mod.exports, Request, Response, URL, console,
    require: name => name in imports ? imports[name] : require(name),
  });
  return mod.exports;
}

async function main() {
  const scope = load("lib/numuneWorkspace.ts");
  const root = new Request("https://portal.test/api/numune-kabul?workspace=root");
  const lab = new Request("https://portal.test/api/numune-kabul?workspace=laboratuvar");
  assert.deepEqual(Array.from(scope.workspaceGroups("laboratuvar")), ["Özel"]);
  assert.deepEqual(Array.from(scope.workspaceGroups("root")), ["K.D.", "Özel", "Belge"]);
  assert.equal(scope.numuneWorkspaceSql(lab), "LTRIM(RTRIM(n.Grup)) IN (N'Özel')");
  for (const group of ["K.D.", "Özel", "Belge"]) {
    assert.equal(scope.groupMatchesWorkspace(root, group), true);
    assert.equal(scope.groupMatchesWorkspace(lab, group), group === "Özel");
    assert.ok(scope.numuneWorkspaceSql(root).includes(`N'${group}'`));
  }
  assert.equal(scope.groupMatchesWorkspace(root, "Bilinmeyen"), false);

  // Exercise the actual status endpoint against one shared in-memory NKR store.
  const records = [
    { ID: 1, Evrak_No: "TEST", Grup: "Özel", Durum: "Aktif", Rapor_Durumu: "Analiz Aşamasında" },
    { ID: 2, Evrak_No: "OTHER", Grup: "K.D.", Durum: "Aktif", Rapor_Durumu: "Analiz Aşamasında" },
  ];
  const pool = { request() {
    const inputs = {};
    return { input(key, value) { inputs[key] = value; return this; }, async query(sql) {
      assert.match(sql, /UPDATE NKR/);
      assert.ok(sql.includes(scope.numuneWorkspaceSql(root, "NKR")));
      const matches = records.filter(row => row.Evrak_No === inputs.Evrak_No && row.Durum === "Aktif" && scope.groupMatchesWorkspace(root, row.Grup));
      matches.forEach(row => { row.Rapor_Durumu = inputs.Rapor_Durumu; });
      return { rowsAffected: [matches.length] };
    } };
  } };
  const api = load("app/api/numune-kabul/route.ts", {
    "@/lib/numuneWorkspace": scope,
    "next-auth": { getServerSession: async () => ({ user: { userId: "test" } }) },
    "@/lib/auth": { authOptions: {} },
    "@/lib/db": { cosmoPool: Promise.resolve(pool) },
    "@/lib/mysqlCompat": {},
    "@/lib/numuneSearchSql": {},
  });
  const response = await api.PATCH(new Request(root.url, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ evrakNo: "TEST", raporDurumu: "Gönderildi" }),
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).updated, 1);
  const specialList = records.filter(row => scope.groupMatchesWorkspace(lab, row.Grup));
  assert.equal(specialList[0].ID, 1);
  assert.equal(specialList[0].Rapor_Durumu, "Gönderildi");
  assert.equal(records[1].Rapor_Durumu, "Analiz Aşamasında");
  console.log("PASS: Root accepts KD/Özel/Belge; laboratory stays Özel-only; Root status updates share the same Özel record.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
