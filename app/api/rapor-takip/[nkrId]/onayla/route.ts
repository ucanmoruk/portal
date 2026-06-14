import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { randomBytes } from "node:crypto";
import { type NextRequest } from "next/server";
import { imzalaVeKaydet } from "@/lib/raporImzaData";
import { randomDisKodRapor } from "@/lib/disKod";

// 32 karakterlik URL-safe token
function generateToken(): string {
  return randomBytes(18).toString("base64url"); // ~24 char
}

// Benzersiz dış rapor kodu üret: ÜGAM/RR26/XXXX (çakışırsa tekrar dener).
// Eğer DisRaporKodu kolonu yoksa null döner (eski şemada graceful degrade).
async function genUniqueDisRaporKodu(pool: any, raporFormati: string): Promise<string | null> {
  const colCheck = await pool.request().query(
    `SELECT 1 AS x FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_NAME = 'NKR_RaporOnay' AND COLUMN_NAME = 'DisRaporKodu'`
  );
  if (colCheck.recordset.length === 0) return null;

  const year = new Date().getFullYear();
  for (let i = 0; i < 25; i++) {
    const kod = randomDisKodRapor(year, raporFormati);
    const exists = await pool.request()
      .input("kod", kod)
      .query(`SELECT TOP 1 ID FROM NKR_RaporOnay WHERE DisRaporKodu = @kod`);
    if (!exists.recordset.length) return kod;
  }
  return randomDisKodRapor(year, raporFormati) + String(Date.now()).slice(-2);
}

