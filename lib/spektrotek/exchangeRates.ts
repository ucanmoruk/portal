import type { ExchangeRates } from './types';

export async function getExchangeRates(): Promise<ExchangeRates> {
  const defaults: ExchangeRates = { USD: 35.50, EUR: 37.20, GBP: 44.50, TRY: 1 };

  try {
    const response = await fetch('https://www.tcmb.gov.tr/kurlar/today.xml', {
      next: { revalidate: 3600 },
    });
    if (!response.ok) return defaults;

    const xml = await response.text();
    const getRate = (code: string) => {
      const re = new RegExp(`<Currency[^>]*Kod="${code}"[^>]*>[\\s\\S]*?<ForexBuying>([0-9.]+)<\\/ForexBuying>`, 'i');
      const m = xml.match(re);
      return m?.[1] ? parseFloat(m[1]) : null;
    };

    const usd = getRate('USD');
    const eur = getRate('EUR');
    const gbp = getRate('GBP');
    if (usd) defaults.USD = usd;
    if (eur) defaults.EUR = eur;
    if (gbp) defaults.GBP = gbp;
    return defaults;
  } catch {
    return defaults;
  }
}
