import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";

// POST /api/rapor-takip/[nkrId]/yayinla
// Body: { format, yayinUrl? }
// Önkoşul: onaylı olmalı. Status → "Yayınlandı", YayinTarihi = NOW.
// NKR_Log'a "Rapor Yayınlandı" girer.
// Gerçek dış portal entegrasyonu sonradan — şimdilik state + log.
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
  const yayinUrl = String(body?.yayinUrl || "").trim() || null;
  if (!format) return Response.json({ error: "format gerekli" }, { status: 400 });

  const userId = ((session.user as any)?.userId ?? null) as number | null;

  try {
    const pool = await cosmoPool;

    const tblCheck = await pool.request().query(
      `SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_NAME = 'NKR_RaporOnay' AND TABLE_SCHEMA IN ('dbo', 'cosmoroot')`
    );
    if (tblCheck.recordset.length === 0) {
      return Response.json({ error: "NKR_RaporOnay tablosu yok." }, { status: 500 });
    }

    // Onay var mı?
    const exist = await pool.request()
      .input("nkrId", nkrIdNum).input("format", format)
      .query(`
        SELECT ID, KarekodToken, Durum FROM NKR_RaporOnay
        WHERE NkrID = @nkrId
          AND UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U'))
      `);
    const onay = exist.recordset[0];
    if (!onay) {
      return Response.json({ error: "Önce raporu Onayla'yın." }, { status: 400 });
    }

    await pool.request()
      .input("nkrId", nkrIdNum)
      .input("format", format)
      .input("yayinUrl", yayinUrl)
      .query(`
        UPDATE NKR_RaporOnay
        SET Durum = 'Yayınlandı',
            YayinTarihi = GETDATE(),
            YayinUrl = @yayinUrl
        WHERE NkrID = @nkrId
          AND UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U'))
      `);

    // NKR_Log → Ürün Geçmişi
    const logCheck = await pool.request().query(
      `SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_NAME = 'NKR_Log' AND TABLE_SCHEMA IN ('dbo', 'cosmoroot')`
    );
    if (logCheck.recordset.length > 0) {
      const detay = yayinUrl
        ? `${format} formatı portalda yayınlandı. Karekod: ${onay.KarekodToken} · URL: ${yayinUrl}`
        : `${format} formatı portalda yayınlandı. Karekod: ${onay.KarekodToken}`;
      await pool.request()
        .input("NKRID", nkrIdNum)
        .input("KullaniciID", userId)
        .input("Eylem", "Rapor Yayınlandı")
        .input("Aciklama", detay)
        .query(
          `INSERT INTO NKR_Log (NKRID, KullaniciID, Eylem, Aciklama, Tarih)
           VALUES (@NKRID, @KullaniciID, @Eylem, @Aciklama, CURRENT_TIMESTAMP)`
        );
    }

    return Response.json({ ok: true, token: onay.KarekodToken, durum: "Yayınlandı" });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
