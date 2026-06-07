import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";

// GET /api/numune-takip-lab/counts
// Numune Takip ana tabları için kayıt sayıları:
// - kabul: NKR_LabKabul'da olmayan rapor formatları
// - sonuc: phase=lab kayıtlar (Bekliyor + Analiz Devam Ediyor)
// - geri:  phase=returned (Geri Gönderildi)
// - onay:  phase=approval  (Onay Bekleniyor) — Onaylandı/Yayınlandı SAYILMAZ
//
// Her bucket bağımsız try/catch'te — biri patlasa diğerleri yine doğru sayıyı
// döner. Hatalar response.errors içinde + console.error ile loglanır.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  const pool = await cosmoPool.then(p => p, (err) => {
    console.error("counts: cosmoPool bağlanamadı:", err);
    return null;
  });
  if (!pool) {
    return Response.json({ kabul: 0, sonuc: 0, geri: 0, onay: 0, errors: { pool: "cosmoPool bağlantı hatası" } }, { status: 500 });
  }

  // Tablo / kolon varlık kontrolleri — yoksa graceful fallback
  const errors: Record<string, string> = {};
  let hasLabKabul = false, hasRaporOnay = false, hasOverride = false;
  try {
    const tblRes = await pool.request().query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA IN ('dbo','cosmoroot')
         AND TABLE_NAME IN ('NKR_LabKabul', 'NKR_RaporOnay', 'NKR_RaporDurumOverride')`
    );
    const tables = new Set<string>(tblRes.recordset.map((r: { TABLE_NAME: string }) => r.TABLE_NAME));
    hasLabKabul  = tables.has("NKR_LabKabul");
    hasRaporOnay = tables.has("NKR_RaporOnay");
    hasOverride  = tables.has("NKR_RaporDurumOverride");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Hata";
    console.error("counts: tablo varlık kontrolü hata:", e);
    errors.tables = msg;
  }

  let hasKayitTarihi = false, hasSonuc = false;
  try {
    const r = await pool.request().query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME = 'NumuneX1' AND COLUMN_NAME IN ('SonucKayitTarihi','Sonuc')`
    );
    const cols = new Set<string>(r.recordset.map((x: { COLUMN_NAME: string }) => x.COLUMN_NAME));
    hasKayitTarihi = cols.has("SonucKayitTarihi");
    hasSonuc = cols.has("Sonuc");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Hata";
    console.error("counts: kolon varlık kontrolü hata:", e);
    errors.columns = msg;
  }

  // ── Kabul Bekleyenler ──
  let kabul = 0;
  try {
    const sql = hasLabKabul
      ? `SELECT COUNT(*) AS c FROM (
           SELECT DISTINCT n.ID AS NkrID, s.RaporFormati
           FROM NKR n
           INNER JOIN NumuneX1 x1 ON x1.RaporID = n.ID
           INNER JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
             AND s.RaporFormati IS NOT NULL AND s.RaporFormati != ''
           LEFT JOIN NKR_LabKabul k ON k.NkrID = n.ID AND k.RaporFormati = s.RaporFormati
           WHERE n.Durum = 'Aktif' AND k.ID IS NULL
         ) t`
      : `SELECT COUNT(*) AS c FROM (
           SELECT DISTINCT n.ID AS NkrID, s.RaporFormati
           FROM NKR n
           INNER JOIN NumuneX1 x1 ON x1.RaporID = n.ID
           INNER JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
             AND s.RaporFormati IS NOT NULL AND s.RaporFormati != ''
           WHERE n.Durum = 'Aktif'
         ) t`;
    const req = pool.request();
    (req as unknown as { timeout?: number }).timeout = 60000;
    const r = await req.query(sql);
    kabul = Number(r.recordset[0]?.c ?? 0);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Hata";
    console.error("counts.kabul sorgu hatası:", e);
    errors.kabul = msg;
  }

  // ── Sonuç / Geri / Onay (kabul edilmiş kayıtlar için EffectiveDurum) ──
  // EffectiveDurum: NKR_RaporOnay > Override > otomatik (saved sayısına göre).
  // PERFORMANCE: Önceki sürüm her satır için 3 correlated subquery çalıştırıyordu
  // (toplam ~25K subquery × 8K satır). 15s timeout'a takılıyordu. Şimdi:
  //   1) Saved CTE: tek GROUP BY ile per-(NkrID, RaporFormati) saved count
  //   2) AcceptedReports CTE: tek DISTINCT
  //   3) WithStatus: 3 basit LEFT JOIN (her biri 1:1, UNIQUE constraint sayesinde)
  //   4) Final GROUP BY EffDurum
  let sonuc = 0, geri = 0, onay = 0;
  if (hasLabKabul) {
    try {
      const savedWhere = hasKayitTarihi
        ? "x.[SonucKayitTarihi] IS NOT NULL"
        : hasSonuc
        ? "x.Sonuc IS NOT NULL AND x.Sonuc != ''"
        : "1 = 0";

      const onayJoin  = hasRaporOnay
        ? `LEFT JOIN NKR_RaporOnay ro ON ro.NkrID = ar.NkrID AND ro.RaporFormati = ar.RaporFormati`
        : "";
      const onayCol   = hasRaporOnay ? "ro.Durum" : "NULL";
      const ovJoin    = hasOverride
        ? `LEFT JOIN NKR_RaporDurumOverride ov ON ov.NkrID = ar.NkrID AND ov.RaporFormati = ar.RaporFormati`
        : "";
      const ovCol     = hasOverride ? "ov.Durum" : "NULL";

      const req = pool.request();
      // mssql.Request#timeout — bu sorgu özelinde 60s'e çek
      (req as unknown as { timeout?: number }).timeout = 60000;

      const r = await req.query(`
        WITH Saved AS (
          SELECT x.RaporID AS NkrID, s.RaporFormati, COUNT(*) AS SavedCount
          FROM NumuneX1 x
          INNER JOIN StokAnalizListesi s ON s.ID = x.AnalizID
            AND s.RaporFormati IS NOT NULL AND s.RaporFormati != ''
          WHERE ${savedWhere}
          GROUP BY x.RaporID, s.RaporFormati
        ),
        AcceptedReports AS (
          SELECT DISTINCT n.ID AS NkrID, s.RaporFormati
          FROM NKR n
          INNER JOIN NumuneX1 x1 ON x1.RaporID = n.ID
          INNER JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
            AND s.RaporFormati IS NOT NULL AND s.RaporFormati != ''
          INNER JOIN NKR_LabKabul k ON k.NkrID = n.ID AND k.RaporFormati = s.RaporFormati
          WHERE n.Durum = 'Aktif'
        ),
        WithStatus AS (
          SELECT ar.NkrID, ar.RaporFormati,
            ${onayCol} AS RaporOnayDurum,
            ${ovCol}   AS OverrideDurum,
            COALESCE(sv.SavedCount, 0) AS SavedCount
          FROM AcceptedReports ar
          ${onayJoin}
          ${ovJoin}
          LEFT JOIN Saved sv ON sv.NkrID = ar.NkrID AND sv.RaporFormati = ar.RaporFormati
        ),
        Eff AS (
          SELECT COALESCE(
            RaporOnayDurum,
            CASE
              WHEN OverrideDurum IN (N'Tamamlandı', N'Tamamlandi') THEN N'Onay Bekleniyor'
              WHEN OverrideDurum = N'Devam Ediyor' THEN N'Analiz Devam Ediyor'
              ELSE OverrideDurum
            END,
            CASE WHEN SavedCount > 0 THEN N'Analiz Devam Ediyor' ELSE N'Bekliyor' END
          ) AS EffDurum
          FROM WithStatus
        )
        SELECT EffDurum, COUNT(*) AS c FROM Eff GROUP BY EffDurum
      `);

      const unknown: Array<{ d: string; c: number }> = [];
      for (const row of r.recordset as Array<{ EffDurum: string; c: number | string }>) {
        const d = String(row.EffDurum || "");
        const c = Number(row.c || 0);
        if (d === "Bekliyor" || d === "Analiz Devam Ediyor") sonuc += c;
        else if (d === "Geri Gönderildi") geri += c;
        else if (d === "Onay Bekleniyor")  onay += c;
        else if (d === "Onaylandı" || d === "Yayınlandı") { /* görmezden gel */ }
        else unknown.push({ d, c });
      }
      if (unknown.length > 0) {
        console.warn("counts: bilinmeyen EffDurum (bucket'a girmedi):", unknown);
        errors.unknownEffDurum = JSON.stringify(unknown);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Hata";
      console.error("counts.sonuc sorgu hatası:", e);
      errors.sonuc = msg;
    }
  }

  const payload: Record<string, unknown> = { kabul, sonuc, geri, onay };
  if (Object.keys(errors).length > 0) payload.errors = errors;
  return Response.json(payload);
}
