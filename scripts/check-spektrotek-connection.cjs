// Run on the portal host; never print the secret or product/customer payloads.
require('@next/env').loadEnvConfig(process.cwd());
(async () => {
  const key = (process.env.SPEKTROTEK_INTEGRATION_KEY || '').trim();
  if (key.length < 32) throw new Error('SPEKTROTEK_INTEGRATION_KEY eksik veya 32 karakterden kısa.');
  const origin = new URL(process.env.SPEKTROTEK_PORTAL_URL || 'https://lab.uniqueanalyse.com');
  if (origin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('HTTPS zorunlu.');
  for (const route of ['/health', '/products?page=1&limit=1']) {
    const response = await fetch(new URL('/api/integrations/spektrotek' + route, origin), {
      headers: { 'x-api-key': key }, redirect: 'error', signal: AbortSignal.timeout(30000),
    });
    const json = await response.json().catch(() => null);
    console.log(route.split('?')[0] + ': HTTP ' + response.status);
    if (!response.ok) {
      // Known service errors only; HTML and remote payloads are deliberately omitted.
      if (response.status === 401) console.log('Anahtar, hedef adres ve reverse proxy başlıklarını kontrol edin.');
      if (response.status === 503) console.log('Çalışan ortam anahtarını ve sunucu/veritabanı erişimini kontrol edin.');
      throw new Error('Bağlantı kontrolü başarısız.');
    }
    if (route === '/health' && (json?.service !== 'spektrotek-commerce' || json?.version !== 1)) throw new Error('Beklenen entegrasyon sürümü kurulu değil.');
    if (route !== '/health') {
      if (!Array.isArray(json?.data)) throw new Error('Beklenen ürün yanıtı alınamadı.');
      console.log('Ürün beslemesi erişilebilir; toplam: ' + json.total);
    }
  }
})().catch(() => { console.error('Kontrol tamamlanamadı; ağ erişimi, kurulum ve sunucu ayarlarını inceleyin.'); process.exitCode = 1; });
