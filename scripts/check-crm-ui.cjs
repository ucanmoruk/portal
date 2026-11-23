// Real React components, isolated browser and synthetic API. No production access.
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), assert = require('node:assert/strict'), { randomUUID } = require('node:crypto');
const root = path.resolve('tmp/crm-ui-check'); fs.mkdirSync(root, { recursive: true });
const componentPath = 'app/(dashboard)/iletisim/crm/CrmClient.tsx';
const transpile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
fs.writeFileSync(path.join(root, 'component.js'), transpile(componentPath).replace('../spektrotek-talep/requests.module.css', path.resolve('app/(dashboard)/iletisim/spektrotek-talep/requests.module.css').replace(/\\/g, '/')).replace('./crm.module.css', path.resolve('app/(dashboard)/iletisim/crm/crm.module.css').replace(/\\/g, '/')));
fs.writeFileSync(path.join(root, 'rules.js'), transpile('lib/crmRules.ts'));
fs.writeFileSync(path.join(root, 'CrmContactsEditor.js'), transpile('app/(dashboard)/iletisim/crm/CrmContactsEditor.tsx').replace('../spektrotek-talep/requests.module.css', path.resolve('app/(dashboard)/iletisim/spektrotek-talep/requests.module.css').replaceAll(String.fromCharCode(92), '/')).replace('./crm.module.css', path.resolve('app/(dashboard)/iletisim/crm/crm.module.css').replaceAll(String.fromCharCode(92), '/')));
fs.writeFileSync(path.join(root, 'CrmMailComposer.js'), transpile('app/(dashboard)/iletisim/crm/CrmMailComposer.tsx').replace('../spektrotek-talep/requests.module.css', path.resolve('app/(dashboard)/iletisim/spektrotek-talep/requests.module.css').replaceAll(String.fromCharCode(92), '/')).replace('./crm.module.css', path.resolve('app/(dashboard)/iletisim/crm/crm.module.css').replaceAll(String.fromCharCode(92), '/')));
fs.writeFileSync(path.join(root, 'email.js'), transpile('lib/crmEmail.ts'));
fs.writeFileSync(path.join(root, 'sanitize.js'), transpile('lib/htmlSanitize.ts'));
fs.writeFileSync(path.join(root, 'CrmEmailEditor.js'), transpile('app/(dashboard)/iletisim/crm/CrmEmailEditor.tsx').replace('../spektrotek-talep/requests.module.css', path.resolve('app/(dashboard)/iletisim/spektrotek-talep/requests.module.css').replaceAll(String.fromCharCode(92), '/')).replace('./crm.module.css', path.resolve('app/(dashboard)/iletisim/crm/crm.module.css').replaceAll(String.fromCharCode(92), '/')));
fs.writeFileSync(path.join(root, 'css-loader.cjs'), `module.exports=function(source){const prefix=this.resourcePath.includes('table.module.css')?'table_':this.resourcePath.includes('crm.module.css')?'crm_':'requests_';const names=[...new Set([...source.matchAll(/\\.([a-zA-Z_][\\w-]*)/g)].map(m=>m[1]))];return 'module.exports='+JSON.stringify(Object.fromEntries(names.map(name=>[name,prefix+name])))};`);
fs.writeFileSync(path.join(root, 'entry.js'), "import React from 'react';import{createRoot}from'react-dom/client';import Page from './component';createRoot(document.getElementById('root')).render(React.createElement(Page));");
const webpack = require('next/dist/compiled/webpack/webpack').webpack;
const compile = () => new Promise((resolve, reject) => webpack({ mode: 'development', devtool: false, entry: path.join(root, 'entry.js'), output: { path: root, filename: 'bundle.js', publicPath: '/' }, resolve: { alias: { '@/lib/crmRules': path.join(root, 'rules.js'), '@/lib/crmEmail': path.join(root, 'email.js'), '@/lib/htmlSanitize': path.join(root, 'sanitize.js'), '@/app/styles/table.module.css': path.resolve('app/styles/table.module.css') } }, module: { rules: [{ test: /\.css$/, use: path.join(root, 'css-loader.cjs') }] }, optimization: { minimize: false } }, (error, stats) => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
function css(file, prefix) { return fs.readFileSync(file, 'utf8').replace(/\.([a-zA-Z_][\w-]*)/g, (_, name) => '.' + prefix + name); }
const styles = fs.readFileSync('app/globals.css', 'utf8').replace(/^@(?:import|source).*$/gm, '') + css('app/styles/table.module.css', 'table_') + css('app/(dashboard)/iletisim/spektrotek-talep/requests.module.css', 'requests_') + css('app/(dashboard)/iletisim/crm/crm.module.css', 'crm_') + 'body{padding:16px}';
const data = { companies: [], lists: [], templates: [], campaigns: [], deleted: [], canUseCustomers: true }, commands = [], errors = [];
const directMails = [], directSends = [];
const record = (kind, values) => ({ id: randomUUID(), version: 1, kind, data: values, updatedBy: 'Test Kullanıcı', updatedAt: new Date().toISOString() });
async function run() {
  await compile();
  const { chromium } = require('C:/Users/dazzl/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.on('pageerror', error => errors.push(error.message));
    await page.route('https://crm.test/**', async route => {
      const request = route.request(), url = new URL(request.url());
      const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname === '/api/crm/mail') {
        if (request.method() === 'GET') return json({ records: directMails.filter(r => r.data.companyId === url.searchParams.get('companyId')), configured: true, sender: 'Portal <sender@example.test>', canSend: true, canResolve: true });
        const b = request.postDataJSON();
        if (b.action === 'draft') {
          const company = data.companies.find(c => c.id === b.companyId);
          let r = directMails.find(r => r.id === b.id);
          const recipient = b.to === company.data.email ? { email: company.data.email, name: company.data.contact, role: company.data.emailRole || '' } : company.data.contacts.find(c => c.email === b.to);
          const mailData = { ...b, name: b.subject, to: recipient?.email || '', toName: recipient?.name || '', toRole: recipient?.role || '', companyName: company.data.name, companyVersion: company.version, renderedSubject: b.subject.replaceAll('{{firma}}', company.data.name), html: b.body.replaceAll('{{firma}}', company.data.name).replaceAll('{{yetkili}}', recipient?.name || 'Yetkili'), state: 'Taslak', history: [], error: '' };
          if (r) { r.data = mailData; r.version++; } else { r = { ...record('mail', mailData), id: b.id }; directMails.push(r); }
          return json({ record: r });
        }
        if (b.action === 'send') { const r = directMails.find(r => r.id === b.id); directSends.push(b); r.data.state = 'Gönderildi'; r.data.sentAt = new Date().toISOString(); r.version++; return json({ record: r, message: 'Mail SMTP sunucusuna iletildi. Teslim ve açılma teyidi henüz yok.' }); }
      }
      if (url.pathname === '/api/crm') {
        if (request.method() === 'GET') return json(url.searchParams.has('customers') ? { customers: [{ ID: 5, name: 'Mevcut Müşteri', email: 'customer@example.com' }] } : data);
        const b = request.postDataJSON(); commands.push(b);
        if (b.action === 'list') data.lists.push(record('list', { name: b.name, description: b.description, companyIds: [] }));
        if (b.action === 'companies') for (const c of b.companies) { const r = record('company', { ...c, customerId: null, source: b.imported ? 'İçe aktarma' : 'Manuel' }); data.companies.push(r); if (b.listId) data.lists.find(l => l.id === b.listId).data.companyIds.push(r.id); }
        if (b.action === 'template') data.templates.push(record('template', b));
        if (b.action === 'delete' || b.action === 'restore') {
          const key = { company: 'companies', list: 'lists', template: 'templates', campaign: 'campaigns' }[b.kind];
          const source = b.action === 'delete' ? data[key] : data.deleted, target = b.action === 'delete' ? data.deleted : data[key];
          const index = source.findIndex(r => r.id === b.id), item = source.splice(index, 1)[0]; item.version++;
          if (b.action === 'delete') { item.deletedAt = new Date().toISOString(); item.data._deleted = { at: item.deletedAt, by: 'Test Kullanıcı' }; }
          else { delete item.deletedAt; delete item.data._deleted; }
          target.push(item);
        }
        if (b.action === 'campaign') { const t = data.templates.find(t => t.id === b.templateId); data.campaigns.push(record('campaign', { ...b, subject: t.data.subject, body: t.data.body, format: t.data.format, state: 'Taslak', members: data.lists.find(l => l.id === b.listId).data.companyIds.map(companyId => ({ companyId, status: 'Yeni', note: '', nextContact: '', history: [] })) })); }
        if (b.action === 'activity') { const c = data.campaigns.find(c => c.id === b.id), m = c.data.members.find(m => m.companyId === b.companyId); Object.assign(m, { status: b.status, note: b.note, nextContact: b.nextContact }); m.history.push({ at: new Date().toISOString(), by: 'Test Kullanıcı', status: b.status, note: b.note }); c.version++; }
        return json({ message: 'Kaydedildi.' });
      }
      const asset = path.join(root, path.basename(url.pathname));
      if (url.pathname.endsWith('.js') && fs.existsSync(asset)) return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(asset) });
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>` });
    });
    await page.goto('https://crm.test/');
    await page.getByRole('button', { name: 'Liste oluştur', exact: true }).click(); await page.getByLabel('Liste adı', { exact: true }).fill('Kozmetik firmaları'); await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await page.locator('aside').getByRole('button', { name: /Kozmetik firmaları/ }).click();
    await page.getByRole('button', { name: 'Firma ekle', exact: true }).click(); await page.getByLabel('Firma adı', { exact: true }).fill('Örnek Kozmetik'); await page.getByLabel('E-posta', { exact: true }).fill('lead@example.com'); await page.getByLabel('Yetkili', { exact: true }).fill('Ayşe Hanım');
    await page.getByRole('button', { name: 'E-posta ekle', exact: true }).click();
    await page.getByLabel('Kişi adı 2', { exact: true }).fill('Mehmet Bey');
    await page.getByLabel('Görev / bölüm 2', { exact: true }).fill('Satın alma');
    await page.getByLabel('E-posta 2', { exact: true }).fill('buyer@example.com');
    await page.getByRole('button', { name: '2. adresi ana e-posta yap', exact: true }).click();
    assert.equal(await page.getByLabel('E-posta', { exact: true }).inputValue(), 'buyer@example.com');
    await page.getByRole('button', { name: '2. adresi ana e-posta yap', exact: true }).click();
    assert.equal(await page.getByLabel('E-posta', { exact: true }).inputValue(), 'lead@example.com');
    await page.getByLabel('E-posta 2', { exact: true }).fill('LEAD@EXAMPLE.COM');
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Aynı e-posta' }).waitFor();
    await page.getByLabel('E-posta 2', { exact: true }).fill('buyer@example.com');
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click(); await page.getByRole('cell', { name: 'Örnek Kozmetik Ayşe Hanım' }).waitFor();
    await page.getByRole('tab', { name: 'Mail şablonları', exact: true }).click(); await page.getByRole('button', { name: 'Şablon oluştur', exact: true }).click(); await page.getByLabel('Şablon adı', { exact: true }).fill('Hizmet tanıtımı'); await page.getByLabel('Mail konusu', { exact: true }).fill('{{firma}} için analiz hizmetleri');
    await page.getByRole('button', { name: 'HTML kaynak', exact: true }).click();
    await page.getByLabel('HTML kaynak kodu', { exact: true }).fill('<h2>Analiz Hizmetleri</h2><p>Sayın {{yetkili}},</p><p>{{firma}} için hizmetlerimiz.</p>');
    await page.getByRole('button', { name: 'Görsel düzenle', exact: true }).click();
    await page.getByRole('textbox', { name: 'Mail içeriği', exact: true }).getByRole('heading', { name: 'Analiz Hizmetleri', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Resim ekle / düzenle', exact: true }).click();
    await page.getByLabel('Görsel açıklaması', { exact: true }).fill('Firma logosu'); await page.getByLabel('Genişlik (piksel)', { exact: true }).fill('100');
    const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=', 'base64');
    await page.locator('input[type=file][accept^="image/png"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: pixel });
    await page.getByRole('textbox', { name: 'Mail içeriği', exact: true }).getByRole('img', { name: 'Firma logosu' }).waitFor();
    await page.getByRole('button', { name: 'Bağlantı ekle / düzenle', exact: true }).click();
    await page.getByLabel('Bağlantı adresi', { exact: true }).fill('https://example.com/hizmetler');
    await page.getByRole('button', { name: 'İçeriğe ekle', exact: true }).click();
    await page.getByRole('textbox', { name: 'Mail içeriği', exact: true }).getByRole('link', { name: 'https://example.com/hizmetler' }).waitFor();
    await page.screenshot({ path: path.join(root, 'editor-1440.png'), fullPage: true });
    await page.setViewportSize({ width: 375, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'email editor overflow at 375px');
    await page.screenshot({ path: path.join(root, 'editor-375.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'HTML kaynak', exact: true }).click();
    const sourceHtml = await page.getByLabel('HTML kaynak kodu', { exact: true }).inputValue(); assert(sourceHtml.includes('<h2>Analiz Hizmetleri</h2>')); assert(sourceHtml.includes('data:image/png;base64,')); assert(sourceHtml.includes('https://example.com/hizmetler'));
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click(); await page.getByRole('cell', { name: 'Hizmet tanıtımı', exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Kampanyalar', exact: true }).click(); await page.getByRole('button', { name: 'Kampanya oluştur', exact: true }).click(); await page.getByLabel('Kampanya adı', { exact: true }).fill('Kasım tanıtımı'); await page.getByRole('combobox', { name: /^Firma listesi/ }).selectOption(data.lists[0].id); await page.getByRole('combobox', { name: /^Mail şablonu/ }).selectOption(data.templates[0].id); await page.getByRole('button', { name: 'Oluştur', exact: true }).click();
    await page.getByRole('button', { name: 'Kasım tanıtımı kampanyasını incele' }).click(); await page.getByRole('button', { name: 'Örnek Kozmetik takip kaydını düzenle' }).click(); await page.getByRole('combobox', { name: /^Durum/ }).last().selectOption('Tekrar aranacak'); await page.getByLabel('Not', { exact: true }).fill('Pazartesi tekrar aranacak.'); await page.getByLabel('Sonraki iletişim tarihi').fill('2026-11-23'); await page.getByRole('button', { name: 'Kaydet', exact: true }).click(); await page.getByRole('cell', { name: 'Pazartesi tekrar aranacak.', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Örnek Kozmetik mailini önizle' }).click(); await page.getByText('Örnek Kozmetik için analiz hizmetleri', { exact: true }).waitFor(); assert((await page.frameLocator('iframe[title="Mail içerik önizlemesi"]').locator('body').textContent()).includes('Sayın Ayşe Hanım')); await page.getByRole('button', { name: 'Önizlemeyi kapat' }).click();
    for (const width of [1440, 768, 375]) { await page.setViewportSize({ width, height: 1000 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `page overflow at ${width}`); await page.screenshot({ path: path.join(root, `campaign-${width}.png`), fullPage: true }); }
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.getByRole('tab', { name: 'Listeler', exact: true }).click(); await page.screenshot({ path: path.join(root, 'lists-1440.png'), fullPage: true });
    await page.locator('input[type=file]').setInputFiles({ name: 'firmalar.csv', mimeType: 'text/csv', buffer: Buffer.from('Firma,E-posta,Telefon\nİçe Aktarılan Firma,import@example.com,555\n') }); await page.getByRole('heading', { name: 'İçe aktarma önizlemesi' }).waitFor(); assert.equal(data.companies.length, 1, 'preview must not save'); await page.getByRole('button', { name: '1 firmayı içe aktar' }).click(); await page.getByRole('cell', { name: 'İçe Aktarılan Firma', exact: true }).waitFor();
    await page.locator('input[type=file]').setInputFiles({ name: 'hatali.csv', mimeType: 'text/csv', buffer: Buffer.from('Firma,E-posta\nHatalı Firma,not-an-email\n') }); await page.getByText(/Dosyayı düzeltip yeniden yükleyin/).waitFor(); assert(await page.getByRole('button', { name: '0 firmayı içe aktar' }).isDisabled()); assert.equal(data.companies.length, 2);
    await page.getByRole('button', { name: 'Vazgeç', exact: true }).click();
    await page.getByRole('tab', { name: 'Firmalar', exact: true }).click();
    await page.getByRole('button', { name: 'Örnek Kozmetik firmasına mail hazırla', exact: true }).click();
    const composer = page.getByRole('region', { name: 'Firmaya özel mail', exact: true });
    await composer.getByText('Gönderen: Portal <sender@example.test>', { exact: true }).waitFor();
    await composer.getByRole('combobox', { name: 'Birebir mail şablonu', exact: true }).selectOption(data.templates[0].id);
    assert.equal(await composer.getByRole('combobox', { name: 'Alıcı e-posta', exact: true }).inputValue(), '');
    await composer.getByRole('combobox', { name: 'Alıcı e-posta', exact: true }).selectOption('buyer@example.com');
    await composer.getByLabel('Mail konusu', { exact: true }).fill('Örnek Kozmetik için özel görüşme');
    await composer.getByRole('button', { name: 'Taslağı kaydet', exact: true }).click();
    await composer.getByText('Firmaya özel mail taslağı kaydedildi.', { exact: true }).waitFor();
    assert.equal(directSends.length, 0); assert.equal(directMails.length, 1); assert.equal(data.templates[0].data.subject, '{{firma}} için analiz hizmetleri');
    await composer.getByRole('button', { name: 'Gönderimi incele', exact: true }).click();
    const review = composer.getByRole('region', { name: 'Mail gönderim kontrolü', exact: true });
    await review.waitFor(); assert.equal(directSends.length, 0);
    assert((await review.textContent()).includes('buyer@example.com')); assert((await review.textContent()).includes('Mehmet Bey'));
    assert((await page.frameLocator('iframe[title="Gönderilecek mail içeriği"]').locator('body').textContent()).includes('Sayın Mehmet Bey'));
    for (const width of [1440, 375]) { await page.setViewportSize({ width, height: 1000 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `direct mail overflow at ${width}`); await review.locator("iframe").scrollIntoViewIfNeeded(); await page.frameLocator('iframe[title="Gönderilecek mail içeriği"]').getByRole("heading", { name: "Analiz Hizmetleri" }).waitFor(); await page.screenshot({ path: path.join(root, `direct-mail-${width}.png`), fullPage: true }); }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await review.getByRole('button', { name: 'Bu firmaya gönder', exact: true }).click();
    await composer.getByRole('status').filter({ hasText: 'SMTP sunucusuna iletildi' }).waitFor();
    assert.equal(directSends.length, 1); assert.equal(directSends[0].confirmTo, 'buyer@example.com'); assert(await composer.getByRole('button', { name: 'Gönderimi incele', exact: true }).isDisabled());
    await composer.getByRole('button', { name: 'Firma mail alanını kapat', exact: true }).click();
    for (const [tab, label, key] of [['Firmalar', 'Örnek Kozmetik · Firma sil', 'companies'], ['Listeler', 'Kozmetik firmaları · Liste sil', 'lists'], ['Mail şablonları', 'Hizmet tanıtımı · Mail şablonu sil', 'templates'], ['Kampanyalar', 'Kasım tanıtımı · Kampanya sil', 'campaigns']]) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      if (tab === 'Listeler') await page.locator('aside').getByRole('button', { name: /Kozmetik firmaları/ }).click();
      const previous = data[key].length;
      await page.getByRole('button', { name: label, exact: true }).click();
      const dialog = page.getByRole('alertdialog'); await dialog.waitFor(); assert.equal(data[key].length, previous);
      await dialog.getByRole('button', { name: 'Silinenlere taşı' }).click();
      await page.getByRole('tab', { name: 'Silinenler', exact: true }).click();
      await page.getByRole('button', { name: /kaydını geri al/ }).click();
      await page.getByRole('cell', { name: 'Silinen kayıt yok.', exact: true }).waitFor(); assert.equal(data[key].length, previous);
    }
    assert.equal(commands.filter(c => c.action === 'activity').length, 1); assert.deepEqual(errors, []);
    console.log('PASS CRM browser: company-specific draft/review/send/history/duplicate UI lock, rich editor HTML/visual mode, image upload, links, delete/restore, real list/company/template/campaign creation, activity persistence, personalized preview, CSV preview/import/error handling, no JS errors or page overflow at 375/768/1440px. Synthetic API only.');
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
