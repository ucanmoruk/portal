import { z } from "zod";
import { CrmAnalysis } from "@/lib/crmOffer";

type Config = { provider: "anthropic" | "openai"; apiKey: string; model: string };
type Message = { role: "user" | "assistant"; content: string };
export function crmAiConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const requested = env.CRM_AI_PROVIDER?.trim().toLowerCase();
  if (requested && !["anthropic", "openai"].includes(requested)) throw new Error("CRM_AI_PROVIDER anthropic veya openai olmalıdır.");
  const provider = requested || (env.ANTHROPIC_API_KEY?.trim() ? "anthropic" : "openai");
  const apiKey = (provider === "anthropic" ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY)?.trim();
  if (!apiKey) throw new Error(requested
    ? `CRM Agent için ${provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"} tanımlı değil.`
    : "CRM Agent için ANTHROPIC_API_KEY (Claude) veya OPENAI_API_KEY tanımlanmalıdır. Canlı sunucu ayarları localhost'a otomatik aktarılmaz.");
  return { provider: provider as Config["provider"], apiKey, model: (provider === "anthropic" ? env.ANTHROPIC_MODEL : env.OPENAI_MODEL)?.trim() || (provider === "anthropic" ? "claude-sonnet-4-6" : "gpt-4.1-mini") };
}

// Claude's wire schema omits validation keywords it does not support.
// The original Zod schema still validates the result before any draft is stored.
export function claudeSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(claudeSchema);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !["$schema", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "minItems", "maxItems"].includes(key)).map(([key, item]) => [key, claudeSchema(item)]));
}

export async function requestCrmAnalysis(config: Config, system: string, messages: Message[], fetcher: typeof fetch = fetch) {
  const schema = z.toJSONSchema(CrmAnalysis);
  const anthropic = config.provider === "anthropic";
  const response = await fetcher(anthropic ? "https://api.anthropic.com/v1/messages" : "https://api.openai.com/v1/responses", {
    method: "POST", signal: AbortSignal.timeout(90000),
    headers: anthropic ? { "x-api-key": config.apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" } : { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(anthropic ? {
      model: config.model, max_tokens: 8192, system, messages,
      output_config: { format: { type: "json_schema", schema: claudeSchema(schema) } },
    } : {
      model: config.model, text: { format: { type: "json_schema", name: "crm_analysis", strict: true, schema } },
      input: [{ role: "system", content: system }, ...messages],
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${anthropic ? "Claude" : "OpenAI"} isteği başarısız (HTTP ${response.status}). API anahtarı, model erişimi ve kullanım limitini kontrol edin.`);
  if (data.stop_reason === "max_tokens" || data.status === "incomplete") throw new Error("AI yanıtı uzunluk sınırına takıldı. Talebi daha az hizmetle tekrar deneyin.");
  const text = anthropic ? data.content?.filter((item: { type: string }) => item.type === "text").map((item: { text: string }) => item.text).join("\n")
    : data.output_text || data.output?.flatMap((item: { content?: { text?: string }[] }) => item.content || []).map((item: { text?: string }) => item.text || "").join("\n");
  try { return CrmAnalysis.parse(JSON.parse(text || "")); }
  catch { throw new Error("AI yanıtı doğrulanamadı. Lütfen tekrar deneyin."); }
}
