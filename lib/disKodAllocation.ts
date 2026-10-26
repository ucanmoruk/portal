import "server-only";
import { randomDisKodRapor } from "./disKod";

import { randomBytes } from "node:crypto";

function newCollisionFreeToken(existing: Set<string>): string {
  for (let i = 0; i < 10; i++) {
    const t = randomBytes(18).toString("base64url");
    if (!existing.has(t)) { existing.add(t); return t; }
  }
  return randomBytes(18).toString("base64url") + Date.now();
}

/**
 * Bu NKR'ye bağlı tüm rapor formatları için NKR_RaporOnay'da
 * DisRaporKodu satırı olduğundan emin olur. Onay anı beklenmez —
 * numune-form save / lab kabul aşamasında çağrılır.
 *
 * Satırın Durum'u NULL bırakılır ki rapor-takip durum mantığı
 * (Bekliyor / Analiz Devam Ediyor) bozulmasın. Onaylanınca aynı satır
 * UPDATE edilir (Durum='Onaylandı', OnayTarihi=NOW, vs).
 *
 * Idempotent: zaten DisKod olan satırlara dokunulmaz.
 */
export async function ensureDisRaporKodlari(pool: any, nkrId: number): Promise<{ created: number; skipped: number }> {
  // Kolon var mı?
  const colCheck = await pool.request().query(
    `SELECT COL_LENGTH('NKR_RaporOnay','DisRaporKodu') AS len`
  );
  if (!colCheck.recordset[0]?.len) return { created: 0, skipped: 0 };

  // Bu NKR'nin distinct format'ları
  const formatRes = await pool.request().input("nkrId", nkrId).query(`
    SELECT DISTINCT s.RaporFormati
    FROM NumuneX1 x1
    INNER JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
    WHERE x1.RaporID = @nkrId
      AND s.RaporFormati IS NOT NULL AND s.RaporFormati != ''
  `);
  const formatlar = formatRes.recordset.map((r: { RaporFormati: string }) => r.RaporFormati);
  if (formatlar.length === 0) return { created: 0, skipped: 0 };

  // Mevcut onay satırları (bu NKR için)
  const existRes = await pool.request().input("nkrId", nkrId).query(
    `SELECT ID, RaporFormati, DisRaporKodu FROM NKR_RaporOnay WHERE NkrID = @nkrId`
  );
  const mevcut = new Map<string, { ID: number; DisRaporKodu: string | null }>();
  for (const r of existRes.recordset) {
    mevcut.set(String(r.RaporFormati).toUpperCase(), { ID: r.ID, DisRaporKodu: r.DisRaporKodu });
  }

  // Çakışma önleme için sınırlı set yükle (token + kod)
  const setRes = await pool.request().query(
    `SELECT KarekodToken, DisRaporKodu FROM NKR_RaporOnay`
  );
  const tokSet = new Set<string>();
  const kodSet = new Set<string>();
  for (const r of setRes.recordset) {
    if (r.KarekodToken) tokSet.add(r.KarekodToken);
    if (r.DisRaporKodu) kodSet.add(r.DisRaporKodu);
  }
  const yeniDisKod = (yil: number, fmt: string) => {
    for (let i = 0; i < 25; i++) {
      const k = randomDisKodRapor(yil, fmt);
      if (!kodSet.has(k)) { kodSet.add(k); return k; }
    }
    return randomDisKodRapor(yil, fmt) + String(Date.now()).slice(-2);
  };

  const yil = new Date().getFullYear();
  let created = 0, skipped = 0;
  for (const fmt of formatlar) {
    const key = String(fmt).toUpperCase();
    const ex = mevcut.get(key);
    if (ex?.DisRaporKodu) { skipped++; continue; }

    if (ex) {
      // Satır var ama DisKod yok → backfill
      const kod = yeniDisKod(yil, fmt);
      await pool.request().input("id", ex.ID).input("kod", kod).query(
        `UPDATE NKR_RaporOnay SET DisRaporKodu = @kod WHERE ID = @id AND DisRaporKodu IS NULL`
      );
      created++;
    } else {
      // Yeni allocation satırı — Durum NULL, sadece kod taşıyıcı
      const tok = newCollisionFreeToken(tokSet);
      const kod = yeniDisKod(yil, fmt);
      await pool.request()
        .input("nkrId", nkrId).input("format", fmt)
        .input("token", tok).input("kod", kod)
        .query(`
          INSERT INTO NKR_RaporOnay (NkrID, RaporFormati, KarekodToken, Durum, DisRaporKodu)
          VALUES (@nkrId, @format, @token, NULL, @kod)
        `);
      created++;
    }
  }
  return { created, skipped };
}
