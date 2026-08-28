import type mssql from "mssql";

// Stabilite rapor verisi (test × gün × sıcaklık matrisi + config) JSON olarak
// NKR_StabiliteVeri tablosunda saklanır. Her (NkrID, RaporFormati) için tek satır.
// Kolon tipleri ProformaBaslik ile aynı idiom (MySQL compat + MSSQL uyumlu).

type Pool = mssql.ConnectionPool;

// Tablo var mı? MySQL compat, "IF NOT EXISTS ... CREATE TABLE"'ı no-op'ladığı
// için tablo uygulamadan oluşturulamaz; canlıda manuel CREATE gerekir
// (scripts/create-stabilite-table.mjs). Bu yardımcı sadece varlığı kontrol eder.
export async function stabiliteTableExists(pool: Pool): Promise<boolean> {
  try {
    const r = await pool.request().query(
      `SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'NKR_StabiliteVeri'`,
    );
    return r.recordset.length > 0;
  } catch {
    return false;
  }
}

// Geriye uyum: eski adı koru (no-op — tablo manuel oluşturulur).
export async function ensureStabiliteTable(_pool: Pool): Promise<void> {
  /* MySQL'de CREATE TABLE uygulamadan yapılamıyor; manuel migration gerekir. */
}

// EN formatı (StabiliteEn) TR ile aynı veriyi paylaşır → base "Stabilite" altında sakla.
function baseFormat(format: string): string {
  const f = (format || "").trim();
  const normalized = f
    .replace(/İ/g, "I").replace(/ı/g, "i")
    .replace(/\s+/g, "")
    .toUpperCase();
  return normalized.endsWith("EN") && normalized.includes("STABILITE") ? "Stabilite" : f;
}

export async function getStabiliteVeriJson(
  pool: Pool,
  nkrId: number,
  format: string,
): Promise<string | null> {
  if (!(await stabiliteTableExists(pool))) return null; // tablo yoksa sessizce boş
  const r = await pool.request()
    .input("nkrId", nkrId)
    .input("format", baseFormat(format))
    .query(`
      SELECT TOP 1 VeriJson FROM NKR_StabiliteVeri
      WHERE NkrID = @nkrId
        AND UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U'))
      ORDER BY ID DESC
    `);
  const v = r.recordset[0]?.VeriJson;
  return v != null ? String(v) : null;
}

export async function saveStabiliteVeriJson(
  pool: Pool,
  nkrId: number,
  format: string,
  json: string,
): Promise<void> {
  if (!(await stabiliteTableExists(pool))) {
    throw new Error("NKR_StabiliteVeri tablosu yok. scripts/create-stabilite-table.mjs çalıştırılmalı.");
  }
  const bf = baseFormat(format);
  const ex = await pool.request()
    .input("nkrId", nkrId)
    .input("format", bf)
    .query(`
      SELECT TOP 1 ID FROM NKR_StabiliteVeri
      WHERE NkrID = @nkrId
        AND UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U'))
      ORDER BY ID DESC
    `);
  if (ex.recordset[0]?.ID != null) {
    await pool.request()
      .input("id", ex.recordset[0].ID)
      .input("json", json)
      .query(`UPDATE NKR_StabiliteVeri SET VeriJson = @json, UpdatedAt = GETDATE() WHERE ID = @id`);
  } else {
    await pool.request()
      .input("nkrId", nkrId)
      .input("format", bf)
      .input("json", json)
      .query(`INSERT INTO NKR_StabiliteVeri (NkrID, RaporFormati, VeriJson) VALUES (@nkrId, @format, @json)`);
  }
}
