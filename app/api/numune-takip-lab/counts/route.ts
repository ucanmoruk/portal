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
    // case-insensitive: MySQL lower_case_table_names ayarına bağlı kalmadan eşleşsin
    const tables = new Set<string>(tblRes.recordset.map((r: { TABLE_NAME: string }) => String(r.TABLE_NAME).toLowerCase()));
    hasLabKabul  = tables.has("nkr_labkabul");
    hasRaporOnay = tables.has("nkr_raporonay");
    hasOverride  = tables.has("nkr_rapordurumoverride");
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
  // Sonuç Girişi içindeki format sekmelerine (Genel/Challenge/...) numune sayısı.
  // Anahtar: UPPER(REPLACE(RaporFormati, 'Ü', 'U')) — UI normalize'i ile birebir aynı.
  const byFormatLab: Record<string, number> = {};
  if (hasLabKabul) {
    try {
      const savedWhere = hasKayitTarihi
        ? "x.[SonucKayitTarihi] IS NOT NULL"
        : hasSonuc
        ? "x.Sonuc IS NOT NULL AND x.Sonuc != ''"
        : "1 = 0";

      const req = pool.request();
      // mssql.Request#timeout — bu sorgu özelinde 60s'e çek
      (req as unknown as { timeout?: number }).timeout = 60000;

      // PERFORMANCE: SQL Server CTE'leri inline edip kötü plan üretiyordu (sayma
      // 1-2 dk sürüyordu). Ara sonuçları #temp tablolara materialize ediyoruz
      // (rapor-takip listesiyle AYNI desen → tutarlı + hızlı).
      // Onay/Override eşleşmesi normalized (Ü→U) — liste route'uyla birebir aynı.
      const r = await req.query(`
        IF OBJECT_ID('tempdb..#Saved') IS NOT NULL DROP TABLE #Saved;
        IF OBJECT_ID('tempdb..#Acc')   IS NOT NULL DROP TABLE #Acc;
        IF OBJECT_ID('tempdb..#OS')    IS NOT NULL DROP TABLE #OS;
        IF OBJECT_ID('tempdb..#OV')    IS NOT NULL DROP TABLE #OV;

        SELECT x.RaporID AS NkrID, s.RaporFormati, COUNT(*) AS SavedCount
        INTO #Saved
        FROM NumuneX1 x
        INNER JOIN StokAnalizListesi s ON s.ID = x.AnalizID
          AND s.RaporFormati IS NOT NULL AND s.RaporFormati != ''
        WHERE ${savedWhere}
        GROUP BY x.RaporID, s.RaporFormati;

        SELECT DISTINCT n.ID AS NkrID, s.RaporFormati,
          UPPER(REPLACE(s.RaporFormati, N'Ü', N'U')) AS NormFmt
        INTO #Acc
        FROM NKR n
        INNER JOIN NumuneX1 x1 ON x1.RaporID = n.ID
        INNER JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
          AND s.RaporFormati IS NOT NULL AND s.RaporFormati != ''
        INNER JOIN NKR_LabKabul k ON k.NkrID = n.ID AND k.RaporFormati = s.RaporFormati
        WHERE n.Durum = 'Aktif';

        ${hasRaporOnay ? `SELECT ro.NkrID, UPPER(REPLACE(ro.RaporFormati, N'Ü', N'U')) AS NormFmt,
          MAX(ro.Durum) AS RaporOnayDurum
        INTO #OS FROM NKR_RaporOnay ro
        GROUP BY ro.NkrID, UPPER(REPLACE(ro.RaporFormati, N'Ü', N'U'));` : ``}

        ${hasOverride ? `SELECT o.NkrID, UPPER(REPLACE(o.RaporFormati, N'Ü', N'U')) AS NormFmt,
          MAX(o.Durum) AS OverrideDurum
        INTO #OV FROM NKR_RaporDurumOverride o
        GROUP BY o.NkrID, UPPER(REPLACE(o.RaporFormati, N'Ü', N'U'));` : ``}

        WITH WithStatus AS (
          SELECT ar.NkrID, ar.RaporFormati, ar.NormFmt,
            ${hasRaporOnay ? "os.RaporOnayDurum" : "NULL"} AS RaporOnayDurum,
            ${hasOverride ? "ov.OverrideDurum" : "NULL"}   AS OverrideDurum,
            COALESCE(sv.SavedCount, 0) AS SavedCount
          FROM #Acc ar
          ${hasRaporOnay ? `LEFT JOIN #OS os ON os.NkrID = ar.NkrID AND os.NormFmt = ar.NormFmt` : ``}
          ${hasOverride ? `LEFT JOIN #OV ov ON ov.NkrID = ar.NkrID AND ov.NormFmt = ar.NormFmt` : ``}
          LEFT JOIN #Saved sv ON sv.NkrID = ar.NkrID AND sv.RaporFormati = ar.RaporFormati
        ),
        Eff AS (
          SELECT NormFmt, COALESCE(
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
        SELECT EffDurum, NormFmt, COUNT(*) AS c FROM Eff GROUP BY EffDurum, NormFmt;

        DROP TABLE #Saved;
        DROP TABLE #Acc;
        ${hasRaporOnay ? `DROP TABLE #OS;` : ``}
        ${hasOverride ? `DROP TABLE #OV;` : ``}
      `);

      // Çok-statement batch: EffDurum içeren recordset'i seç (SELECT INTO/DROP
      // recordset döndürmez ama sürücü farkına karşı güvenli seçim).
      type Row = { EffDurum: string; NormFmt: string; c: number | string };
      const rsets = (r.recordsets as unknown as Array<Array<Row>>) || [];
      const effRows =
        rsets.find((rs) => rs && rs.length > 0 && "EffDurum" in rs[0]) ??
        (r.recordset as Array<Row>) ??
        [];

      const unknown: Array<{ d: string; c: number }> = [];
      for (const row of effRows) {
        const d = String(row.EffDurum || "");
        const fmt = String(row.NormFmt || "");
        const c = Number(row.c || 0);
        if (d === "Bekliyor" || d === "Analiz Devam Ediyor") {
          sonuc += c;
          // Sonuç Girişi format sekmesi rozetleri için biriktir
          byFormatLab[fmt] = (byFormatLab[fmt] || 0) + c;
        }
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

  const payload: Record<string, unknown> = { kabul, sonuc, geri, onay, byFormatLab };
  if (Object.keys(errors).length > 0) payload.errors = errors;
  return Response.json(payload);
}
