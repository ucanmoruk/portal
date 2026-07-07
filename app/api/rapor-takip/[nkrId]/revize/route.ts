import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";

// POST /api/rapor-takip/[nkrId]/revize
// Body: { format, aciklama }
// Onaylı/yayınlanmış bir raporu revize eder. TEK-KAYIT modeli (sistemin
// mevcut revizyon konvansiyonu): dış takip kodu (DisRaporKodu) SABİT kalır,
// revizyon NKR.Revno ile takip edilir; kod her yerde disRaporLabel(kod, rev)
// ile "taban/NN" gösterilir.
// Açıklama doluysa gerçek revizyon:
//   1) NKR.Revno +1 (metin; 0/boş → 1)
//   2) Aynı NKR_RaporOnay satırı korunur ama placeholder'a sıfırlanır:
//      Durum=NULL, YayinUrl/YayinTarihi=NULL, açıklama Notlar'a. KarekodToken
//      ve DisRaporKodu (taban kod) DEĞİŞMEZ → QR/doğrulama aynı kalır, tekrar
//      yayınlanınca güncel revizyonu gösterir.
//   3) NKR_LabKabul (o format) silinir → numune "Kabul Bekleyenler"e döner.
//   4) NKR_RaporDurumOverride (o format) temizlenir → durum otomatik hesaplanır.
//   5) NKR_Log'a "Rapor Revize Edildi" girer.
// Sonrasında normal akış: yeniden kabul → sonuç girişi → onayla (AYNI satır,
// AYNI kod/token) → yayınla (yeni PDF eski dosyanın üzerine yazılır).
//
// Açıklama boşsa bu işlem "düzenlemeye aç" olarak çalışır:
// Revno ve Notlar değişmez; onay durumu geri alınır, rapor onay alanına döner
// ve numune formu tekrar düzenlenebilir olur.
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

  const userId = ((session.user as any)?.userId ?? null) as number | null;

  try {
    const pool = await cosmoPool;

    const tables = ["NKR_RaporOnay", "NKR_LabKabul", "NKR_RaporDurumOverride", "NKR_Log", "NKR_RaporDuzenleme"];
    const tblRes = await pool.request().query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA IN ('dbo', 'cosmoroot') AND TABLE_NAME IN (${tables.map(t => `'${t}'`).join(",")})`
    );
    const present = new Set<string>(tblRes.recordset.map((r: any) => String(r.TABLE_NAME).toLowerCase()));

    if (!present.has("nkr_raporonay")) {
      return Response.json({ error: "NKR_RaporOnay tablosu yok." }, { status: 500 });
    }

    // Bu format için onay satırı var mı? (revize edilecek rapor)
    const onayRes = await pool.request()
      .input("nkrId", nkrIdNum).input("format", format)
      .query(`
        SELECT TOP 1 ID, DisRaporKodu FROM NKR_RaporOnay
        WHERE NkrID = @nkrId
          AND UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U'))
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

    if (!aciklama) {
      await pool.request()
        .input("id", onay.ID)
        .query(`
          UPDATE NKR_RaporOnay
          SET Durum = NULL,
              YayinUrl = NULL,
              YayinTarihi = NULL,
              OnayTarihi = NULL,
              OnaylayanID = NULL,
              OnaylayanAd = NULL,
              ImzaHash = NULL,
              ImzaTarihi = NULL,
              ImzaSurum = NULL
          WHERE ID = @id
        `);

      if (present.has("nkr_raporduzenleme")) {
        await pool.request()
          .input("nkrId", nkrIdNum).input("format", format)
          .query(`
            UPDATE NKR_RaporDuzenleme
            SET Kilitli = 0
            WHERE NkrID = @nkrId
              AND UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U'))
          `);
      }

      if (present.has("nkr_rapordurumoverride")) {
        await pool.request()
          .input("nkrId", nkrIdNum).input("format", format)
          .query(`
            DELETE FROM NKR_RaporDurumOverride
            WHERE NkrID = @nkrId
              AND UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U'));

            INSERT INTO NKR_RaporDurumOverride (NkrID, RaporFormati, Durum, UpdatedAt)
            VALUES (@nkrId, @format, N'Onay Bekleniyor', GETDATE());
          `);
      }

      if (present.has("nkr_log")) {
        await pool.request()
          .input("NKRID", nkrIdNum)
          .input("KullaniciID", userId)
          .input("Eylem", "Rapor Düzenlemeye Açıldı")
          .input("Aciklama", `${format} formatı revizyon numarası artırılmadan onay alanına geri alındı.`.slice(0, 900))
          .query(
            `INSERT INTO NKR_Log (NKRID, KullaniciID, Eylem, Aciklama, Tarih)
             VALUES (@NKRID, @KullaniciID, @Eylem, @Aciklama, CURRENT_TIMESTAMP)`
          );
      }

      return Response.json({
        ok: true,
        mode: "reopen",
        raporNo,
        disRaporKodu: onay.DisRaporKodu ?? null,
        eskiRev,
        yeniRev: eskiRev,
      });
    }

    // 1) Revno artır
    await pool.request()
      .input("nkrId", nkrIdNum)
      .input("rev", String(yeniRev))
      .query(`UPDATE NKR SET Revno = @rev WHERE ID = @nkrId`);

    // 2) Onay satırını placeholder'a sıfırla (kod + token KORUNUR)
    await pool.request()
      .input("id", onay.ID)
      .input("notlar", aciklama.slice(0, 500))
      .query(`
        UPDATE NKR_RaporOnay
        SET Durum = NULL,
            YayinUrl = NULL,
            YayinTarihi = NULL,
            OnayTarihi = NULL,
            OnaylayanID = NULL,
            OnaylayanAd = NULL,
            ImzaHash = NULL,
            ImzaTarihi = NULL,
            ImzaSurum = NULL,
            Notlar = @notlar
        WHERE ID = @id
      `);

    // 2.5) Rapor düzenleme kilidini aç → lab yeni sonuçları girebilsin (payload korunur)
    if (present.has("nkr_raporduzenleme")) {
      await pool.request()
        .input("nkrId", nkrIdNum).input("format", format)
        .query(`
          UPDATE NKR_RaporDuzenleme
          SET Kilitli = 0
          WHERE NkrID = @nkrId
            AND UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U'))
        `);
    }

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
      disRaporKodu: onay.DisRaporKodu ?? null,
      eskiRev,
      yeniRev,
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
