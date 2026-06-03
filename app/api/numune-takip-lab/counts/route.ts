import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";

// GET /api/numune-takip-lab/counts
// Numune Takip ana tabları için kayıt sayıları:
// - kabul: NKR_LabKabul'da olmayan rapor formatları
// - sonuc: phase=lab kayıtlar (Bekliyor + Analiz Devam Ediyor + Onay Bekleniyor)
// - geri:  phase=returned (Geri Gönderildi)
// - onay:  phase=approval  (Onay Bekleniyor) — Onaylandı/Yayınlandı SAYILMAZ
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  try {
    const pool = await cosmoPool;

    const tblRes = await pool.request().query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA IN ('dbo','cosmoroot')
         AND TABLE_NAME IN ('NKR_LabKabul', 'NKR_RaporOnay', 'NKR_RaporDurumOverride')`
    );
    const tables = new Set<string>(tblRes.recordset.map((r: { TABLE_NAME: string }) => r.TABLE_NAME));
    const hasLabKabul   = tables.has("NKR_LabKabul");
    const hasRaporOnay  = tables.has("NKR_RaporOnay");
    const hasOverride   = tables.has("NKR_RaporDurumOverride");

    // ── Kabul Bekleyenler ──
    let kabul = 0;
    if (hasLabKabul) {
      const r = await pool.request().query(`
        SELECT COUNT(DISTINCT CONCAT(n.ID, '|', s.RaporFormati)) AS c
        FROM NKR n
        INNER JOIN NumuneX1 x1 ON x1.RaporID = n.ID
        INNER JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
          AND s.RaporFormati IS NOT NULL AND s.RaporFormati != ''
        LEFT JOIN NKR_LabKabul k ON k.NkrID = n.ID AND k.RaporFormati = s.RaporFormati
        WHERE n.Durum = 'Aktif' AND k.ID IS NULL
      `);
      kabul = Number(r.recordset[0]?.c ?? 0);
    } else {
      const r = await pool.request().query(`
        SELECT COUNT(DISTINCT CONCAT(n.ID, '|', s.RaporFormati)) AS c
        FROM NKR n
        INNER JOIN NumuneX1 x1 ON x1.RaporID = n.ID
        INNER JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
          AND s.RaporFormati IS NOT NULL AND s.RaporFormati != ''
        WHERE n.Durum = 'Aktif'
      `);
      kabul = Number(r.recordset[0]?.c ?? 0);
    }

    // ── Kabul edilmiş kayıtların durumlarını topla ──
    // EffectiveDurum hesabı: NKR_RaporOnay > Override > otomatik
    let sonuc = 0, geri = 0, onay = 0;
    if (hasLabKabul) {
      const onayJoin = hasRaporOnay
        ? `LEFT JOIN NKR_RaporOnay ro
             ON ro.NkrID = n.ID AND ro.RaporFormati = s.RaporFormati`
        : "";
      const onayDurumExpr = hasRaporOnay ? "ro.Durum" : "NULL";
      const overrideJoin = hasOverride
        ? `LEFT JOIN NKR_RaporDurumOverride ov
             ON ov.NkrID = n.ID AND ov.RaporFormati = s.RaporFormati`
        : "";
      const overrideDurumExpr = hasOverride ? "ov.Durum" : "NULL";

      const r = await pool.request().query(`
        WITH Eff AS (
          SELECT DISTINCT n.ID AS NkrID, s.RaporFormati,
            COALESCE(
              ${onayDurumExpr},
              CASE
                WHEN ${overrideDurumExpr} IN (N'Tamamlandı', N'Tamamlandi') THEN N'Onay Bekleniyor'
                WHEN ${overrideDurumExpr} = N'Devam Ediyor' THEN N'Analiz Devam Ediyor'
                ELSE ${overrideDurumExpr}
              END,
              CASE WHEN (
                SELECT COUNT(*) FROM NumuneX1 x2
                INNER JOIN StokAnalizListesi s2 ON s2.ID = x2.AnalizID
                WHERE x2.RaporID = n.ID AND s2.RaporFormati = s.RaporFormati
                  AND x2.[SonucKayitTarihi] IS NOT NULL
              ) > 0 THEN N'Analiz Devam Ediyor' ELSE N'Bekliyor' END
            ) AS EffDurum
          FROM NKR n
          INNER JOIN NumuneX1 x1 ON x1.RaporID = n.ID
          INNER JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
            AND s.RaporFormati IS NOT NULL AND s.RaporFormati != ''
          INNER JOIN NKR_LabKabul k ON k.NkrID = n.ID AND k.RaporFormati = s.RaporFormati
          ${onayJoin}
          ${overrideJoin}
          WHERE n.Durum = 'Aktif'
        )
        SELECT EffDurum, COUNT(*) AS c FROM Eff GROUP BY EffDurum
      `);
      for (const row of r.recordset as Array<{ EffDurum: string; c: number | string }>) {
        const d = String(row.EffDurum || "");
        const c = Number(row.c || 0);
        // Sonuç Girişi: yalnızca Bekliyor + Analiz Devam Ediyor (Onay Bekleniyor "Onay Bekleyenler"de)
        if (d === "Bekliyor" || d === "Analiz Devam Ediyor") sonuc += c;
        if (d === "Geri Gönderildi") geri += c;
        if (d === "Onay Bekleniyor")  onay += c;
        // Onaylandı / Yayınlandı sayılmaz (sadece filter ile görünür)
      }
    }

    return Response.json({ kabul, sonuc, geri, onay });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Hata";
    return Response.json({ error: msg, kabul: 0, sonuc: 0, geri: 0, onay: 0 }, { status: 500 });
  }
}
