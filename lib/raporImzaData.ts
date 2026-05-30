import type { ConnectionPool } from "mssql";
import type { ImzaPayloadInput } from "./raporImza";
import { signRapor, imzaSurum } from "./raporImza";

// İmza hesabı için gerekli rapor içeriğini DB'den okur.
// Hem onay (imza atma) hem doğrulama (imza kontrol) tarafında AYNI sorgu
// kullanıldığı için imza tutarlılığı garanti edilir.
export async function loadImzaInput(
  pool: ConnectionPool,
  nkrId: number,
  format: string,
): Promise<ImzaPayloadInput | null> {
  const hdr = await pool.request()
    .input("id", nkrId)
    .query(`
      SELECT
        n.RaporNo,
        n.Numune_Adi,
        CONVERT(varchar(10), n.Tarih, 23) AS Tarih,
        ISNULL(f.Ad, '') AS FirmaAd
      FROM NKR n
      LEFT JOIN RootTedarikci f ON f.ID = n.Firma_ID
      WHERE n.ID = @id
    `);
  const h = hdr.recordset[0];
  if (!h) return null;

  const hz = await pool.request()
    .input("nkrId", nkrId)
    .input("format", format)
    .query(`
      SELECT
        ISNULL(s.Kod, '') AS Kod,
        x1.Sonuc,
        x1.Degerlendirme,
        ISNULL(x1.Birim, ISNULL(s.Matriks, '')) AS Birim,
        x1.[Limit] AS LimitDeger
      FROM NumuneX1 x1
      INNER JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
      WHERE x1.RaporID = @nkrId
        AND s.RaporFormati = @format
      ORDER BY s.Kod
    `);

  return {
    nkrId,
    raporNo: String(h.RaporNo ?? ""),
    format,
    numuneAdi: String(h.Numune_Adi ?? ""),
    firmaAd: String(h.FirmaAd ?? ""),
    raporTarihi: h.Tarih ? String(h.Tarih) : null,
    hizmetler: hz.recordset.map((r: any) => ({
      Kod: r.Kod,
      Sonuc: r.Sonuc,
      Degerlendirme: r.Degerlendirme,
      Birim: r.Birim,
      LimitDeger: r.LimitDeger,
    })),
  };
}

// Rapor içeriğini imzalayıp NKR_RaporOnay.ImzaHash'e yazar. Hash döner (yoksa null).
//   - Migration 009 çalışmamışsa (sütun yoksa) sessizce atlanır.
//   - Satır zaten imzalıysa dokunmaz (tampered içeriği yeniden mühürlemeyi önler).
// Hem onay endpoint'i hem rapor önizleme (self-heal) tarafından kullanılır.
export async function imzalaVeKaydet(
  pool: ConnectionPool,
  onayID: number | undefined | null,
  nkrId: number,
  format: string,
): Promise<string | null> {
  try {
    if (!onayID || !(await imzaColumnExists(pool))) return null;
    const mevcut = await pool.request()
      .input("id", onayID)
      .query(`SELECT ImzaHash FROM NKR_RaporOnay WHERE ID = @id`);
    const eski = mevcut.recordset[0]?.ImzaHash;
    if (eski) return String(eski);

    const imzaInput = await loadImzaInput(pool, nkrId, format);
    if (!imzaInput) return null;
    const hash = signRapor(imzaInput);
    await pool.request()
      .input("id", onayID)
      .input("hash", hash)
      .input("surum", imzaSurum())
      .query(`
        UPDATE NKR_RaporOnay
        SET ImzaHash = @hash, ImzaTarihi = GETDATE(), ImzaSurum = @surum
        WHERE ID = @id
      `);
    return hash;
  } catch {
    // İmza opsiyonel güvenlik katmanı — atılamazsa onay yine geçerli.
    return null;
  }
}

// NKR_RaporOnay tablosunda imza sütunları var mı? (migration 009 çalıştı mı?)
// INFORMATION_SCHEMA kullanılır — hem MSSQL hem Postgres uyumlu katmanda çalışır.
// (COL_LENGTH SQL Server'a özeldir, Postgres'te hata fırlatır.)
export async function imzaColumnExists(pool: ConnectionPool): Promise<boolean> {
  const r = await pool.request().query(
    `SELECT 1 AS c FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_NAME = 'NKR_RaporOnay' AND COLUMN_NAME = 'ImzaHash'
       AND TABLE_SCHEMA IN ('dbo', 'cosmoroot')`
  );
  return r.recordset.length > 0;
}
