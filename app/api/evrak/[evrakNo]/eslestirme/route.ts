import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";

// ─────────────────────────────────────────────────────────────────────────────
// /api/evrak/[evrakNo]/eslestirme
//
// GET  → Bu evraka bağlı tüm eşleştirmeleri (Teklif / AnalizTalep / DestekTalep
//        / Dosya) dış-tabloya JOIN ile zenginleştirip döner.
// POST → Yeni eşleştirme. Body: { tur, hedefId?, hedefKod?, aciklama? }
//        Tur 'Teklif' → TeklifBaslik durumu 'Onay Bekleniyor' ise 'Onaylandı'.
//        Tur 'AnalizTalep' → dbo.Talep durumu 'Yeni Talep'/'Numune Bekleniyor'
//                            ise 'Analiz Aşamasında'.
//        Tur 'DestekTalep' → durum geçişi YOK.
// ─────────────────────────────────────────────────────────────────────────────

const VALID_TUR = new Set(["Teklif", "AnalizTalep", "DestekTalep", "Dosya"]);

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu.";
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ evrakNo: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { evrakNo } = await params;
  if (!evrakNo) return Response.json({ error: "Evrak no gerekli" }, { status: 400 });

  try {
    const pool = await cosmoPool;

    // Teklif eşleştirmeleri (TeklifBaslik join)
    const teklifRes = await pool.request().input("e", evrakNo).query(`
      SELECT
        e.ID                            AS EslestirmeID,
        e.HedefID                       AS TeklifID,
        ISNULL(t.DisTeklifKodu, '')     AS DisTeklifKodu,
        ISNULL(t.TeklifNo, 0)           AS TeklifNo,
        ISNULL(t.RevNo, 0)              AS RevNo,
        ISNULL(t.TeklifDurum, '')       AS TeklifDurum,
        ISNULL(t.Toplam, 0)             AS Toplam,
        FORMAT(t.Tarih, 'dd.MM.yyyy')   AS Tarih,
        ISNULL(m.Firma_Adi, '')         AS MusteriAd,
        FORMAT(e.EslestirmeTarihi, 'dd.MM.yyyy HH:mm') AS EslestirmeTarihi,
        ISNULL(e.EslestirenAd, '')      AS EslestirenAd
      FROM NKR_EvrakEslestirme e
      LEFT JOIN TeklifBaslik t ON t.ID = e.HedefID
      LEFT JOIN Firma m ON m.ID = t.MusteriID
      WHERE e.EvrakNo = @e AND e.Tur = N'Teklif'
      ORDER BY e.ID DESC
    `);

    // Analiz Talep eşleştirmeleri (dbo.Talep join)
    const analizRes = await pool.request().input("e", evrakNo).query(`
      SELECT
        e.ID                            AS EslestirmeID,
        e.HedefID                       AS TalepID,
        COALESCE(t.DisTalepKodu, N'26' + CAST(t.TalepNo AS NVARCHAR(20))) AS TalepNo,
        N'26' + CAST(t.TalepNo AS NVARCHAR(20)) AS IcTakipNo,
        ISNULL(t.Durum, '')             AS Durum,
        FORMAT(t.Tarih, 'dd.MM.yyyy')   AS Tarih,
        ISNULL(f.Firma_Adi, '')         AS FirmaAd,
        FORMAT(e.EslestirmeTarihi, 'dd.MM.yyyy HH:mm') AS EslestirmeTarihi,
        ISNULL(e.EslestirenAd, '')      AS EslestirenAd
      FROM NKR_EvrakEslestirme e
      LEFT JOIN dbo.Talep t ON t.ID = e.HedefID
      LEFT JOIN Firma f ON f.Kod = t.FirmaKodu
      WHERE e.EvrakNo = @e AND e.Tur = N'AnalizTalep'
      ORDER BY e.ID DESC
    `);

    // Destek Talep eşleştirmeleri (dbo.Talep join)
    const destekRes = await pool.request().input("e", evrakNo).query(`
      SELECT
        e.ID                            AS EslestirmeID,
        e.HedefID                       AS TalepID,
        COALESCE(t.DisTalepKodu, N'26' + CAST(t.TalepNo AS NVARCHAR(20))) AS TalepNo,
        N'26' + CAST(t.TalepNo AS NVARCHAR(20)) AS IcTakipNo,
        ISNULL(t.Durum, '')             AS Durum,
        FORMAT(t.Tarih, 'dd.MM.yyyy')   AS Tarih,
        ISNULL(f.Firma_Adi, '')         AS FirmaAd,
        FORMAT(e.EslestirmeTarihi, 'dd.MM.yyyy HH:mm') AS EslestirmeTarihi,
        ISNULL(e.EslestirenAd, '')      AS EslestirenAd
      FROM NKR_EvrakEslestirme e
      LEFT JOIN dbo.Talep t ON t.ID = e.HedefID
      LEFT JOIN Firma f ON f.Kod = t.FirmaKodu
      WHERE e.EvrakNo = @e AND e.Tur = N'DestekTalep'
      ORDER BY e.ID DESC
    `);

    // Dosyalar (FileData hariç — sadece meta)
    const dosyaRes = await pool.request().input("e", evrakNo).query(`
      SELECT ID AS EslestirmeID,
             ISNULL(FileName, ISNULL(Aciklama, '(adsız)')) AS FileName,
             ISNULL(MimeType, '')                          AS MimeType,
             ISNULL(FileSize, 0)                           AS FileSize,
             ISNULL(EslestirenAd, '')                      AS EslestirenAd,
             FORMAT(EslestirmeTarihi, 'dd.MM.yyyy HH:mm')  AS EslestirmeTarihi
      FROM NKR_EvrakEslestirme
      WHERE EvrakNo = @e AND Tur = N'Dosya'
      ORDER BY ID DESC
    `);

    return Response.json({
      teklifler:        teklifRes.recordset,
      analizTalepleri:  analizRes.recordset,
      destekTalepleri:  destekRes.recordset,
      dosyalar:         dosyaRes.recordset,
    });
  } catch (e: unknown) {
    return Response.json({ error: errorMessage(e) }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ evrakNo: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const sessionUser = session.user as (typeof session.user & { userId?: string | number }) | undefined;
  const userId = sessionUser?.userId ?? null;
  const userName = sessionUser?.name || sessionUser?.email || null;

  const { evrakNo } = await params;
  if (!evrakNo) return Response.json({ error: "Evrak no gerekli" }, { status: 400 });

  try {
    const body = await request.json();
    const tur = String(body?.tur || "").trim();
    const hedefId = body?.hedefId ? Number(body.hedefId) : null;
    const hedefKod = body?.hedefKod ? String(body.hedefKod).slice(0, 100) : null;
    const aciklama = body?.aciklama ? String(body.aciklama).slice(0, 500) : null;

    if (!VALID_TUR.has(tur)) {
      return Response.json({ error: "Geçersiz tür." }, { status: 400 });
    }
    if (tur !== "Dosya" && !hedefId) {
      return Response.json({ error: "Hedef ID gerekli." }, { status: 400 });
    }

    const pool = await cosmoPool;
    const tx = await pool.transaction();
    await tx.begin();

    try {
      // Kontrol, kayıt ve durum geçişi birlikte başarılı olmalı. Aksi halde
      // kullanıcı hata görürken eşleştirme satırının tek başına kalması önlenir.
      if (tur !== "Dosya") {
        const exists = await tx.request()
          .input("e", evrakNo).input("t", tur).input("h", hedefId)
          .query(`SELECT TOP 1 ID FROM NKR_EvrakEslestirme WHERE EvrakNo = @e AND Tur = @t AND HedefID = @h`);
        if (exists.recordset.length > 0) {
          await tx.rollback();
          return Response.json({ error: "Bu kayıt zaten bu evraka eşleştirilmiş." }, { status: 409 });
        }
      }

      const ins = await tx.request()
        .input("e", evrakNo).input("t", tur).input("h", hedefId)
        .input("kod", hedefKod).input("ac", aciklama)
        .input("uid", userId ? Number(userId) : null).input("uad", userName)
        .query(`
          INSERT INTO NKR_EvrakEslestirme
            (EvrakNo, Tur, HedefID, HedefKod, Aciklama, EslestirenID, EslestirenAd, EslestirmeTarihi)
          OUTPUT INSERTED.ID
          VALUES (@e, @t, @h, @kod, @ac, @uid, @uad, GETDATE())
        `);

      // UPDATE ... OUTPUT, MySQL uyumluluk katmanında geçerli değildir. Önceki
      // durumu transaction içinde okuyup standart UPDATE sonucuyla doğruluyoruz.
      let durumDegisti: { tablo: string; eski: string; yeni: string } | null = null;
      if (tur === "Teklif" && hedefId) {
        const onceki = await tx.request().input("id", hedefId).query(`
          SELECT TeklifDurum AS Eski FROM TeklifBaslik
          WHERE ID = @id AND TeklifDurum = N'Onay Bekleniyor'
        `);
        const r = await tx.request().input("id", hedefId).query(`
          UPDATE TeklifBaslik SET TeklifDurum = N'Onaylandı'
          WHERE ID = @id AND TeklifDurum = N'Onay Bekleniyor'
        `);
        if (r.rowsAffected[0] > 0 && onceki.recordset[0]) {
          durumDegisti = { tablo: "TeklifBaslik", eski: String(onceki.recordset[0].Eski), yeni: "Onaylandı" };
        }
      } else if (tur === "AnalizTalep" && hedefId) {
        const onceki = await tx.request().input("id", hedefId).query(`
          SELECT Durum AS Eski FROM dbo.Talep
          WHERE ID = @id AND Durum IN (N'Yeni Talep', N'Numune Bekleniyor')
        `);
        const r = await tx.request().input("id", hedefId).query(`
          UPDATE dbo.Talep SET Durum = N'Analiz Aşamasında'
          WHERE ID = @id AND Durum IN (N'Yeni Talep', N'Numune Bekleniyor')
        `);
        if (r.rowsAffected[0] > 0 && onceki.recordset[0]) {
          durumDegisti = { tablo: "dbo.Talep", eski: String(onceki.recordset[0].Eski), yeni: "Analiz Aşamasında" };
        }
      }

      await tx.commit();
      return Response.json({
        success: true,
        id: ins.recordset[0]?.ID ?? null,
        durumDegisti,
      });
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  } catch (e: unknown) {
    return Response.json({ error: errorMessage(e) }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ evrakNo: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { evrakNo } = await params;
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("id"));
  if (!evrakNo || !id) return Response.json({ error: "Geçersiz parametre." }, { status: 400 });

  try {
    const pool = await cosmoPool;
    await pool.request().input("e", evrakNo).input("id", id)
      .query(`DELETE FROM NKR_EvrakEslestirme WHERE EvrakNo = @e AND ID = @id`);
    return Response.json({ success: true });
  } catch (e: unknown) {
    return Response.json({ error: errorMessage(e) }, { status: 500 });
  }
}
