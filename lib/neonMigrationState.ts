import mysql from "mysql2/promise";
import { hasMysqlConfig } from "./mysqlCompat";

let pool: mysql.Pool | undefined;
let productionCheckin = 0;
export function migrationMysqlPool() {
  if (!hasMysqlConfig()) throw new Error("Neon taşıması için MySQL yapılandırması gerekli.");
  return pool ??= mysql.createPool({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE, connectionLimit: 3, dateStrings: true,
    supportBigNumbers: true, bigNumberStrings: true, charset: "utf8mb4_bin", timezone: "Z" });
}

/** No cached backend or fallback: after cutover an unavailable MySQL must never send writes back to Neon. */
export async function isNeonMigrated(): Promise<boolean> {
  if (!hasMysqlConfig()) return false;
  // Local verification of the isolated copy never changes the production routing flag.
  if (process.env.NODE_ENV === "development" && process.env.NEON_MYSQL_VERIFY === "1") return true;
  const db = migrationMysqlPool();
  let rows: mysql.RowDataPacket[];
  try {
    [rows] = await db.query<mysql.RowDataPacket[]>("SELECT Backend FROM NeonMigrationControl WHERE ID=1");
  } catch (error) {
    if ((error as { code?: string }).code === "ER_NO_SUCH_TABLE") return false;
    throw error;
  }
  if (process.env.NODE_ENV === "production" && Date.now() - productionCheckin > 15000) {
    await db.query("UPDATE NeonMigrationControl SET RuntimeVersion=2,ProductionSeenAt=UTC_TIMESTAMP(6) WHERE ID=1");
    productionCheckin = Date.now();
  }
  return rows[0]?.Backend === "mysql";
}

export async function waitForNeonCutover() {
  for (let i=0;i<120;i++) {
    if (await isNeonMigrated()) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error("Veritabanı geçişi sürüyor; işlemi tekrar deneyin.");
}
