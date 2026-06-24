export interface TcmbRate {
  code: string;
  name: string;
  forexBuying: number;
}

const TCMB_TODAY_XML = "https://www.tcmb.gov.tr/kurlar/today.xml";

function parseNumber(value: string | undefined) {
  const n = Number(String(value || "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function normalizeCurrency(value: unknown) {
  const v = String(value || "").trim().toUpperCase();
  if (!v || v === "TRY" || v === "TL" || v === "₺") return "TRY";
  if (v === "$") return "USD";
  if (v === "€") return "EUR";
  if (v === "£") return "GBP";
  return v;
}

export function normalizeParaBirimi(value: unknown) {
  return normalizeCurrency(value);
}

export async function fetchTcmbTodayRates(): Promise<Record<string, TcmbRate>> {
  const res = await fetch(TCMB_TODAY_XML, { cache: "no-store" });
  if (!res.ok) throw new Error(`TCMB kur bilgisi alınamadı (${res.status}).`);
  const xml = await res.text();
  const rates: Record<string, TcmbRate> = {};
  const currencyRe = /<Currency\b([^>]*)>([\s\S]*?)<\/Currency>/g;
  let match: RegExpExecArray | null;
  while ((match = currencyRe.exec(xml)) !== null) {
    const attrs = match[1] || "";
    const body = match[2] || "";
    const code = attrs.match(/\bCurrencyCode="([^"]+)"/i)?.[1]?.toUpperCase();
    if (!code) continue;
    const buying = parseNumber(body.match(/<ForexBuying>([^<]*)<\/ForexBuying>/i)?.[1]);
    if (!buying) continue;
    const name = body.match(/<Isim>([^<]*)<\/Isim>/i)?.[1] || code;
    rates[code] = { code, name, forexBuying: buying };
  }
  return rates;
}

export async function getTcmbForexBuying(currency: unknown) {
  const code = normalizeCurrency(currency);
  if (code === "TRY" || code === "ÇOKLU") return null;
  const rates = await fetchTcmbTodayRates();
  return rates[code] || null;
}

export function calculateTlEquivalent(total: unknown, currency: unknown, rates: Record<string, TcmbRate>) {
  const code = normalizeCurrency(currency);
  if (code === "TRY" || code === "ÇOKLU") return null;
  const rate = rates[code]?.forexBuying;
  const amount = Number(total || 0);
  if (!rate || !Number.isFinite(amount)) return null;
  return Number((amount * rate).toFixed(2));
}
