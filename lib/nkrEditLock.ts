export interface NkrEditLock {
  locked: boolean;
  durum: string | null;
  raporFormati: string | null;
}

const LOCKED_RAPOR_DURUMLARI = ["Onaylandı", "Yayınlandı", "Arşiv"] as const;

export async function getNkrEditLock(pool: any, nkrId: number): Promise<NkrEditLock> {
  const tableCheck = await pool.request().query(`
    SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME = 'NKR_RaporOnay' AND TABLE_SCHEMA IN ('dbo', 'cosmoroot')
  `);
  if (tableCheck.recordset.length === 0) {
    return { locked: false, durum: null, raporFormati: null };
  }

  const result = await pool.request()
    .input("nkrId", nkrId)
    .query(`
      SELECT TOP 1 RaporFormati, Durum
      FROM NKR_RaporOnay
      WHERE NkrID = @nkrId
        AND Durum IN (N'Onaylandı', N'Yayınlandı', N'Arşiv')
      ORDER BY
        CASE Durum
          WHEN N'Yayınlandı' THEN 1
          WHEN N'Onaylandı' THEN 2
          WHEN N'Arşiv' THEN 3
          ELSE 9
        END,
        ID DESC
    `);

  const row = result.recordset[0];
  if (!row) return { locked: false, durum: null, raporFormati: null };
  const durum = row.Durum == null ? null : String(row.Durum);
  return {
    locked: durum ? LOCKED_RAPOR_DURUMLARI.includes(durum as (typeof LOCKED_RAPOR_DURUMLARI)[number]) : false,
    durum,
    raporFormati: row.RaporFormati ?? null,
  };
}
