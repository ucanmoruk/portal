const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
let user = null;
let saved = null;
const mod = { exports: {} };
const imports = {
  '@/lib/portalYetki': { getPortalUser: async () => user },
  '@/lib/kysDokumanYetki': { dokumanYetkileri: u => ({ duzenle: u.edit }) },
  '@/lib/kysDokumanStore': { saveKysDokumanDosya: async (...args) => { saved = args; } },
  'node:path': require('node:path'),
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/kys/dokumanlar/[id]/dosya/route.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText, { module: mod, exports: mod.exports, require: name => imports[name], Response, File, Buffer });
const context = { params: Promise.resolve({ id: '68' }) };
function request(name, data = 'replacement') {
  const form = new FormData();
  if (name) form.set('file', new File([data], name));
  return new Request('https://example.test/api/kys/dokumanlar/68/dosya', { method: 'PUT', body: form });
}
(async () => {
  assert.equal((await mod.exports.PUT(request('new.pdf'), context)).status, 401);
  user = { edit: false };
  assert.equal((await mod.exports.PUT(request('new.pdf'), context)).status, 403);
  user = { edit: true, userId: 1, userName: 'Editor' };
  for (const req of [request(), request('new.exe'), request('new.pdf', ''), request('new.pdf', new Uint8Array(20 * 1024 * 1024 + 1))]) {
    assert.equal((await mod.exports.PUT(req, context)).status, 400);
    assert.equal(saved, null);
  }
  assert.equal((await mod.exports.PUT(request('new.PDF'), context)).status, 200);
  assert.equal(saved[0], 68);
  assert.equal(saved[1].type, 'application/pdf');
  assert.equal(saved[1].buffer.toString(), 'replacement');
  console.log('PASS: replacement permission, missing/empty/invalid/oversized files, and uploaded bytes.');
})().catch(error => { console.error(error); process.exitCode = 1; });
