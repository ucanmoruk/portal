/* eslint-disable @typescript-eslint/no-require-imports */
// Read-only integration verification against the local development server.
const assert = require("node:assert/strict");
require("@next/env").loadEnvConfig(process.cwd());
let database;

(async () => {
  const { encode } = require("next-auth/jwt");
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: {
    sub: "2", userId: "2", name: "Local verification", firmalar: ["Unique", "Root"],
    laboratuvarBirimId: 0,
  }, maxAge: 600 });
  const headers = { cookie: `next-auth.session-token=${token}` };
  if (process.env.MYSQL_HOST) {
    database = require("mysql2/promise").createPool({
      host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
    });
  }
  const routes = ["numune-kabul", "numune-takip-lab/pending", "numune-takip-lab/counts",
    "numune-takip-lab/global-search?search=2026", "sonuc-giris", "rapor-takip", "analiz-numune-listesi", "rapor-takip/mail-log"];
  for (const workspace of ["laboratuvar", "root"]) {
    for (const route of routes) {
      const response = await fetch(`http://127.0.0.1:1038/api/${route}${route.includes("?") ? "&" : "?"}workspace=${workspace}`, {
        headers, signal: AbortSignal.timeout(90000),
      });
      const json = await response.json();
      assert.equal(response.status, 200, `${workspace}/${route}: ${json.error || response.status}`);
      assert.ok(!json.errors || Object.keys(json.errors).length === 0, `${workspace}/${route}: ${JSON.stringify(json.errors)}`);
      const allowed = workspace === "root" ? ["K.D.", "Belge"] : ["Özel"];
      let checked = 0;
      const sampleIds = new Set();
      function inspect(value) {
        if (!value || typeof value !== "object") return;
        if (Object.hasOwn(value, "Grup")) {
          assert.ok(allowed.includes(String(value.Grup).trim()), `${workspace}/${route}: unexpected group ${value.Grup}`);
          checked++;
        }
        if (Number(value.NkrID) > 0) sampleIds.add(Number(value.NkrID));
        if (Number(value.nkrId) > 0) sampleIds.add(Number(value.nkrId));
        for (const child of Object.values(value)) inspect(child);
      }
      inspect(json);
      if (database && sampleIds.size) {
        const ids = [...sampleIds];
        const [rows] = await database.execute(`SELECT ID, Grup FROM NKR WHERE ID IN (${ids.map(() => "?").join(",")})`, ids);
        assert.equal(rows.length, ids.length, `${workspace}/${route}: missing database records`);
        for (const row of rows) assert.ok(allowed.includes(String(row.Grup).trim()), `${workspace}/${route}: database group mismatch`);
      }
      console.log(`PASS ${workspace}/${route} (${checked} group fields; ${sampleIds.size} database IDs; total ${json.total ?? "n/a"})`);
    }
  }
  for (const workspace of ["laboratuvar", "root-kozmetik"]) {
    const prefix = workspace === "root-kozmetik" ? "/laboratuvar/root-kozmetik" : "/laboratuvar";
    for (const page of ["numune-takip", "numune-takip-lab", "sonuc-giris", "rapor-takip", "analiz-numune-listesi", "numune-form", "yeni-numune"]) {
      const response = await fetch(`http://127.0.0.1:1038${prefix}/${page}`, { headers, signal: AbortSignal.timeout(90000) });
      const html = await response.text();
      assert.equal(response.status, 200, `${prefix}/${page}`);
      assert.ok(!html.includes('"name":"Error"'), `${prefix}/${page}: server rendering error`);
      console.log(`PASS page ${prefix}/${page}`);
    }
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => { if (database) await database.end(); });
