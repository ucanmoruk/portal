require('./register-local-ts.cjs');
const assert = require('node:assert/strict');
let status, exists = true, writes = 0;
const pool = { request() { return { input() { return this; }, async query(sql) {
  if (/UPDATE TeklifBaslik/.test(sql)) {
    // Exercise the nullable draft and legacy-status SQL contract.
    assert.match(sql, /TeklifDurum IS NULL/);
    assert.match(sql, /LTRIM\(RTRIM\(TeklifDurum\)\)/);
    assert.match(sql, /N'Gönderildi'/);
    if (exists && (status == null || ['', 'Taslak', 'Gönderildi'].includes(status.trim()))) status = 'Onay Bekleniyor';
    writes++;
  }
  if (/SELECT TeklifNo/.test(sql)) return { recordset: exists ? [{ TeklifNo: 123, RevNo: 0, TeklifDurum: status }] : [] };
  return { recordset: [] };
} }; } };
require.cache[require.resolve('next-auth')] = { exports: { getServerSession: async () => ({ user: { name: 'Test' } }) } };
require.cache[require.resolve('../lib/auth.ts')] = { exports: { authOptions: {} } };
require.cache[require.resolve('../lib/db.ts')] = { exports: { cosmoPool: Promise.resolve(pool) } };
require.cache[require.resolve('../lib/teklifLog.ts')] = { exports: { clientIpFromRequest: () => 'test' } };
const { POST } = require('../app/api/teklifler/[id]/portal-gonder/route.ts');
const send = (id = '123') => POST(new Request('http://localhost/api/teklifler/123/portal-gonder', { method: 'POST' }), { params: Promise.resolve({ id }) });
(async () => {
  for (const initial of [null, '', '  ', 'Taslak', ' Taslak ', 'Gönderildi', 'Onay Bekleniyor', 'Onaylandı', 'Reddedildi']) {
    status = initial;
    const response = await send();
    assert.equal(response.status, 200);
    const expected = ['Onaylandı', 'Reddedildi'].includes(initial) ? initial : 'Onay Bekleniyor';
    assert.equal((await response.json()).teklifDurum, expected);
    assert.equal(status, expected);
    assert.equal((await (await send()).json()).teklifDurum, expected);
  }
  exists = false;
  assert.equal((await send()).status, 404);
  const previousWrites = writes;
  assert.equal((await send('invalid')).status, 400);
  assert.equal(writes, previousWrites);
  console.log('PASS: null/empty/draft/legacy publish, final-status preservation, repeat send, missing/invalid IDs');
})().catch(error => { console.error(error); process.exitCode = 1; });
