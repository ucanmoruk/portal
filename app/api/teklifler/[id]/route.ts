import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { writeInternalTeklifLog, teklifNoLabel, clientIpFromRequest } from "@/lib/teklifLog";

// Notlar kolonu icerigi: oncelikli olarak Kisa Aciklama (diger portal tb.Notlar'i
// kisa aciklama olarak okuyor). Teklif Notu doluysa kisa aciklamanin altina eklenir.
// Idempotent: teklifNotu zaten "kisaAciklama\n\n..." prefix'i ile geliyorsa cift yazmaz.
function composeNotlar(kisaAciklama: any, teklifNotu: any): string | null {
  const k = String(kisaAciklama ?? "").trim() || "Fiyat teklifimiz";
  let n = String(teklifNotu ?? "").trim();
  if (n.startsWith(k + "\n\n")) n = n.slice(k.length + 2).trim();
  else if (n === k) n = "";
  return n ? `${k}\n\n${n}` : k;
}

// ----------------------------------------------------------------
// GET  /api/teklifler/[id]  — header + satirlar
// ----------------------------------------------------------------
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return Response.json({ error: "Geçersiz ID" }, { status: 400 });
  }

  try {
    const pool = await cosmoPool;

    const headerRes = await pool.request()
      .input("ID", Number(id))
      .query(`
        SELECT
          t.ID, t.TeklifNo, t.DisTeklifKodu, t.RevNo,
          t.MusteriID,
          ISNULL(m.Ad,'')           AS MusteriAd,
          ISNULL(m.Email,'')        AS MusteriEmail,
          ISNULL(m.Telefon,'')      AS MusteriTelefon,
          ISNULL(m.Adres,'')        AS MusteriAdres,
          ISNULL(m.VergiDairesi,'') AS VergiDairesi,
          ISNULL(m.VergiNo,'')      AS VergiNo,
          ISNULL(m.Yetkili,'')      AS MusteriYetkili,
          FORMAT(t.Tarih, 'dd.MM.yyyy') AS Tarih,
          t.Toplam, t.Notlar, t.Durum,
          ISNULL(t.TeklifDurum,  'Taslak')         AS TeklifDurum,
          ISNULL(t.TeklifKonusu, 'Fiyat teklifimiz') AS TeklifKonusu,
          ISNULL(t.TeklifVeren,  '')               AS TeklifVeren,
          ISNULL(t.KdvOran, 20)                    AS KdvOran,
          ISNULL(t.GenelIskonto, 0)                AS GenelIskonto,
          ISNULL(t.KisaAciklama, '')               AS KisaAciklama
        FROM TeklifBaslik t
        LEFT JOIN (SELECT ID, Firma_Adi AS Ad, Adres, Mail AS Email, Telefon, Vergi_Dairesi AS VergiDairesi, Vergi_No AS VergiNo, Yetkili FROM Firma) m ON m.ID = t.MusteriID
        WHERE t.ID = @ID
      `);

    if (!headerRes.recordset.length) {
      return Response.json({ error: "Teklif bulunamadı" }, { status: 404 });
    }

    const satirRes = await pool.request()
      .input("TeklifID", Number(id))
      .query(`
        SELECT ID, HizmetID, HizmetAdi,
               ISNULL(Adet,1)   AS Adet,
               ISNULL(Metot,'') AS Metot,
               ISNULL(Akreditasyon,'') AS Akreditasyon,
               Fiyat, ParaBirimi, Iskonto, Notlar
        FROM TeklifKalem
        WHERE TeklifID = @TeklifID
        ORDER BY ID
      `);

    return Response.json({
      header:   headerRes.recordset[0],
      satirlar: satirRes.recordset,
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ----------------------------------------------------------------
// PATCH /api/teklifler/[id]  — sadece TeklifDurum güncelle
// ----------------------------------------------------------------
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return Response.json({ error: "Geçersiz ID" }, { status: 400 });
  }

  const VALID = ["Taslak", "Onay Bekleniyor", "Onaylandı", "Reddedildi", "Gönderildi"];
  const body = await request.json();
  const { teklifDurum } = body;

  if (!VALID.includes(teklifDurum)) {
    return Response.json({ error: "Geçersiz durum." }, { status: 400 });
  }

  try {
    const pool = await cosmoPool;
    await pool.request()
      .input("ID",          Number(id))
      .input("TeklifDurum", teklifDurum)
      .query(`UPDATE TeklifBaslik SET TeklifDurum = @TeklifDurum WHERE ID = @ID`);
    return Response.json({ success: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ----------------------------------------------------------------
// PUT  /api/teklifler/[id]  — teklif güncelle
// ----------------------------------------------------------------
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  const userId = (session.user as any)?.userId ?? null;
  const userName = (session.user as any)?.name || (session.user as any)?.email || "";

  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return Response.json({ error: "Geçersiz ID" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const {
      musteriId, satirlar, notlar, teklifKonusu, kisaAciklama, teklifVeren, kdvOran, genelIskonto,
      isRevision = false,         // Yeni: revizyon mı düzeltme mi
      revisionReason = "",        // Yeni: revizyon açıklaması
    } = body;

    if (!musteriId) {
      return Response.json({ error: "Müşteri seçimi zorunludur." }, { status: 400 });
    }
    if (!Array.isArray(satirlar) || satirlar.length === 0) {
      return Response.json({ error: "En az bir hizmet eklemelisiniz." }, { status: 400 });
    }
    if (isRevision && !String(revisionReason).trim()) {
      return Response.json({ error: "Revizyon için açıklama zorunludur." }, { status: 400 });
    }

    const toplam = satirlar.reduce((sum: number, s: any) => {
      const adet = parseInt(s.adet) || 1;
      return sum + adet * (parseFloat(s.fiyat) || 0) * (1 - (parseFloat(s.iskonto) || 0) / 100);
    }, 0);

    const pool     = await cosmoPool;
    const teklifId = Number(id);

    // Mevcut TeklifNo + RevNo'yu al (log için)
    const curRes = await pool.request()
      .input("ID", teklifId)
      .query(`SELECT TeklifNo, ISNULL(RevNo, 0) AS RevNo FROM TeklifBaslik WHERE ID = @ID`);
    if (!curRes.recordset.length) {
      return Response.json({ error: "Teklif bulunamadı" }, { status: 404 });
    }
    const currentTeklifNo: number | null = curRes.recordset[0].TeklifNo ?? null;
    const currentRev: number = Number(curRes.recordset[0].RevNo) || 0;
    const nextRev = isRevision ? currentRev + 1 : currentRev;

    await pool.request()
      .input("ID",           teklifId)
      .input("MusteriID",    Number(musteriId))
      .input("Toplam",       parseFloat(toplam.toFixed(2)))
      .input("Notlar",       composeNotlar(kisaAciklama, notlar))
      .input("TeklifKonusu", teklifKonusu  || "Fiyat teklifimiz")
      .input("KisaAciklama", kisaAciklama  || "Fiyat teklifimiz")
      .input("TeklifVeren",   teklifVeren   || null)
      .input("KdvOran",       parseInt(kdvOran) || 20)
      .input("GenelIskonto",  parseFloat(genelIskonto) || 0)
      .input("RevNo",        nextRev)
      .query(`
        UPDATE TeklifBaslik
        SET MusteriID = @MusteriID, Toplam = @Toplam, Notlar = @Notlar,
            TeklifKonusu = @TeklifKonusu, KisaAciklama = @KisaAciklama, TeklifVeren = @TeklifVeren,
            KdvOran = @KdvOran, GenelIskonto = @GenelIskonto,
            RevNo = @RevNo
        WHERE ID = @ID
      `);

    await pool.request()
      .input("TeklifID", teklifId)
      .query(`DELETE FROM TeklifKalem WHERE TeklifID = @TeklifID`);

    for (const s of satirlar) {
      await pool.request()
        .input("TeklifID",   teklifId)
        .input("HizmetID",    s.hizmetId      || null)
        .input("HizmetAdi",   s.hizmetAdi     || "")
        .input("Adet",        parseInt(s.adet) || 1)
        .input("Metot",       s.metot         || null)
        .input("Akreditasyon",s.akreditasyon  || null)
        .input("Fiyat",       parseFloat(s.fiyat)   || 0)
        .input("ParaBirimi",  s.paraBirimi    || "TRY")
        .input("Iskonto",     parseFloat(s.iskonto) || 0)
        .input("Notlar",      s.notlar        || null)
        .query(`
          INSERT INTO TeklifKalem (TeklifID, HizmetID, HizmetAdi, Adet, Metot, Akreditasyon, Fiyat, ParaBirimi, Iskonto, Notlar)
          VALUES (@TeklifID, @HizmetID, @HizmetAdi, @Adet, @Metot, @Akreditasyon, @Fiyat, @ParaBirimi, @Iskonto, @Notlar)
        `);
    }

    // Log: Revize veya Düzeltildi
    try {
      await writeInternalTeklifLog({
        teklifId,
        teklifNo: teklifNoLabel(currentTeklifNo, nextRev),
        aksiyon: isRevision ? "Revize" : "Düzeltildi",
        aciklama: isRevision ? String(revisionReason).trim() : null,
        kullaniciId: userId ? parseInt(userId) : null,
        kullaniciAd: userName,
        ipAdresi: clientIpFromRequest(request.headers),
      });
    } catch (logErr) {
      console.error("[teklif log] PUT logu yazılamadı:", logErr);
    }

    return Response.json({ success: true, revNo: nextRev });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ----------------------------------------------------------------
// DELETE  /api/teklifler/[id]  — soft delete
// ----------------------------------------------------------------
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return Response.json({ error: "Geçersiz ID" }, { status: 400 });
  }

  try {
    const pool = await cosmoPool;
    await pool.request()
      .input("ID", Number(id))
      .query(`UPDATE TeklifBaslik SET Durum = 'Pasif' WHERE ID = @ID`);
    return Response.json({ success: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
