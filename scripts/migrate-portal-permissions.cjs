/* eslint-disable @typescript-eslint/no-require-imports */
require('./register-local-ts.cjs');
const { default: legacyPool } = require('../lib/db.ts');
const { hasMysqlConfig } = require('../lib/mysqlCompat.ts');
const { getPermissionPool } = require('../lib/permissionStore.ts');

async function main() {
  if (!hasMysqlConfig()) throw new Error('MySQL configuration is required.');
  // Read the source before touching the target; existing MySQL assignments win.
  const source = await legacyPool;
  const { recordset } = await source.request().query('SELECT KullaniciID, MenuKey, Yetki FROM PortalYetki');
  const target = await getPermissionPool();
  const tx = await target.transaction();
  await tx.begin();
  try {
    for (const row of recordset) {
      await tx.request()
        .input('userId', row.KullaniciID)
        .input('menuKey', row.MenuKey)
        .input('level', row.Yetki === 'view' ? 'view' : 'edit')
        .query('INSERT IGNORE INTO PortalYetki (KullaniciID, MenuKey, Yetki) VALUES (@userId, @menuKey, @level)');
    }
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
  console.log(`Read ${recordset.length} legacy permissions; existing MySQL permissions preserved.`);
}

main().then(() => process.exit(0)).catch(error => {
  console.error(error.message);
  process.exit(1);
});
