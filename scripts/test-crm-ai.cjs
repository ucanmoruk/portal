require("./register-local-ts.cjs");
const assert = require("node:assert/strict");
const { crmAiConfig, requestCrmAnalysis } = require("../lib/crmAi.ts");
(async () => {
  assert.throws(() => crmAiConfig({}), /ANTHROPIC_API_KEY/);
  assert.equal(crmAiConfig({ ANTHROPIC_API_KEY: "test-claude", OPENAI_API_KEY: "test-openai" }).provider, "anthropic");
  assert.equal(crmAiConfig({ OPENAI_API_KEY: "test-openai" }).provider, "openai");
  assert.equal(crmAiConfig({ CRM_AI_PROVIDER: "openai", ANTHROPIC_API_KEY: "test-claude", OPENAI_API_KEY: "test-openai" }).provider, "openai");
  assert.throws(() => crmAiConfig({ CRM_AI_PROVIDER: "anthropic", OPENAI_API_KEY: "test-openai" }), /ANTHROPIC_API_KEY/);
  for (const provider of ["anthropic", "openai"]) {
    const config = crmAiConfig({ CRM_AI_PROVIDER: provider, ANTHROPIC_API_KEY: "test-claude", OPENAI_API_KEY: "test-openai" });
    const result = await requestCrmAnalysis(config, "system instructions", [{ role: "user", content: "test" }], async (url, options) => {
      const payload = JSON.parse(options.body);
      const format = provider === "anthropic" ? payload.output_config.format : payload.text.format;
      const offerSchema = format.schema.properties.offer.anyOf.find(item => item.type === "object");
      assert.ok(offerSchema.properties.replyBody);
      assert.ok(offerSchema.properties.packages);
      assert.ok(offerSchema.required.includes("replyBody"));
      assert.ok(offerSchema.required.includes("packages"));
      if (provider === "anthropic") {
        assert.equal(url, "https://api.anthropic.com/v1/messages");
        assert.equal(options.headers["x-api-key"], "test-claude");
        assert.equal(options.headers.Authorization, undefined);
        assert.equal(payload.system, "system instructions");
        assert.equal(payload.output_config.format.type, "json_schema");
        assert.ok(!JSON.stringify(payload.output_config.format.schema).includes('"minimum"'));
      } else {
        assert.equal(url, "https://api.openai.com/v1/responses");
        assert.equal(options.headers.Authorization, "Bearer test-openai");
        assert.equal(payload.input[0].role, "system");
      }
      const text = JSON.stringify({ answer: "Tamam", offer: null });
      return Response.json(provider === "anthropic" ? { content: [{ type: "text", text }] } : { output: [{ content: [{ text }] }] });
    });
    assert.deepEqual(result, { answer: "Tamam", offer: null });
  }
  await assert.rejects(() => requestCrmAnalysis(crmAiConfig({ ANTHROPIC_API_KEY: "test-claude" }), "", [], async () => Response.json({ error: { message: "sensitive details" } }, { status: 401 })), e => /401/.test(e.message) && !e.message.includes("sensitive details"));
  await assert.rejects(() => requestCrmAnalysis(crmAiConfig({ ANTHROPIC_API_KEY: "test-claude" }), "", [], async () => Response.json({ content: [{ type: "text", text: '{"answer":"bad"}' }] })), /doğrulanamadı/);
  console.log("PASS: provider selection, credential isolation, Claude/OpenAI request and response formats, sanitized errors, invalid response rejection.");
})().catch(error => { console.error(error); process.exit(1); });
