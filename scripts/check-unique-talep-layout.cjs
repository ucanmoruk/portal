// Renders the real components using synthetic state. No API or mail calls.
require('./register-local-ts.cjs');
const fs = require('node:fs'), ts = require('typescript'), React = require('react'), assert = require('node:assert/strict');
const { renderToStaticMarkup } = require('react-dom/server');
const { chromium } = require('C:/Users/dazzl/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const rules = require('../lib/uniqueTalepRules.ts'), crm = require('../lib/crmOffer.ts');
const root = 'app/(dashboard)/iletisim/unique-talep/';
const fixture = { id: 1, version: 1, date: new Date().toISOString(), name: 'Örnek Kozmetik', email: 'customer@example.com', subject: 'Kozmetik analizleri için fiyat teklifi talebi', text: 'Merhaba,\nİki ürünümüz için mikrobiyoloji, challenge ve stabilite testleri konusunda teklif rica ediyoruz.', reason: 'Laboratuvar hizmet talebi içeriyor.', category: 'Fiyat Teklifi', potential: true, status: 'Bekliyor', companyId: 5, companyName: 'Örnek Kozmetik', quoteId: null, mailState: 'Taslak', sentAt: null };
const offer = { recipient: fixture.name, email: fixture.email, subject: fixture.subject, replySubject: `Re: ${fixture.subject}`, replyBody: 'Sayın Yetkili,\n\nFiyat teklifimizi ekte bilgilerinize sunarız.', warnings: ['Numune miktarını teyit edin.'], items: [{ serviceId: 9, name: 'Kozmetik Mikrobiyoloji Testleri', quantity: 2, price: 1500, currency: 'TRY', packageTitle: 'Mikrobiyoloji paketi' }] };
const cssModule = { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
function render(file, detail, sent = false) {
  let index = 0;
  const row = { ...fixture, ...(sent ? { sentAt: new Date().toISOString(), mailState: 'Gönderildi', status: 'Teklif Gönderildi', quoteId: 77 } : {}) };
  const values = detail ? [row, offer, [], [], false, '', '', fixture.name, [], '', '', '', ''] : [[{ ...row, summary: row.text }], false, '', '', '', '', 'potential', 1, null];
  const hooks = { ...React, useEffect() {}, useRef(initial) { return { current: initial }; }, useState(initial) { const i = index++; return [i < values.length ? values[i] : initial, () => {}]; } };
  const mocks = { react: hooks, 'next/link': { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) }, '@/lib/uniqueTalepRules': rules, '@/lib/crmOffer': crm };
  const source = ts.transpileModule(fs.readFileSync(root + file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => name in mocks ? mocks[name] : name.endsWith('.css') ? cssModule : require(name), mod, mod.exports);
  const css = ['app/globals.css', 'app/styles/table.module.css', 'app/(dashboard)/iletisim/spektrotek-talep/requests.module.css', root + 'unique-talep.module.css'].map(file => fs.readFileSync(file, 'utf8').replace(/^@(?:import|source).*$/gm, '')).join('\n');
  return `<html lang="tr"><head><base href="https://preview.example/"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body style="margin:0;padding:16px">${renderToStaticMarkup(React.createElement(mod.exports.default, { id: '1' }))}</body></html>`;
}
(async () => {
  fs.mkdirSync('output/unique-talep', { recursive: true });
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    for (const width of [375, 768, 1440]) {
      for (const detail of [false, true]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        await page.route('**/unique-logo.png', route => route.fulfill({ contentType: 'image/png', body: fs.readFileSync('public/unique-logo.png') }));
        await page.setContent(render(detail ? 'UniqueRequestDetail.tsx' : 'UniqueRequestsClient.tsx', detail));
        assert(await page.locator('h1').isVisible());
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        assert(!overflow, `horizontal page overflow: ${width}, detail=${detail}`);
        if (detail) { assert.equal(await page.getByRole('button', { name: 'Yanıt ve PDF teklifi gönder' }).count(), 1); assert(await page.getByLabel('Mail açıklaması').isVisible()); assert((await page.locator('[aria-label="Oğuzhan Eker e-posta imzası"]>div').evaluate(el => getComputedStyle(el).fontFamily)).includes('Tahoma')); }
        else {
          assert.equal(await page.getByRole('link', { name: 'İncele' }).count(), 1);
          assert.equal(await page.getByRole('columnheader', { name: 'Sınıf', exact: true }).count(), 0);
          assert.equal(await page.getByRole('button', { name: /talebini listeden sil/ }).count(), 1);
          assert.equal(await page.locator('tbody select').count(), 1);
        }
        await page.screenshot({ path: `output/unique-talep/${detail ? 'detail' : 'list'}-${width}.png`, fullPage: true }); await page.close();
      }
    }
    const signaturePage = await browser.newPage({ viewport: { width: 580, height: 250 } });
    const signature = require('../lib/uniqueMailSignature.ts').uniqueMailSignatureHtml(`data:image/png;base64,${fs.readFileSync('public/unique-logo.png').toString('base64')}`);
    await signaturePage.setContent(`<html><body style="margin:10px;background:white">${signature}</body></html>`);
    assert(await signaturePage.locator('img').evaluate(el => el.complete && el.naturalWidth > 0));
    await signaturePage.screenshot({ path: 'output/unique-talep/signature.png' }); await signaturePage.close();
    const page = await browser.newPage(); await page.setContent(render('UniqueRequestDetail.tsx', true, true));
    assert(await page.getByRole('button', { name: 'Yanıt ve PDF teklifi gönder' }).isDisabled());
    assert(await page.locator('select').nth(1).isEnabled());
    console.log('PASS: real list/detail at 375/768/1440px, no page overflow, email composer, sent-send protection and post-send status updates.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
