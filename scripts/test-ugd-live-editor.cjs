// Exercise the real editor buttons with fake DOM/HTTP. Never reads or changes a report.
require('./register-local-ts.cjs');
const fs = require('node:fs'), ts = require('typescript'), React = require('react'), assert = require('node:assert/strict');
let index = 0, refIndex = 0, states = [], calls = [], fail = true;
const editor = { innerHTML: '<table><tr><th>COMPONENT</th><th>SED</th></tr><tr><td>MANUAL_EDIT</td><td>77.5</td></tr></table>' };
const hooks = { ...React, useEffect() {}, useRef(initial) { const i = refIndex++; return { current: i === 0 ? { 's1-0': editor } : initial }; }, useState(initial) {
  const i = index++;
  const overrides = { 0: 'canli-rapor', 2: '<style>table{color:black}</style>', 3: [{ key: 's1', title: 'Test', html: '<p>OLD_STATE</p>' }], 13: false, 14: 'en' };
  states[i] = i in overrides ? overrides[i] : initial;
  return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
} };
const file = 'app/(dashboard)/ugd/urun-listesi/_components/UrunFormClient.tsx';
const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', source)(name => name === 'react' ? hooks : name === 'next/navigation' ? { useRouter: () => ({ back() {} }) } : name.endsWith('.css') ? { __esModule: true, default: {} } : require(name), mod, mod.exports);
function flatten(node) {
  if (!node || typeof node !== 'object') return [];
  if (typeof node.type === 'function') return flatten(node.type(node.props));
  return [node, ...React.Children.toArray(node.props?.children).flatMap(flatten)];
}
function label(node) { return typeof node === 'string' ? node : React.Children.toArray(node?.props?.children).map(label).join(''); }
(async () => {
  const original = { fetch: global.fetch, window: global.window, setTimeout: global.setTimeout };
  global.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    if (url === '/api/urunler/canli-rapor') return Response.json(fail ? { error: 'fixture save failed' } : { ok: true }, { status: fail ? 500 : 200 });
    if (url.includes('rapor-sablon')) return new Response('%PDF-fixture', { headers: { 'content-type': 'application/pdf' } });
    throw new Error('The live-editor Save button must not rewrite product/formula data');
  };
  global.window = { open: () => ({ document: { write() {}, close() {}, open() {} }, location: {}, closed: false }) };
  global.setTimeout = () => 0;
  try {
    const nodes = flatten(mod.exports.default({ editId: '123', source: 'lab' }));
    const save = nodes.find(n => n.type === 'button' && label(n) === 'RAPORU KAYDET');
    const print = nodes.find(n => n.type === 'button' && label(n) === 'Yazdır');
    assert(save && print);
    await save.props.onClick(); assert.equal(calls.length, 1); assert(states.includes('fixture save failed')); assert(!states.some(v => typeof v === 'string' && v.startsWith('Kaydedildi:')));
    fail = false; await save.props.onClick(); assert.equal(calls.length, 2);
    assert.equal(calls[1].body.sections[0].html, editor.innerHTML); assert(!('bodyHtml' in calls[1].body));
    assert(states.some(v => typeof v === 'string' && v.startsWith('Kaydedildi:')));
    await save.props.onClick(); assert.equal(calls.length, 2, 'Unchanged HTML must not be saved twice');
    await print.props.onClick(); assert.equal(calls.length, 3); assert(calls[2].body.editedHtml.includes('MANUAL_EDIT')); assert(calls[2].body.editedHtml.includes('77.5')); assert.equal(calls[2].body.language, 'en');
    editor.innerHTML = '<p>NEWER_EDIT_88</p>'; await print.props.onClick();
    assert.equal(calls.length, 5); assert(calls[4].body.editedHtml.includes('NEWER_EDIT_88')); assert.equal(calls[3].url, '/api/urunler/canli-rapor');
    console.log('PASS: bottom Save targets the live report, DOM edits survive save/print, failures are visible, unchanged saves are skipped and EN print uses edited HTML. No external calls.');
  } finally { Object.assign(global, original); }
})().catch(error => { console.error(error); process.exitCode = 1; });
