// Exercise the actual Analyze button with mocked HTTP; no customer data or database.
require('./register-local-ts.cjs');
const fs = require('node:fs'), ts = require('typescript'), React = require('react'), assert = require('node:assert/strict');
const source = ts.transpileModule(fs.readFileSync('app/(dashboard)/ugd/urun-listesi/_components/UrunFormClient.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
function flatten(node) { if (!node || typeof node !== 'object') return []; if (typeof node.type === 'function') return flatten(node.type(node.props)); return [node, ...React.Children.toArray(node.props?.children).flatMap(flatten)]; }
function label(node) { return typeof node === 'string' ? node : React.Children.toArray(node?.props?.children).map(label).join(''); }
(async () => {
  const originalFetch = global.fetch;
  try {
    for (const failure of ['', 'match', 'save', 'timeout']) {
      let index = 0, states = [], phases = [], calls = [];
      const hooks = { ...React, useEffect() {}, useRef(initial) { return { current: initial }; }, useState(initial) {
        const i = index++, overrides = { 0: 'formul', 13: false, 15: 'AQUA\t99\nGLYCERIN\t1' };
        states[i] = i in overrides ? overrides[i] : initial;
        return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; if (i === 22) phases.push(states[i]); }];
      } };
      const mod = { exports: {} };
      new Function('require', 'module', 'exports', source)(name => name === 'react' ? hooks : name === 'next/navigation' ? { useRouter: () => ({}) } : name.endsWith('.css') ? { __esModule: true, default: {} } : require(name), mod, mod.exports);
      global.fetch = async (url, init) => {
        calls.push(url); assert(init.signal instanceof AbortSignal);
        if (failure === 'timeout') throw new DOMException('fixture timeout', 'TimeoutError');
        if (url.includes('/match')) return failure === 'match' ? Response.json({ error: 'fixture match failure' }, { status: 503 }) : Response.json([{ INCIName: 'AQUA', cosingId: 1, inputAmount: '99', noael: 0 }]);
        assert.equal(url, '/api/laboratuvar/ugdr/123/formul');
        return failure === 'save' ? Response.json({ error: 'fixture save failure' }, { status: 500 }) : Response.json({ count: 1 });
      };
      const nodes = flatten(mod.exports.default({ editId: '123', source: 'lab' }));
      const button = nodes.find(n => n.type === 'button' && label(n) === 'ANALİZİ BAŞLAT'); assert(button);
      button.props.onClick();
      button.props.onClick(); // Double clicks must not start a second lookup/save.
      for (let i = 0; i < 30 && states[17]; i++) await new Promise(resolve => setImmediate(resolve));
      assert.equal(states[17], false, 'Loading state must end after success/error/timeout');
      assert(phases.some(p => p.includes('eşleştiriliyor')));
      if (!failure) { assert.equal(calls.length, 2); assert(phases.some(p => p.includes('kaydediliyor'))); assert(phases.at(-1).includes('kaydedildi')); assert.equal(states[16][0].noael, '0'); }
      else { assert(states[18]); assert(!phases.at(-1).includes('kaydedildi')); }
    }
    console.log('PASS: Analyze stages, bounded fetches, successful auto-save and visible match/save/timeout failures. No external calls.');
  } finally { global.fetch = originalFetch; }
})().catch(error => { console.error(error); process.exitCode = 1; });
