import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";

// POST /api/rapor-takip/[nkrId]/geri-gonder
// Body: { format, notlar? }
// 1) NKR_RaporOnay'dan sil (varsa)
// 2) NKR_LabKabul'dan sil → rapor "Kabul Bekleyenler" sekmesine geri döner
// 3) NKR_RaporDurumOverride'dan sil → durum auto: Bekliyor/Analiz Devam Ediyor
// 4) NKR_Log'a "Geri Gönderildi" girer
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
  const notlar = String(body?.notlar || "").trim() || null;
  if (!format) return Response.json({ error: "format gerekli" }, { status: 400 });

  const userId = ((session.user as any)?.userId ?? null) as number | null;

  try {
    const pool = await cosmoPool;

    // İlgili tablolar opsiyonel — yoksa atla
    const tables = ["NKR_RaporOnay", "NKR_LabKabul", "NKR_RaporDurumOverride", "NKR_Log"];
    const tblRes = await pool.request().query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA IN ('dbo', 'cosmoroot') AND TABLE_NAME IN (${tables.map(t => `'${t}'`).join(",")})`
    );
    const present = new Set<string>(tblRes.recordset.map((r: any) => String(r.TABLE_NAME).toLowerCase()));

    // Onay (varsa) → SİLME, placeholder'a sıfırla. Böylece dış takip kodu
    // (DisRaporKodu), karekod token'ı ve revize açıklaması (Notlar) korunur →
    // stabil kod ve revizyon notu geri-gönder döngüsünde kaybolmaz. Durum=NULL
    // olduğu için listede override 'Geri Gönderildi' baskın gelir (eskisiyle
    // aynı davranış), tekrar Onayla'da aynı kod+token yeniden kullanılır.
    if (present.has("nkr_raporonay")) {
      await pool.request()
        .input("nkrId", nkrIdNum).input("format", format)
        .query(`
          UPDATE NKR_RaporOnay
          SET Durum = NULL, YayinUrl = NULL, YayinTarihi = NULL
          WHERE NkrID = @nkrId
            AND UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U'))
        `);
    }

    // NKR_LabKabul DOKUNULMAZ — kabul edilmiş kalsın, sadece durum "Geri Gönderildi" olsun.
    // Bu sayede "Geri Gelenler" tabında görünür, lab orada düzeltip tekrar Onaya Gönderebilir.

    // Override → "Geri Gönderildi" set et (DELETE + INSERT) + notlar
    if (present.has("nkr_rapordurumoverride")) {
      // Notlar kolonu var mı? (eski override tablosunda olmayabilir)
      const colRes = await pool.request().query(
        `SELECT 1 AS x FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA IN ('dbo','cosmoroot')
           AND TABLE_NAME='NKR_RaporDurumOverride' AND COLUMN_NAME='Notlar'`
      );
      const hasNotlar = colRes.recordset.length > 0;

      await pool.request()
        .input("nkrId", nkrIdNum).input("format", format)
        .query(`
          DELETE FROM NKR_RaporDurumOverride
          WHERE NkrID = @nkrId
            AND UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U'))
        `);
      if (hasNotlar) {
        await pool.request()
          .input("nkrId", nkrIdNum)
          .input("format", format)
          .input("notlar", notlar)
          .query(`
            INSERT INTO NKR_RaporDurumOverride (NkrID, RaporFormati, Durum, UpdatedAt, Notlar)
            VALUES (@nkrId, @format, N'Geri Gönderildi', GETDATE(), @notlar)
          `);
      } else {
        await pool.request()
          .input("nkrId", nkrIdNum)
          .input("format", format)
          .query(`
            INSERT INTO NKR_RaporDurumOverride (NkrID, RaporFormati, Durum, UpdatedAt)
            VALUES (@nkrId, @format, N'Geri Gönderildi', GETDATE())
          `);
      }
    }

    if (present.has("nkr_log")) {
      const aciklama = notlar
        ? `${format} formatı geri gönderildi: ${notlar}`
        : `${format} formatı laboratuvara geri gönderildi (Kabul Bekleyenler'e döner).`;
      await pool.request()
        .input("NKRID", nkrIdNum)
        .input("KullaniciID", userId)
        .input("Eylem", "Rapor Geri Gönderildi")
        .input("Aciklama", aciklama)
        .query(
          `INSERT INTO NKR_Log (NKRID, KullaniciID, Eylem, Aciklama, Tarih)
           VALUES (@NKRID, @KullaniciID, @Eylem, @Aciklama, CURRENT_TIMESTAMP)`
        );
    }

    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
