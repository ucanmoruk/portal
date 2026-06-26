// ProformaBaslik.FaturaFirmaID kolonu opsiyonel: rapor firması (FirmaID) ile
// fatura firması farklı olabilsin diye eklendi. Kolon canlıya ALTER TABLE ile
// gelir (mysqlCompat ALTER'ı no-op'lar → uygulamadan oluşturulamaz). Kolon
// yoksa kod graceful degrade eder: fatura, rapor firmasına kesilir.
//
// INFORMATION_SCHEMA sorgusu hem MSSQL (dbo) hem MySQL (translateInfoSchema →
// TABLE_SCHEMA = DATABASE()) tarafında çalışır.
export async function hasProformaFaturaFirmaCol(pool: any): Promise<boolean> {
  try {
    const r = await pool.request().query(`
      SELECT 1 AS x FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'ProformaBaslik' AND COLUMN_NAME = 'FaturaFirmaID'
        AND TABLE_SCHEMA IN ('dbo', 'cosmoroot')
    `);
    return r.recordset.length > 0;
  } catch {
    return false;
  }
}
