/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { PDFDocument, rgb } = require('pdf-lib');
function load(file, mocks = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8').replaceAll('import.meta.url', JSON.stringify(require('node:url').pathToFileURL(path.resolve(file)).href)), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, Buffer, process, AbortSignal, fetch, console,
    setTimeout, clearTimeout, URL, WebSocket: globalThis.WebSocket, require: name => mocks[name] || require(name) });
  return mod.exports;
}
(async () => {
  const raster = load('lib/raporEkRaster.ts', { '@/lib/raporEk': {} });
  // A visible form appearance is lost when only page content streams are copied.
  const fixture = await PDFDocument.create();
  const page = fixture.addPage([595, 842]);
  page.drawRectangle({ x: 25, y: 25, width: 80, height: 80, color: rgb(1, 0, 0) });
  const field = fixture.getForm().createTextField('visible_signature');
  field.setText('VISIBLE SIGNATURE');
  field.addToPage(page, { x: 100, y: 700, width: 300, height: 50 });
  const images = await raster.rasterizeAnnexPdf(Buffer.from(await fixture.save()));
  assert.equal(images.length, 1);
  assert.ok(images[0].width > 2400);
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  const image = await loadImage(images[0].dataUrl);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
  // Interior of the form widget (not its border) must contain signature text.
  const pixels = ctx.getImageData(450, 400, 1100, 120).data;
  let dark = 0;
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 100 && pixels[i + 1] < 100 && pixels[i + 2] < 100) dark++;
  assert.ok(dark > 500, `Missing widget appearance: ${dark} dark pixels`);
  const merge = load('lib/raporEkMerge.ts', { '@/lib/raporEk': {}, '@/lib/formatUtil': load('lib/formatUtil.ts') });
  const base = Buffer.from('template already contains raster annexes');
  assert.strictEqual(await merge.maybeMergeEk({}, base, 1, 'DigerEn'), base);
  assert.strictEqual(await merge.maybeMergeEk({}, base, 1, 'Diğer'), base);
  if (process.argv.includes('--pdf')) {
    const input = process.argv.find(arg => arg.startsWith('--source='));
    const annexPages = input ? await raster.rasterizeAnnexPdf(fs.readFileSync(input.slice(9))) : images;
    const Report = load('app/rapor-onay-print/[nkrId]/formats/DigerReport.tsx', {
      'next/font/google': { JetBrains_Mono: () => ({ variable: 'test-mono' }) },
      '@/app/fonts/reportFonts': { ttInterphases: { variable: 'test-body' } },
      '../OnayToolbar': { default: () => null, __esModule: true },
      '@/lib/disKod': { disRaporLabel: value => value },
    }).default;
    const markup = renderToStaticMarkup(React.createElement(Report, {
      nkrId: 1, format: 'DigerEn', hideToolbar: true, annexPages, onay: null, karekod: null,
      header: { RaporNo: 'ANNEX-TEST', Numune_Adi: 'Synthetic Sample', FirmaAd: 'Synthetic Customer' },
      hizmetler: [{ Ad: 'Synthetic analysis', AdEn: 'Synthetic analysis', Metot: 'ISO', Degerlendirme: 'Uygun' }],
      meta: { revNo: '0', kabulTarihi: '01.11.2026', yayinTarihi: '11.11.2026', hazirlayanAd: 'Test', sirketAdi: 'Test Lab' },
    }));
    let html = '<html><head><meta charset="utf-8"></head><body>' + markup + '</body></html>';
    // Use the same locally cached Google font as the live report.
    const cssFile = fs.readdirSync('.next/dev/static/chunks').find(name => name.includes('google_jetbrains_mono') && name.endsWith('.single.css'));
    let css = cssFile ? fs.readFileSync(path.join('.next/dev/static/chunks', cssFile), 'utf8') : '';
    css = css.replace(/url\("\.\.\/media\/([^"?]+)"\)/g, (_, name) => `url("data:font/woff2;base64,${fs.readFileSync(path.join('.next/dev/static/media', name)).toString('base64')}")`);
    css += '.test-mono { --font-rapor: "JetBrains Mono"; }';
    html = html.replace('</head>', `<style>${css}</style></head>`);
    html = html.replace(/(src|href)="\/([^"#]+)"/g, (all, attr, file) => fs.existsSync(path.join('public', file))
      ? `${attr}="data:image/${file.endsWith('.jpg') ? 'jpeg' : 'png'};base64,${fs.readFileSync(path.join('public', file)).toString('base64')}"` : all);
    const output = 'tmp/pdfs/annex-review/fixed-annex.pdf';
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const htmlPath = path.resolve(path.dirname(output), 'fixed-annex.html');
    fs.writeFileSync(htmlPath, html);
    const executable = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
    require('node:child_process').execFileSync(executable, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-extensions', '--disable-background-networking', '--no-first-run',
      `--user-data-dir=${path.resolve('.tmp/annex-qa-chrome')}`, '--no-pdf-header-footer',
      `--print-to-pdf=${path.resolve(output)}`, require('node:url').pathToFileURL(htmlPath).href,
    ], { windowsHide: true, timeout: 60000, stdio: 'pipe' });
    const pdf = fs.readFileSync(output);
    const doc = await PDFDocument.load(pdf);
    assert.equal(doc.getPageCount(), annexPages.length + 1, 'Annexes must appear exactly once, without blank pages');
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(pdf) });
    try {
      const text = await parser.getText();
      assert.equal((text.text.match(/CUSTOMER INFORMATION/g) || []).length, 1);
      assert.equal((text.text.match(/Annex-1/g) || []).length, annexPages.length + 1);
      assert.equal((text.text.match(/EXPERIMENTAL CONDITIONS/g) || []).length, 0, 'Source must be embedded as an image');
    } finally { await parser.destroy(); }
    console.log(`PDF: ${output} (${doc.getPageCount()} pages)`);
  }
  console.log('PASS: 300 dpi full-page raster, form/signature appearance, no duplicate annex merge.');
})().catch(error => { console.error(error); process.exitCode = 1; });
