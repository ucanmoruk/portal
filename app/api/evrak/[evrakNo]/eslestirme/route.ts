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

    // Dosyalar
    const dosyaRes = await pool.request().input("e", evrakNo).query(`
      SELECT ID AS EslestirmeID, Aciklama, ISNULL(EslestirenAd, '') AS EslestirenAd,
             FORMAT(EslestirmeTarihi, 'dd.MM.yyyy HH:mm') AS EslestirmeTarihi
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
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ evrakNo: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const userId = (session.user as any)?.userId ?? null;
  const userName = (session.user as any)?.name || (session.user as any)?.email || null;

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

    // Aynı eşleştirme var mı? (Dosya hariç)
    if (tur !== "Dosya") {
      const exists = await pool.request()
        .input("e", evrakNo).input("t", tur).input("h", hedefId)
        .query(`SELECT TOP 1 ID FROM NKR_EvrakEslestirme WHERE EvrakNo = @e AND Tur = @t AND HedefID = @h`);
      if (exists.recordset.length > 0) {
        return Response.json({ error: "Bu kayıt zaten bu evraka eşleştirilmiş." }, { status: 409 });
      }
    }

    // INSERT
    const ins = await pool.request()
      .input("e", evrakNo).input("t", tur).input("h", hedefId)
      .input("kod", hedefKod).input("ac", aciklama)
      .input("uid", userId ? parseInt(userId) : null).input("uad", userName)
      .query(`
        INSERT INTO NKR_EvrakEslestirme (EvrakNo, Tur, HedefID, HedefKod, Aciklama, EslestirenID, EslestirenAd)
        OUTPUT INSERTED.ID
        VALUES (@e, @t, @h, @kod, @ac, @uid, @uad)
      `);

    // ── Durum geçişleri ──
    let durumDegisti: { tablo: string; eski: string; yeni: string } | null = null;
    if (tur === "Teklif" && hedefId) {
      // 'Onay Bekleniyor' → 'Onaylandı'
      const r = await pool.request().input("id", hedefId).query(`
        UPDATE TeklifBaslik SET TeklifDurum = N'Onaylandı'
        OUTPUT DELETED.TeklifDurum AS Eski, INSERTED.TeklifDurum AS Yeni
        WHERE ID = @id AND TeklifDurum = N'Onay Bekleniyor'
      `);
      if (r.recordset[0]) durumDegisti = { tablo: "TeklifBaslik", eski: r.recordset[0].Eski, yeni: r.recordset[0].Yeni };
    } else if (tur === "AnalizTalep" && hedefId) {
      // 'Yeni Talep' veya 'Numune Bekleniyor' → 'Analiz Aşamasında'
      const r = await pool.request().input("id", hedefId).query(`
        UPDATE dbo.Talep SET Durum = N'Analiz Aşamasında'
        OUTPUT DELETED.Durum AS Eski, INSERTED.Durum AS Yeni
        WHERE ID = @id AND Durum IN (N'Yeni Talep', N'Numune Bekleniyor')
      `);
      if (r.recordset[0]) durumDegisti = { tablo: "dbo.Talep", eski: r.recordset[0].Eski, yeni: r.recordset[0].Yeni };
    }

    return Response.json({
      success: true,
      id: ins.recordset[0]?.ID ?? null,
      durumDegisti,
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
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
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
