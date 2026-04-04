import type { ConnectionPool } from "mssql";

/** Process ömrü için önbellek */
const cache = new Map<string, boolean>();
const nkrColumnCache = new Map<string, boolean>();

/** NKR tablosunda sütun var mı (eski DB’lerde migration uygulanmamış olabilir). */
export async function nkrHasColumn(pool: ConnectionPool, columnName: string): Promise<boolean> {
  if (nkrColumnCache.has(columnName)) return nkrColumnCache.get(columnName)!;
  const r = await pool.request().input("c", columnName).query(`
    SELECT 1 AS x FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = N'NKR' AND COLUMN_NAME = @c
  `);
  const ok = r.recordset.length > 0;
  nkrColumnCache.set(columnName, ok);
  return ok;
}

async function tableExists(pool: ConnectionPool, tableName: "NKR_Formul" | "NKR_Log"): Promise<boolean> {
  if (cache.has(tableName)) return cache.get(tableName)!;

  const r = await pool.request().query(`
    SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME = N'${tableName}'
  `);
  const ok = r.recordset.length > 0;
  cache.set(tableName, ok);
  return ok;
}

export async function hasNkrFormulTable(pool: ConnectionPool): Promise<boolean> {
  return tableExists(pool, "NKR_Formul");
}

export async function hasNkrLogTable(pool: ConnectionPool): Promise<boolean> {
  return tableExists(pool, "NKR_Log");
}

export function clearNumuneFormTableCache() {
  cache.clear();
  nkrColumnCache.clear();
}
