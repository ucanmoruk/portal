import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";

// POST /api/numune-takip-lab/[nkrId]/kabul-et
// Body: { raporFormati: string, notlar?: string }
// 1) NKR_LabKabul'a INSERT (varsa update). BolumID, ürünün/rapor formatının
//    hizmetlerinden ilk NOT NULL olanı kullanır.
// 2) NKR_Log'a "Laboratuvar Kabulü" satırı yazar.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ nkrId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { nkrId } = await params;
  const nkrIdNum = parseInt(nkrId, 10);
  if (!Number.isFinite(nkrIdNum)) {
    return Response.json({ error: "Geçersiz NkrID" }, { status: 400 });
  }

  let body: { raporFormati?: string; notlar?: string } = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Geçersiz JSON" }, { status: 400 });
  }
  const raporFormati = (body.raporFormati || "").trim();
  if (!raporFormati) {
    return Response.json({ error: "raporFormati gerekli" }, { status: 400 });
  }

  const userId = ((session.user as any)?.userId ?? null) as number | null;
  const userName = ((session.user as any)?.name || (session.user as any)?.email || null) as string | null;

  try {
    const pool = await cosmoPool;

    // NKR_LabKabul tablo mu var? (dbo/cosmoroot şemasında)
    const tblCheck = await pool.request().query(
      `SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_NAME = 'NKR_LabKabul' AND TABLE_SCHEMA IN ('dbo', 'cosmoroot')`
    );
    if (tblCheck.recordset.length === 0) {
      return Response.json(
        { error: "NKR_LabKabul tablosu yok. Migration 006'yı çalıştırın." },
        { status: 500 }
      );
    }

    // Bölüm bilgisini al (varsa)
    const hasBolumCol = await pool.request().query(
      `SELECT 1 AS x FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME='StokAnalizListesi' AND COLUMN_NAME='BolumID'
         AND TABLE_SCHEMA IN ('dbo','cosmoroot')`
    );
    const hasBL = hasBolumCol.recordset.length > 0;

    let bolumID: number | null = null;
    let bolumAdi = "";
    if (hasBL) {
      const bRes = await pool.request()
        .input("nkrId", nkrIdNum)
        .input("raporFormati", raporFormati)
        .query(`
          SELECT TOP 1 s.BolumID, ISNULL(b.Birim, '') AS BolumAdi
          FROM NumuneX1 x1
          INNER JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
          LEFT JOIN RootFirmaBirim b ON b.ID = s.BolumID
          WHERE x1.RaporID = @nkrId
            AND COALESCE(NULLIF(s.RaporFormati, ''), N'Genel') = @raporFormati
            AND s.BolumID IS NOT NULL
          ORDER BY s.Kod
        `);
      if (bRes.recordset.length > 0) {
        bolumID = bRes.recordset[0].BolumID ?? null;
        bolumAdi = bRes.recordset[0].BolumAdi || "";
      }
    }

    // Var mı kontrol et (portable — IF/BEGIN/END T-SQL bloğu Postgres'te bölünüyor)
    const existRes = await pool.request()
      .input("NkrID", nkrIdNum)
      .input("RaporFormati", raporFormati)
      .query(`SELECT ID FROM NKR_LabKabul WHERE NkrID = @NkrID AND RaporFormati = @RaporFormati`);

    let kabulID: number | null = existRes.recordset[0]?.ID ?? null;

    if (kabulID == null) {
      // Yoksa ekle
      const insRes = await pool.request()
        .input("NkrID", nkrIdNum)
        .input("RaporFormati", raporFormati)
        .input("BolumID", bolumID)
        .input("KabulEdenID", userId)
        .input("KabulEdenAd", userName)
        .input("Notlar", body.notlar || null)
        .query(`
          INSERT INTO NKR_LabKabul (NkrID, RaporFormati, BolumID, KabulEdenID, KabulEdenAd, Notlar)
          OUTPUT INSERTED.ID
          VALUES (@NkrID, @RaporFormati, @BolumID, @KabulEdenID, @KabulEdenAd, @Notlar)
        `);
      kabulID = insRes.recordset[0]?.ID ?? null;

      // Numune lab tarafından kabul edildi → "Sonuç Girişi" aşamasına geçti.
      // NKR.Rapor_Durumu = 'Analiz Aşamasında' (forward-going, idempotent;
      // halihazırda 'Analiz Aşamasında' veya 'Raporlandı' ise dokunulmaz).
      await pool.request()
        .input("NkrID", nkrIdNum)
        .query(`
          UPDATE NKR
          SET Rapor_Durumu = N'Analiz Aşamasında'
          WHERE ID = @NkrID
            AND ISNULL(Rapor_Durumu, N'') NOT IN (N'Analiz Aşamasında', N'Raporlandı')
        `);
    }

    await pool.request()
      .input("NkrID", nkrIdNum)
      .input("RaporFormati", raporFormati)
      .query(`
        UPDATE NumuneX1
        SET HizmetDurum = N'Devam'
        WHERE RaporID = @NkrID
          AND HizmetDurum IN (N'Yeni', N'YeniAnaliz', N'Yeni Analiz')
          AND EXISTS (
            SELECT 1
            FROM StokAnalizListesi s
            WHERE s.ID = NumuneX1.AnalizID
              AND COALESCE(NULLIF(s.RaporFormati, ''), N'Genel') = @RaporFormati
          )
      `);

    // ── LOQ otomatik dolum DB'ye yazmıyor ──
    // Önceden Sonuc NULL'lara LOQ yazıyordum ama bu satırı "kayıtlı" sayıyor.
    // Şimdi LOQ sadece UI tarafında öneri olarak gösterilir (hizmetler endpoint'inde
    // defaultSonuc/defaultSonucEn). Kullanıcı Kaydet basana kadar Sonuc NULL kalır,
    // durum "Bekliyor" görünür.

    // NKR_Log varsa "Laboratuvar Kabulü" girişi (dbo/cosmoroot şemasında)
    const logCheck = await pool.request().query(
      `SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_NAME = 'NKR_Log' AND TABLE_SCHEMA IN ('dbo','cosmoroot')`
    );
    if (logCheck.recordset.length > 0) {
      const aciklama = bolumAdi
        ? `${bolumAdi} biriminde numune teslim alınmıştır. (Rapor formatı: ${raporFormati})`
        : `Numune teslim alınmıştır. (Rapor formatı: ${raporFormati})`;

      await pool.request()
        .input("NKRID", nkrIdNum)
        .input("KullaniciID", userId)
        .input("KullaniciAdi", userName)
        .input("Eylem", "Laboratuvar Kabulü")
        .input("Aciklama", aciklama)
        .query(
          `INSERT INTO NKR_Log (NKRID, KullaniciID, KullaniciAdi, Eylem, Aciklama, Tarih)
           VALUES (@NKRID, @KullaniciID, @KullaniciAdi, @Eylem, @Aciklama, CURRENT_TIMESTAMP)`
        );
    }

    return Response.json({
      ok: true,
      kabulID,
      bolumID,
      bolumAdi,
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// DELETE — kabul iptali (opsiyonel)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ nkrId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { nkrId } = await params;
  const nkrIdNum = parseInt(nkrId, 10);
  if (!Number.isFinite(nkrIdNum)) {
    return Response.json({ error: "Geçersiz NkrID" }, { status: 400 });
  }
  const url = new URL(_request.url);
  const raporFormati = (url.searchParams.get("raporFormati") || "").trim();
  if (!raporFormati) {
    return Response.json({ error: "raporFormati gerekli" }, { status: 400 });
  }

  try {
    const pool = await cosmoPool;
    await pool.request()
      .input("NkrID", nkrIdNum)
      .input("RaporFormati", raporFormati)
      .query(`DELETE FROM NKR_LabKabul WHERE NkrID = @NkrID AND RaporFormati = @RaporFormati`);
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
