// Real client component and synthetic API only. No production data or email access.
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), assert = require('node:assert/strict');
const root = path.resolve('tmp/unique-manual-ui'); fs.mkdirSync(root, { recursive: true });
const transpile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
fs.writeFileSync(path.join(root, 'component.js'), transpile('app/(dashboard)/iletisim/unique-talep/UniqueRequestsClient.tsx').replace('../spektrotek-talep/requests.module.css', path.resolve('app/(dashboard)/iletisim/spektrotek-talep/requests.module.css').replaceAll('\\', '/')));
fs.writeFileSync(path.join(root, 'rules.js'), transpile('lib/uniqueTalepRules.ts'));
fs.writeFileSync(path.join(root, 'UniqueCompanyPicker.js'), transpile('app/(dashboard)/iletisim/unique-talep/UniqueCompanyPicker.tsx').replace('../spektrotek-talep/requests.module.css', path.resolve('app/(dashboard)/iletisim/spektrotek-talep/requests.module.css').replaceAll('\\', '/')).replace('./unique-talep.module.css', path.resolve('app/(dashboard)/iletisim/unique-talep/unique-talep.module.css').replaceAll('\\', '/')));
fs.writeFileSync(path.join(root, 'link.js'), "import React from 'react'; export default function Link(props){return React.createElement('a',props)}");
fs.writeFileSync(path.join(root, 'css-loader.cjs'), `module.exports=function(source){const prefix=this.resourcePath.includes('table.module.css')?'table_':this.resourcePath.includes('unique-talep.module.css')?'unique_':'requests_';const names=[...new Set([...source.matchAll(/\\.([a-zA-Z_][\\w-]*)/g)].map(m=>m[1]))];return 'module.exports='+JSON.stringify(Object.fromEntries(names.map(name=>[name,prefix+name])))};`);
fs.writeFileSync(path.join(root, 'entry.js'), "import React from 'react';import{createRoot}from'react-dom/client';import Page from './component';createRoot(document.getElementById('root')).render(React.createElement(Page));");
const webpack = require('next/dist/compiled/webpack/webpack').webpack;
const compile = () => new Promise((resolve, reject) => webpack({ mode: 'development', devtool: false, entry: path.join(root, 'entry.js'), output: { path: root, filename: 'bundle.js' }, resolve: { alias: { 'next/link': path.join(root, 'link.js'), '@/lib/uniqueTalepRules': path.join(root, 'rules.js'), '@/app/styles/table.module.css': path.resolve('app/styles/table.module.css') } }, module: { rules: [{ test: /\.css$/, use: path.join(root, 'css-loader.cjs') }] }, optimization: { minimize: false } }, (error, stats) => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
const css = (file, prefix) => fs.readFileSync(file, 'utf8').replace(/\.([a-zA-Z_][\w-]*)/g, (_, name) => '.' + prefix + name);
const styles = fs.readFileSync('app/globals.css', 'utf8').replace(/^@(?:import|source).*$/gm, '') + css('app/styles/table.module.css', 'table_') + css('app/(dashboard)/iletisim/spektrotek-talep/requests.module.css', 'requests_') + css('app/(dashboard)/iletisim/unique-talep/unique-talep.module.css', 'unique_') + 'body{padding:16px}';
async function run() {
  await compile();
  const { chromium } = require('C:/Users/dazzl/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const rows = [], posts = [], errors = []; let fail = true;
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.on('pageerror', error => errors.push(error.message));
    await page.route('https://unique.test/**', async route => {
      const request = route.request(), url = new URL(request.url());
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname === '/api/unique-talep/companies') {
        const q = url.searchParams.get('q') || '';
        if (q.includes('Hata')) return json({ error: 'Arama geçici olarak kullanılamıyor.' }, 503);
        return json({ data: q.includes('Kayıtlı') ? [{ id: 77, name: 'Kayıtlı Kozmetik', email: 'existing@example.com', contact: 'Mehmet Bey' }] : [] });
      }
      if (url.pathname === '/api/unique-talep') {
        if (request.method() === 'GET') return json({ data: rows.map(({ text, offer, ...r }) => ({ ...r, summary: text.slice(0, 250), hasOffer: !!offer })) });
        const body = request.postDataJSON(); posts.push(body);
        if (fail) { fail = false; return json({ error: 'Geçici kayıt hatası. Tekrar deneyin.' }, 500); }
        const item = { ...body, id: rows.length + 1, version: 1, date: new Date().toISOString(), source: `manual:${body.requestId}`, status: 'Bekliyor', potential: true, mailState: 'Taslak', companyId: body.companyId ?? null, offer: null, createdBy: 'Test Kullanıcı' }; rows.push(item); return json({ item }, 201);
      }
      if (url.pathname === '/bundle.js') return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(root, 'bundle.js')) });
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>` });
    });
    await page.goto('https://unique.test/'); await page.getByRole('button', { name: 'Manuel talep ekle', exact: true }).click();
    await page.getByLabel('Firma / müşteri adı', { exact: true }).fill('Manuel Kozmetik'); await page.getByLabel('Yetkili kişi', { exact: true }).fill('Ayşe Hanım'); await page.getByLabel('E-posta adresi', { exact: true }).fill('manual@example.com'); await page.getByLabel('Konu', { exact: true }).fill('İki ürün için analiz talebi'); await page.getByLabel('Talep açıklaması', { exact: true }).fill('İki kozmetik ürünümüz için challenge testi fiyatı rica ediyoruz.');
    for (const width of [1440, 375]) { await page.setViewportSize({ width, height: 1000 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `manual form overflow at ${width}`); await page.screenshot({ path: path.join(root, `form-${width}.png`), fullPage: true }); }
    await page.getByRole('button', { name: 'Talebi kaydet', exact: true }).click(); await page.getByRole('alert').filter({ hasText: 'Geçici kayıt hatası' }).waitFor(); assert.equal(await page.getByLabel('Firma / müşteri adı', { exact: true }).inputValue(), 'Manuel Kozmetik');
    await page.getByRole('button', { name: 'Talebi kaydet', exact: true }).click(); await page.getByRole('status').filter({ hasText: 'Manuel talep eklendi' }).waitFor();
    assert.equal(rows.length, 1); assert.equal(posts.length, 2); assert.equal(posts[0].requestId, posts[1].requestId); assert.equal(posts[0].action, 'manual');
    assert.equal(await page.getByRole('region', { name: 'Manuel talep ekle', exact: true }).count(), 0); assert(await page.getByRole('link', { name: 'İki ürün için analiz talebi talebini incele' }).isVisible()); assert.equal(await page.getByRole('link', { name: 'İki ürün için analiz talebi talebini incele' }).getAttribute('href'), '/iletisim/unique-talep/1');
    await page.getByRole('button', { name: 'Manuel talep ekle', exact: true }).click(); await page.getByRole('button', { name: 'Manuel talep formunu kapat' }).click(); assert.equal(rows.length, 1);
    await page.getByRole('button', { name: 'Manuel talep ekle', exact: true }).click();
    await page.getByLabel('Firma / müşteri adı', { exact: true }).fill('Kayıtlı');
    await page.getByRole('option', { name: /^Kayıtlı Kozmetik/ }).waitFor();
    await page.getByLabel('Firma / müşteri adı', { exact: true }).press('Enter');
    assert.equal(await page.getByLabel('Yetkili kişi', { exact: true }).inputValue(), 'Mehmet Bey');
    assert.equal(await page.getByLabel('E-posta adresi', { exact: true }).inputValue(), 'existing@example.com');
    await page.getByLabel('Firma / müşteri adı', { exact: true }).fill('Yeni Firma');
    assert.equal(await page.getByLabel('Yetkili kişi', { exact: true }).inputValue(), '');
    assert.equal(await page.getByLabel('E-posta adresi', { exact: true }).inputValue(), '');
    await page.getByRole('option', { name: /Yeni Firma.*manuel devam et/ }).click();
    await page.getByLabel('Firma / müşteri adı', { exact: true }).fill('Kayıtlı');
    await page.getByRole('option', { name: /^Kayıtlı Kozmetik/ }).click();
    await page.getByLabel('Konu', { exact: true }).fill('Kayıtlı firma talebi');
    await page.getByLabel('Talep açıklaması', { exact: true }).fill('Analiz talebi');
    await page.getByRole('button', { name: 'Talebi kaydet', exact: true }).click();
    await page.getByRole('link', { name: 'Kayıtlı firma talebi talebini incele' }).waitFor();
    assert.equal(posts.at(-1).companyId, 77); assert.equal(rows[1].companyId, 77);
    await page.getByRole('button', { name: 'Manuel talep ekle', exact: true }).click();
    await page.getByLabel('Firma / müşteri adı', { exact: true }).fill('Hata Firma');
    await page.getByRole('status').filter({ hasText: 'Arama geçici olarak' }).waitFor();
    await page.getByRole('option', { name: /Hata Firma.*manuel devam et/ }).click();
    await page.getByRole('button', { name: 'Manuel talep formunu kapat' }).click();
    assert.equal(rows.length, 2); assert.deepEqual(errors, []);
    console.log('PASS Unique manual browser: registered company search/keyboard and mouse selection, autofill/linking, stale selection removal, manual fallback on no result/error, open/fill form, responsive layout, failed-save preservation, stable retry ID, create/list visibility, detail link and cancel. Synthetic API only.');
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
