import type { ConnectionPool } from "mssql";

/**
 * NKR → rUGDTip FK sütunu: önce UGDTip_ID (portal migrasyonu), yoksa Tip2 (eski şemalar).
 * Sonuç process ömrü boyunca önbelleğe alınır.
 */
let cached: "UGDTip_ID" | "Tip2" | null | undefined;

export async function nkrUgdTipFkColumn(pool: ConnectionPool): Promise<"UGDTip_ID" | "Tip2" | null> {
  if (cached !== undefined) return cached;

  const r = await pool.request().query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = N'NKR'
      AND COLUMN_NAME IN (N'UGDTip_ID', N'Tip2')
  `);

  const names = new Set(
    (r.recordset as { COLUMN_NAME: string }[]).map(x => x.COLUMN_NAME)
  );

  if (names.has("UGDTip_ID")) cached = "UGDTip_ID";
  else if (names.has("Tip2")) cached = "Tip2";
  else cached = null;

  return cached;
}

export function clearNkrUgdTipFkColumnCache() {
  cached = undefined;
}
