require("./register-local-ts.cjs");
const assert = require("node:assert/strict");
const { CrmKnowledgeUpdate, emptyCrmKnowledge, crmKnowledgePrompt } = require("../lib/crmKnowledgeRules.ts");
const content = { ...emptyCrmKnowledge().content, rules: "Belirsiz taleplerde numune türünü sor.", aliases: "XYZ → Hizmet kodu 123" };
assert.equal(crmKnowledgePrompt(emptyCrmKnowledge().content), "");
assert.match(crmKnowledgePrompt(content), /XYZ/);
assert.match(crmKnowledgePrompt(content), /eski sohbet yanıtlarına göre önceliklidir/);
assert.match(crmKnowledgePrompt(content), /fiyatlar hizmet listesinden alınır/);
assert.ok(CrmKnowledgeUpdate.safeParse({ version: 0, content }).success);
assert.ok(!CrmKnowledgeUpdate.safeParse({ version: -1, content }).success);
assert.ok(!CrmKnowledgeUpdate.safeParse({ version: 0, content: { ...content, rules: "a".repeat(12001) } }).success);
assert.ok(!CrmKnowledgeUpdate.safeParse({ version: 0, content: { rules: "a".repeat(12000), serviceNotes: "b".repeat(10000), aliases: "c".repeat(6000), examples: "d".repeat(12000) } }).success);
let user = null, saved = false, conflict = false;
require.cache[require.resolve("../lib/portalYetki.ts")] = { exports: { getPortalUser: async () => user } };
require.cache[require.resolve("../lib/crmKnowledgeStore.ts")] = { exports: {
  getCrmKnowledge: async () => ({ ...emptyCrmKnowledge(), content, version: 3 }),
  saveCrmKnowledge: async (next, version, name) => { assert.deepEqual(next, content); assert.equal(version, 3); assert.equal(name, "Admin"); saved = true; return !conflict; },
} };
const { GET, PUT } = require("../app/api/crm-agent/knowledge/route.ts");
const request = body => new Request("http://test/api/crm-agent/knowledge", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
(async () => {
  assert.equal((await GET()).status, 401);
  assert.equal((await PUT(request({}))).status, 401);
  user = { isAdmin: false };
  assert.equal((await GET()).status, 403);
  assert.equal((await PUT(request({}))).status, 403);
  assert.equal(saved, false);
  user = { isAdmin: true, userName: "Admin" };
  assert.equal((await (await GET()).json()).version, 3);
  assert.equal((await PUT(request({ version: 3, content: {} }))).status, 400);
  assert.equal(saved, false);
  const response = await PUT(request({ version: 3, content }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).version, 4);
  conflict = true;
  assert.equal((await PUT(request({ version: 3, content }))).status, 409);
  console.log("PASS: permanent knowledge prompt, input limits, unauthenticated/non-admin denial, read/save and concurrent-edit conflict.");
})().catch(error => { console.error(error); process.exit(1); });
