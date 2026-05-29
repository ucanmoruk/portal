import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ nkrId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erisim" }, { status: 401 });

  const { nkrId } = await params;
  const nkrIdNum = parseInt(nkrId, 10);
  if (Number.isNaN(nkrIdNum)) return Response.json({ error: "Gecersiz ID" }, { status: 400 });

  try {
    const body = await request.json().catch(() => ({}));
    const format = String(body?.format || "").trim();
    const rawDurum = String(body?.durum || "Onay Bekleniyor").trim();
    // Normalize: eski "Devam Ediyor" → "Analiz Devam Ediyor", "Tamamlandı/i" → "Onay Bekleniyor"
    const durum =
      rawDurum === "Tamamlandi"  ? "Onay Bekleniyor" :
      rawDurum === "Tamamlandı"  ? "Onay Bekleniyor" :
      rawDurum === "Devam Ediyor" ? "Analiz Devam Ediyor" :
      rawDurum;
    const allowed = new Set(["Bekliyor", "Analiz Devam Ediyor", "Onay Bekleniyor"]);

    if (!format) return Response.json({ error: "Rapor formati zorunlu" }, { status: 400 });
    if (!allowed.has(durum)) return Response.json({ error: "Gecersiz durum" }, { status: 400 });

    const pool = await poolPromise;

    await pool.request()
      .input("nkrId", nkrIdNum)
      .input("format", format)
      .input("durum", durum)
      .query(`
        DELETE FROM NKR_RaporDurumOverride
        WHERE NkrID = @nkrId
          AND UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U'));

        INSERT INTO NKR_RaporDurumOverride (NkrID, RaporFormati, Durum, UpdatedAt)
        VALUES (@nkrId, @format, @durum, GETDATE());
      `);

    // NKR_Log girişi
    const logCheck = await pool.request().query(
      `SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_NAME = 'NKR_Log' AND TABLE_SCHEMA IN ('dbo','cosmoroot')`
    );
    if (logCheck.recordset.length > 0) {
      const userId = ((session.user as any)?.userId ?? null) as number | null;
      const aciklama =
        durum === "Onay Bekleniyor" ? `${format} formatı onaya gönderildi.` :
        durum === "Bekliyor"        ? `${format} formatı için onay geri alındı.` :
        `${format} formatı durumu güncellendi: ${durum}`;
      await pool.request()
        .input("NKRID", nkrIdNum)
        .input("KullaniciID", userId)
        .input("Eylem", durum === "Onay Bekleniyor" ? "Onaya Gönderildi" : "Durum Değişikliği")
        .input("Aciklama", aciklama)
        .query(
          `INSERT INTO NKR_Log (NKRID, KullaniciID, Eylem, Aciklama, Tarih)
           VALUES (@NKRID, @KullaniciID, @Eylem, @Aciklama, CURRENT_TIMESTAMP)`
        );
    }

    return Response.json({ ok: true, durum });
  } catch (e: any) {
    return Response.json({ error: e.message || "Durum guncellenemedi" }, { status: 500 });
  }
}
