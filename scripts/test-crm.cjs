// Synthetic records only: no database, customer insert, or email connection.
require('./register-local-ts.cjs');
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), { randomUUID } = require('node:crypto');
const rules = require('../lib/crmRules.ts');
function compile(file, mocks) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => name in mocks ? mocks[name] : require(name), mod, mod.exports);
  return mod.exports;
}
class CrmError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
let rows = [], signedIn = true, authorized = true, customerAccess = true, failInsert = false, customerInserts = 0;
const db = { request() { const args = {}; return { input(key, value) { args[key] = value; return this; }, async query(sql) {
  if (sql.includes('INSERT INTO Firma')) { customerInserts++; if (failInsert) throw Error('ambiguous timeout'); return { recordset: [{ ID: 101 }] }; }
  if (sql.includes('SELECT TOP 1 ID')) return { recordset: [] };
  if (sql.includes('SELECT ID FROM Firma')) return { recordset: [{ ID: args.ID }] };
  return { recordset: [{ ID: args.ID || 5, Firma_Adi: 'Mevcut Müşteri', Mail: 'existing@example.com', Telefon: '555', Yetkili: 'Yetkili', Adres: '', Vergi_No: '' }] };
} }; } };
const store = { CrmError, async crmPool() { return db; }, async listCrmRecords() { return structuredClone(rows); },
  async insertCrmRecord(kind, data, by) { const record = { id: randomUUID(), kind, data: structuredClone(data), version: 1, updatedBy: by, updatedAt: new Date().toISOString() }; rows.push(record); return structuredClone(record); },
  async saveCrmRecord(record, data, by) { const index = rows.findIndex(r => r.id === record.id); if (rows[index].version !== record.version) throw new CrmError('conflict', 409); rows[index] = { ...record, data: structuredClone(data), deletedAt: data._deleted?.at, version: record.version + 1, updatedBy: by }; return structuredClone(rows[index]); }
};
const route = compile('app/api/crm/route.ts', { '@/lib/crmRules': rules, '@/lib/crmStore': store, '@/lib/portalYetki': { async getPortalUser() { return signedIn ? { userName: 'Test Kullanıcı', can: key => key === 'iletisim.crm' ? authorized : customerAccess } : null; } } });
const post = body => route.POST(new Request('https://portal.example/api/crm', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://portal.example' }, body: JSON.stringify(body) }));
async function ok(body) { const r = await post(body); assert.equal(r.status, 200, JSON.stringify(await r.clone().json())); return r.json(); }
(async () => {
  signedIn = false; assert.equal((await route.GET(new Request('https://portal.example/api/crm'))).status, 401);
  signedIn = true; authorized = false; assert.equal((await post({ action: 'list', name: 'Denied' })).status, 403); authorized = true;
  assert.equal((await route.POST(new Request('https://portal.example/api/crm', { method: 'POST', headers: { Origin: 'https://other.example' }, body: '{}' }))).status, 403);
  assert.equal((await post({ action: 'companies', companies: [{ name: '', email: 'invalid' }] })).status, 400);
  await ok({ action: 'list', name: 'Kozmetik', description: 'Test listesi' }); const listId = rows[0].id;
  await ok({ action: 'companies', listId, companies: [{ name: 'Aday Firma', email: 'lead@example.com' }, { name: 'Aday Firma', email: 'lead@example.com' }] });
  assert.equal(rows.filter(r => r.kind === 'company').length, 1); assert.equal(customerInserts, 0);
  let company = rows.find(r => r.kind === 'company'), list = rows.find(r => r.kind === 'list');
  assert.deepEqual(list.data.companyIds, [company.id]);
  await ok({ action: 'customers', listId, customerIds: [5] }); assert.equal(customerInserts, 0);
  customerAccess = false; assert.equal((await post({ action: 'customers', listId, customerIds: [5] })).status, 403); customerAccess = true;
  await ok({ action: 'template', name: 'Tanıtım', subject: '{{firma}} için hizmetler', body: 'Sayın {{yetkili}},\nMerhaba {{firma}}.' }); const template = rows.find(r => r.kind === 'template');
  await ok({ action: 'campaign', name: 'Kasım', listId, templateId: template.id }); let campaign = rows.find(r => r.kind === 'campaign');
  await ok({ action: 'template', id: template.id, version: 1, name: 'Yeni şablon', subject: 'Yeni konu', body: 'Yeni metin' });
  assert.equal(campaign.data.subject, '{{firma}} için hizmetler');
  list = rows.find(r => r.id === listId); await ok({ action: 'membership', id: listId, version: list.version, companyIds: [] });
  assert.equal(campaign.data.members.length, 2, 'campaign membership must remain stable');
  await ok({ action: 'activity', id: campaign.id, version: campaign.version, companyId: company.id, status: 'Tekrar aranacak', note: 'Pazartesi aranacak', nextContact: '2026-11-23' });
  assert.equal((await post({ action: 'activity', id: campaign.id, version: campaign.version, companyId: company.id, status: 'Görüşüldü', note: '', nextContact: '' })).status, 409);
  campaign = rows.find(r => r.kind === 'campaign'); assert.equal(campaign.data.members[0].history[0].by, 'Test Kullanıcı'); assert.equal(rules.campaignProgress(campaign.data).percent, 50);
  assert.equal(rules.renderCrmTemplate('{{firma}} / {{yetkili}}', company.data), 'Aday Firma / Yetkili');
  await ok({ action: 'convert', id: company.id, version: company.version }); company = rows.find(r => r.id === company.id); assert.equal(company.data.customerId, 101); assert.equal(customerInserts, 1);
  await ok({ action: 'convert', id: company.id, version: company.version }); assert.equal(customerInserts, 1);
  await ok({ action: 'companies', companies: [{ name: 'Belirsiz Firma' }] }); const uncertain = rows.find(r => r.kind === 'company' && r.data.name === 'Belirsiz Firma');
  failInsert = true; const log = console.error; console.error = () => {}; const failed = await post({ action: 'convert', id: uncertain.id, version: uncertain.version }); console.error = log; assert.equal(failed.status, 409);
  const locked = rows.find(r => r.id === uncertain.id); assert.equal(locked.data.conversion, 'Kontrol gerekli');
  assert.equal((await post({ action: 'convert', id: locked.id, version: locked.version })).status, 409); assert.equal(customerInserts, 2);
  await ok({ action: 'linkCustomer', id: locked.id, version: locked.version, customerId: 102 }); assert.equal(rows.find(r => r.id === locked.id).data.customerId, 102);
  assert.equal(rules.CompanyFields.parse({ name: 'Firma' }).permission, 'Belirtilmedi');
  const email = require('../lib/crmEmail.ts');
  const dangerous = '<h2>Analiz Hizmetleri</h2><p style="color:#123456" onclick="alert(1)">Sayın {{yetkili}}</p><img src="https://example.com/logo.png" onerror="alert(1)"><script>alert(1)</script><a href="jav&#x61;script:alert(1)">X</a><iframe src="https://evil.example"></iframe>';
  await ok({ action: 'template', name: 'HTML şablonu', subject: 'HTML testi', format: 'html', body: dangerous });
  const rich = rows.find(r => r.kind === 'template' && r.data.name === 'HTML şablonu');
  assert.equal(rich.data.format, 'html'); assert(rich.data.body.includes('Analiz Hizmetleri')); assert(rich.data.body.includes('color:#123456')); assert(!/script|onclick|onerror|iframe/i.test(rich.data.body));
  const personalized = email.renderCrmEmail('<p>{{firma}}</p><p>{{yetkili}}</p>', 'html', { ...company.data, name: '<img src=x onerror=alert(1)>', contact: '<script>X</script>' });
  assert(personalized.includes('&lt;img')); assert(!personalized.includes('<img')); assert(!personalized.includes('<script'));
  assert(email.renderCrmEmail('<b>plain</b>', 'text', company.data).includes('&lt;b&gt;'));
  assert(email.emailPreviewDocument(dangerous).includes("default-src 'none'"));
  assert.equal((await post({ action: 'template', name: 'Empty', subject: 'Test', body: '<script>alert(1)</script>', format: 'html' })).status, 400);
  // Soft deletion keeps source customers and campaign snapshots. Restore uses fresh versions.
  for (const kind of ['company', 'list', 'template', 'campaign']) {
    const target = rows.find(r => r.kind === kind && !r.deletedAt);
    const savedData = structuredClone(target.data), oldVersion = target.version;
    await ok({ action: 'delete', kind, id: target.id, version: target.version });
    const deleted = rows.find(r => r.id === target.id); assert(deleted.deletedAt); assert.equal(deleted.data._deleted.by, 'Test Kullanıcı');
    assert.equal((await post({ action: 'restore', kind, id: target.id, version: oldVersion })).status, 409);
    const listing = await (await route.GET(new Request('https://portal.example/api/crm'))).json();
    const key = { company: 'companies', list: 'lists', template: 'templates', campaign: 'campaigns' }[kind];
    assert(!listing[key].some(r => r.id === target.id)); assert(listing.deleted.some(r => r.id === target.id));
    await ok({ action: 'restore', kind, id: deleted.id, version: deleted.version });
    const restored = rows.find(r => r.id === target.id); assert(!restored.deletedAt); assert.deepEqual(restored.data, savedData);
  }
  const activeCompany = rows.find(r => r.kind === 'company' && !r.deletedAt);
  await ok({ action: 'delete', kind: 'company', id: activeCompany.id, version: activeCompany.version });
  const hiddenCompany = rows.find(r => r.id === activeCompany.id);
  await ok({ action: 'companies', companies: [rules.CompanyFields.parse(activeCompany.data)] });
  assert.equal((await post({ action: 'restore', kind: 'company', id: hiddenCompany.id, version: hiddenCompany.version })).status, 409);
  assert.equal(customerInserts, 2, 'CRM deletes must never delete or recreate customer records');
  const multi = rules.CompanyFields.parse({ name: 'Çoklu Adres', email: 'main@example.com', contact: 'Ana Yetkili', contacts: [{ email: 'buyer@example.com', name: 'Satın Alma Yetkilisi', role: 'Satın alma' }] });
  assert.equal(rules.crmCompanyContacts(multi).length, 2);
  assert.equal(rules.CompanyFields.safeParse({ ...multi, contacts: [{ email: 'MAIN@example.com' }] }).success, false);
  const legacy = rules.CompanyFields.parse({ name: 'Eski Firma', ...rules.crmLegacyContacts('First@Example.com; second@example.com, FIRST@example.com', 'Ana Kişi') });
  assert.equal(legacy.email, 'First@Example.com'); assert.equal(legacy.contacts.length, 1); assert.equal(legacy.contacts[0].name, '');
  assert.equal(rules.crmCompanyContacts({ ...multi, email: 'one@example.com;two@example.com', contacts: [] }).length, 2);
  assert(rules.companyDuplicate(multi, { ...legacy, name: 'Farklı firma', email: 'buyer@example.com' }));
  assert.equal(rules.CompanyFields.safeParse({ name: 'Hatalı', ...rules.crmLegacyContacts('good@example.com;not-an-email') }).success, false);
  console.log('PASS CRM: permissions, origin, input validation, deduplication, separate prospects, customer selection, list membership, template/campaign snapshots, activity history, optimistic concurrency, progress, conversion and ambiguous-insert protection. No real data or mail used.');
  console.log('PASS CRM extensions: all four soft-delete/restore kinds, stale restore conflict, duplicate restore protection, HTML sanitization, content validation, escaped personalization, legacy plain text and isolated preview CSP.');
})().catch(error => { console.error(error); process.exitCode = 1; });
