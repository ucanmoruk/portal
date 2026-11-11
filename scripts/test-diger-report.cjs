/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => mocks[name] || require(name) });
  return module.exports;
}
const language = load('lib/raporFormatLanguage.ts');
assert.equal(language.englishReportFormat('Diğer'), 'DigerEn');
assert.equal(language.baseReportFormat('DigerEn'), 'Diğer');
assert.equal(language.expandReportFormats('Diğer', 'both').join(','), 'Diğer,DigerEn');
const Report = load('app/rapor-onay-print/[nkrId]/formats/DigerReport.tsx', {
  'next/font/google': { JetBrains_Mono: () => ({ variable: '' }) },
  '@/app/fonts/reportFonts': { ttInterphases: { variable: '' } },
  '../OnayToolbar': { default: () => null, __esModule: true },
  '@/lib/disKod': { disRaporLabel: value => value },
}).default;
const props = {
  nkrId: 1, format: 'Diğer', hideToolbar: true, onay: null, karekod: null,
  header: { RaporNo: 'TEST', Numune_Adi: 'Türkçe numune', Numune_Adi_En: 'English sample', FirmaAd: 'Synthetic Customer' },
  hizmetler: [{ Ad: 'Türkçe analiz', AdEn: 'English analysis', Metot: 'ISO', Degerlendirme: 'Uygun' }],
  meta: { revNo: '0', kabulTarihi: '01.11.2026', yayinTarihi: '11.11.2026', hazirlayanAd: 'Test', sirketAdi: 'Test Lab' },
};
const tr = renderToStaticMarkup(React.createElement(Report, props));
const en = renderToStaticMarkup(React.createElement(Report, { ...props, format: 'DigerEn' }));
assert.match(tr, /DENEY RAPORU/);
assert.match(tr, /Türkçe numune/);
for (const text of ['TEST REPORT', 'English sample', 'English analysis', 'See Annex-1', 'PASS', 'CUSTOMER INFORMATION', 'Laboratory Manager']) assert.ok(en.includes(text), text);
assert.ok(!en.includes('MÜŞTERİ BİLGİLERİ'));
assert.ok(!en.includes('<input'));
const changes = [];
const handlers = { onHeaderChange: value => changes.push(value), onRowChange: (index, value) => changes.push([index, value]), onAddRow() {}, onRemoveRow() {} };
const tree = Report({ ...props, format: 'DigerEn', edit: handlers });
function elements(node, result = []) {
  if (Array.isArray(node)) node.forEach(child => elements(child, result));
  else if (node && typeof node === 'object' && node.props) { result.push(node); elements(node.props.children, result); }
  return result;
}
const all = elements(tree);
all.find(node => node.type === 'input' && node.props.value === 'English sample').props.onChange({ target: { value: 'Edited sample' } });
all.find(node => node.type === 'input' && node.props.value === 'English analysis').props.onChange({ target: { value: 'Edited analysis' } });
assert.equal(changes[0].Numune_Adi_En, 'Edited sample');
assert.equal(changes[1][1].AdEn, 'Edited analysis');
assert.ok(all.some(node => node.type === 'textarea'));
assert.ok(all.some(node => node.type === 'select'));
console.log('PASS: Diğer TR/EN mapping, translated report, inline edits, English field isolation, read-only preview.');
