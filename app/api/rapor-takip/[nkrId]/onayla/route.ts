import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { randomBytes } from "node:crypto";
import { type NextRequest } from "next/server";
import { imzalaVeKaydet } from "@/lib/raporImzaData";

// 32 karakterlik URL-safe token
function generateToken(): string {
  return randomBytes(18).toString("base64url"); // ~24 char
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
      // İdempotent: mevcut token'ı döndür.
      // İmza eksikse (önceden onaylanmış ya da imza atılamamış) burada tamamla (backfill).
      const mevcutId = existRes.recordset[0].ID;
      const imzaHash = await imzalaVeKaydet(pool, mevcutId, nkrIdNum, format);
      return Response.json({
        ok: true,
        alreadyApproved: true,
        token: existRes.recordset[0].KarekodToken,
        durum: existRes.recordset[0].Durum,
        imzaHash,
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

    const insRes = await pool.request()
      .input("nkrId", nkrIdNum)
      .input("format", format)
      .input("token", token)
      .input("onaylayan", userId)
      .input("onaylayanAd", userName)
      .query(`
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
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
