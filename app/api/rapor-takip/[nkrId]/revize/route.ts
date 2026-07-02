import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";

// POST /api/rapor-takip/[nkrId]/revize
// Body: { format, aciklama }
// Onaylı/yayınlanmış bir raporu revize eder:
//   1) NKR.Revno +1 (metin; 0/boş → 1)
//   2) Mevcut (aktif) NKR_RaporOnay satırını SİLMEZ → Durum='Geçersiz' yapar,
//      açıklamayı Notlar'a yazar. Token/YayinUrl/DisRaporKodu korunur; böylece
//      eski karekod doğrulamada "Geçersiz" olarak çözülür.
//   3) NKR_LabKabul (o format) silinir → numune "Kabul Bekleyenler"e döner.
//   4) NKR_RaporDurumOverride (o format) temizlenir → durum otomatik hesaplanır.
//   5) NKR_Log'a "Rapor Revize Edildi" girer.
// Sonrasında normal akış: yeniden kabul → sonuç girişi → onayla (YENİ token +
// YENİ DisRaporKodu ile yeni satır) → yayınla.
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
  const aciklama = String(body?.aciklama || "").trim();
  if (!format) return Response.json({ error: "format gerekli" }, { status: 400 });
  if (!aciklama) return Response.json({ error: "Revize açıklaması gerekli" }, { status: 400 });

  const userId = ((session.user as any)?.userId ?? null) as number | null;

  try {
    const pool = await cosmoPool;

    // Hangi opsiyonel tablolar mevcut?
    const tables = ["NKR_RaporOnay", "NKR_LabKabul", "NKR_RaporDurumOverride", "NKR_Log"];
    const tblRes = await pool.request().query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA IN ('dbo', 'cosmoroot') AND TABLE_NAME IN (${tables.map(t => `'${t}'`).join(",")})`
    );
    const present = new Set<string>(tblRes.recordset.map((r: any) => String(r.TABLE_NAME).toLowerCase()));

    if (!present.has("nkr_raporonay")) {
      return Response.json({ error: "NKR_RaporOnay tablosu yok." }, { status: 500 });
    }

    // Aktif (geçersiz olmayan) onay satırını bul — bunu geçersiz yapacağız.
    const onayRes = await pool.request()
      .input("nkrId", nkrIdNum).input("format", format)
      .query(`
        SELECT TOP 1 ID, Durum FROM NKR_RaporOnay
        WHERE NkrID = @nkrId
          AND UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U'))
          AND (Durum IS NULL OR Durum <> N'Geçersiz')
        ORDER BY ID DESC
      `);
    const onay = onayRes.recordset[0];
    if (!onay) {
      return Response.json(
        { error: "Bu format için revize edilecek onaylı rapor bulunamadı." },
        { status: 400 },
      );
    }

    // NKR: RaporNo + mevcut Revno
    const nkrRes = await pool.request()
      .input("nkrId", nkrIdNum)
      .query(`SELECT RaporNo, Revno FROM NKR WHERE ID = @nkrId`);
    const nkr = nkrRes.recordset[0];
    if (!nkr) return Response.json({ error: "Numune (NKR) bulunamadı." }, { status: 404 });

    const raporNo = nkr.RaporNo != null ? String(nkr.RaporNo) : String(nkrIdNum);
    const eskiRevRaw = parseInt(String(nkr.Revno ?? "0").trim(), 10);
    const eskiRev = Number.isFinite(eskiRevRaw) ? eskiRevRaw : 0;
    const yeniRev = eskiRev + 1;

    // 1) Revno artır
    await pool.request()
      .input("nkrId", nkrIdNum)
      .input("rev", String(yeniRev))
      .query(`UPDATE NKR SET Revno = @rev WHERE ID = @nkrId`);

    // 2) Eski onayı "Geçersiz" yap + açıklamayı Notlar'a yaz (kayıt korunur)
    await pool.request()
      .input("id", onay.ID)
      .input("notlar", aciklama.slice(0, 500))
      .query(`
        UPDATE NKR_RaporOnay
        SET Durum = N'Geçersiz', Notlar = @notlar
        WHERE ID = @id
      `);

    // 3) NKR_LabKabul sil → numune "Kabul Bekleyenler"e döner
    if (present.has("nkr_labkabul")) {
      await pool.request()
        .input("nkrId", nkrIdNum).input("format", format)
        .query(`
          DELETE FROM NKR_LabKabul
          WHERE NkrID = @nkrId
            AND UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U'))
        `);
    }

    // 4) NKR_RaporDurumOverride temizle → durum otomatik hesaplansın
    if (present.has("nkr_rapordurumoverride")) {
      await pool.request()
        .input("nkrId", nkrIdNum).input("format", format)
        .query(`
          DELETE FROM NKR_RaporDurumOverride
          WHERE NkrID = @nkrId
            AND UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U'))
        `);
    }

    // 5) Log
    if (present.has("nkr_log")) {
      await pool.request()
        .input("NKRID", nkrIdNum)
        .input("KullaniciID", userId)
        .input("Eylem", "Rapor Revize Edildi")
        .input("Aciklama", `${format} formatı revize edildi (Rev.${eskiRev} → Rev.${yeniRev}). ${aciklama}`.slice(0, 900))
        .query(
          `INSERT INTO NKR_Log (NKRID, KullaniciID, Eylem, Aciklama, Tarih)
           VALUES (@NKRID, @KullaniciID, @Eylem, @Aciklama, CURRENT_TIMESTAMP)`
        );
    }

    return Response.json({
      ok: true,
      raporNo,
      eskiRev,
      yeniRev,
      durum: "Geçersiz",
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
