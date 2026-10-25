import poolPromise, { rootPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";

let schemaReady: Promise<void> | undefined;

export async function getPermissionPool() {
  if (!hasMysqlConfig()) return await poolPromise;

  const pool = await rootPool;
  schemaReady ??= pool.request().query(`
    CREATE TABLE IF NOT EXISTS PortalYetki (
      KullaniciID INT NOT NULL,
      MenuKey VARCHAR(191) NOT NULL,
      Yetki VARCHAR(10) NOT NULL DEFAULT 'edit',
      PRIMARY KEY (KullaniciID, MenuKey)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci
  `).then(() => {}).catch((error: unknown) => {
    schemaReady = undefined;
    throw error;
  });
  await schemaReady;
  return pool;
}