// POST /api/rapor-takip/[nkrId]/onayla
// Body: { format }
// Onayla → karekod token üret, NKR_RaporOnay'a kayıt at, NKR_Log'a logla.
// NOT: PDF üretimi + FTP yükleme burada DEĞİL — "Portala Gönder" (yayinla) adımında.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ nkrId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { nkrId } = await params;
  const nkrIdNum = parseInt(nkrId, 10);
  if (!Number.isFinite(nkrIdNum)) return Response.json({ error: "Geçersiz NkrID" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const format = String(body?.format || "").trim();
  if (!format) return Response.json({ error: "format gerekli" }, { status: 400 });

  const userId = ((session.user as any)?.userId ?? null) as number | null;
  const userName = ((session.user as any)?.name || (session.user as any)?.email || null) as string | null;

  try {
    const pool = await cosmoPool;

    const tblCheck = await pool.request().query(
      `SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_NAME = 'NKR_RaporOnay' AND TABLE_SCHEMA IN ('dbo', 'cosmoroot')`
    );
    if (tblCheck.recordset.length === 0) {
      return Response.json(
        { error: "NKR_RaporOnay tablosu yok. Migration 008'i çalıştırın." },
        { status: 500 }
      );
    }

    // Zaten onaylanmış mı?
    const existRes = await pool.request()
      .input("nkrId", nkrIdNum)
      .input("format", format)
      .query(`
        SELECT ID, KarekodToken, Durum FROM NKR_RaporOnay
        WHERE NkrID = @nkrId
          AND UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U'))
      `);

    if (existRes.recordset[0]) {
      // Mevcut satır var — placeholder (Durum=NULL, ensureDisRaporKodlari ile oluşturulmuş)
      // VEYA gerçekten onaylanmış olabilir. Durum'a göre dallan:
      //  - Durum gerçek onay durumu ('Onaylandı'/'Yayınlandı') ise idempotent dön
      //  - Durum NULL veya farklı ise BU çağrı onaylama → Durum'u 'Onaylandı' yap
      const mevcutId = existRes.recordset[0].ID;
      const mevcutDurum = existRes.recordset[0].Durum;
      const zatenOnayli = mevcutDurum === "Onaylandı" || mevcutDurum === "Yayınlandı";

      if (!zatenOnayli) {
        // Placeholder satırı → bu çağrı asıl onay. Durum + onaylayan bilgisini set et.
        await pool.request()
          .input("id", mevcutId)
          .input("onaylayan", userId)
          .input("onaylayanAd", userName)
          .query(`
            UPDATE NKR_RaporOnay
            SET Durum = N'Onaylandı',
                OnaylayanID = @onaylayan,
                OnaylayanAd = @onaylayanAd,
                OnayTarihi = GETDATE()
            WHERE ID = @id
          `);
      }

      const imzaHash = await imzalaVeKaydet(pool, mevcutId, nkrIdNum, format);

      // DisRaporKodu backfill (kolon varsa ve boşsa)
      let disKodFinal: string | null = null;
      const curKodRes = await pool.request()
        .input("id", mevcutId)
        .query(`
          IF COL_LENGTH('NKR_RaporOnay','DisRaporKodu') IS NOT NULL
            SELECT DisRaporKodu FROM NKR_RaporOnay WHERE ID = @id
          ELSE
            SELECT CAST(NULL AS NVARCHAR(40)) AS DisRaporKodu
        `);
      const curKod = curKodRes.recordset[0]?.DisRaporKodu as string | null | undefined;
      if (!curKod) {
        const yeniKod = await genUniqueDisRaporKodu(pool, format);
        if (yeniKod) {
          await pool.request().input("id", mevcutId).input("kod", yeniKod).query(
            `UPDATE NKR_RaporOnay SET DisRaporKodu = @kod WHERE ID = @id`
          );
          disKodFinal = yeniKod;
        }
      } else {
        disKodFinal = curKod;
      }

      // Onay logu — sadece bu çağrı gerçek onay ise
      if (!zatenOnayli) {
        const logCheck = await pool.request().query(
          `SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES
           WHERE TABLE_NAME = 'NKR_Log' AND TABLE_SCHEMA IN ('dbo', 'cosmoroot')`
        );
        if (logCheck.recordset.length > 0) {
          await pool.request()
            .input("NKRID", nkrIdNum)
            .input("KullaniciID", userId)
            .input("Eylem", "Rapor Onaylandı")
            .input("Aciklama", `${format} formatı onaylandı.`)
            .query(
              `INSERT INTO NKR_Log (NKRID, KullaniciID, Eylem, Aciklama, Tarih)
               VALUES (@NKRID, @KullaniciID, @Eylem, @Aciklama, CURRENT_TIMESTAMP)`
            );
        }
      }

      return Response.json({
        ok: true,
        alreadyApproved: zatenOnayli,
        token: existRes.recordset[0].KarekodToken,
        durum: zatenOnayli ? mevcutDurum : "Onaylandı",
        imzaHash,
        disRaporKodu: disKodFinal,
      });
    }

    // Yeni onay — token üret (collision retry)
    let token = "";
    for (let i = 0; i < 5; i++) {
      const cand = generateToken();
      const c = await pool.request().input("t", cand).query(
        `SELECT 1 AS x FROM NKR_RaporOnay WHERE KarekodToken = @t`
      );
      if (c.recordset.length === 0) { token = cand; break; }
    }
    if (!token) return Response.json({ error: "Token üretilemedi" }, { status: 500 });

    // Dış rapor kodu üret (kolon yoksa null döner, INSERT'te koşullu eklenir)
    const disRaporKodu = await genUniqueDisRaporKodu(pool, format);
    const hasDisKodCol = disRaporKodu !== null;

    const insRes = await pool.request()
      .input("nkrId", nkrIdNum)
      .input("format", format)
      .input("token", token)
      .input("onaylayan", userId)
      .input("onaylayanAd", userName)
      .input("disKod", disRaporKodu)
      .query(hasDisKodCol
        ? `
        INSERT INTO NKR_RaporOnay (NkrID, RaporFormati, KarekodToken, Durum, OnaylayanID, OnaylayanAd, DisRaporKodu)
        OUTPUT INSERTED.ID
        VALUES (@nkrId, @format, @token, 'Onaylandı', @onaylayan, @onaylayanAd, @disKod)
      `
        : `
        INSERT INTO NKR_RaporOnay (NkrID, RaporFormati, KarekodToken, Durum, OnaylayanID, OnaylayanAd)
        OUTPUT INSERTED.ID
        VALUES (@nkrId, @format, @token, 'Onaylandı', @onaylayan, @onaylayanAd)
      `);

    // ───── Dijital imza (tamper-proof) ─────
    // Rapor içeriğini onay anında imzala → NKR_RaporOnay.ImzaHash'e yaz.
    const imzaHash = await imzalaVeKaydet(pool, insRes.recordset[0]?.ID, nkrIdNum, format);

    // Log
    const logCheck = await pool.request().query(
      `SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_NAME = 'NKR_Log' AND TABLE_SCHEMA IN ('dbo', 'cosmoroot')`
    );
    if (logCheck.recordset.length > 0) {
      await pool.request()
        .input("NKRID", nkrIdNum)
        .input("KullaniciID", userId)
        .input("Eylem", "Rapor Onaylandı")
        .input("Aciklama", `${format} formatı onaylandı. Karekod token: ${token}`)
        .query(
          `INSERT INTO NKR_Log (NKRID, KullaniciID, Eylem, Aciklama, Tarih)
           VALUES (@NKRID, @KullaniciID, @Eylem, @Aciklama, CURRENT_TIMESTAMP)`
        );
    }

    return Response.json({
      ok: true,
      onayID: insRes.recordset[0]?.ID,
      token,
      durum: "Onaylandı",
      imzaHash,
      disRaporKodu,
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
