import { crmAiConfig } from "@/lib/crmAi";
import { getAllSettings } from "@/lib/settings";

export async function crmSalesAiConfig() {
  const settings = await getAllSettings();
  const provider = settings.CRM_SALES_AI_PROVIDER || process.env.CRM_AI_PROVIDER || (process.env.ANTHROPIC_API_KEY ? "anthropic" : "openai");
  const env: NodeJS.ProcessEnv = { ...process.env, CRM_AI_PROVIDER: provider };
  if (provider === "anthropic") {
    env.ANTHROPIC_API_KEY = settings.CRM_SALES_ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY;
    env.ANTHROPIC_MODEL = settings.CRM_SALES_AI_MODEL || env.ANTHROPIC_MODEL;
  } else {
    env.OPENAI_API_KEY = settings.CRM_SALES_OPENAI_API_KEY || env.OPENAI_API_KEY;
    env.OPENAI_MODEL = settings.CRM_SALES_AI_MODEL || env.OPENAI_MODEL;
  }
  return crmAiConfig(env);
}
