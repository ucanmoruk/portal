import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

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
    const pool = await poolPromise;

    const headerRes = await pool.request()
      .input("ID", Number(id))
      .query(`
        SELECT
          t.ID, t.TeklifNo, t.RevNo,
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
          ISNULL(t.GenelIskonto, 0)                AS GenelIskonto
        FROM TeklifX1 t
        LEFT JOIN RootTedarikci m ON m.ID = t.MusteriID
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
        FROM TeklifX2
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

  const VALID = ["Taslak", "Gönderildi", "Onaylandı", "Reddedildi"];
  const body = await request.json();
  const { teklifDurum } = body;

  if (!VALID.includes(teklifDurum)) {
    return Response.json({ error: "Geçersiz durum." }, { status: 400 });
  }

  try {
    const pool = await poolPromise;
    await pool.request()
      .input("ID",          Number(id))
      .input("TeklifDurum", teklifDurum)
      .query(`UPDATE TeklifX1 SET TeklifDurum = @TeklifDurum WHERE ID = @ID`);
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

  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return Response.json({ error: "Geçersiz ID" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { musteriId, satirlar, notlar, teklifKonusu, teklifVeren, kdvOran, genelIskonto } = body;

    if (!musteriId) {
      return Response.json({ error: "Müşteri seçimi zorunludur." }, { status: 400 });
    }
    if (!Array.isArray(satirlar) || satirlar.length === 0) {
      return Response.json({ error: "En az bir hizmet eklemelisiniz." }, { status: 400 });
    }

    const toplam = satirlar.reduce((sum: number, s: any) => {
      const adet = parseInt(s.adet) || 1;
      return sum + adet * (parseFloat(s.fiyat) || 0) * (1 - (parseFloat(s.iskonto) || 0) / 100);
    }, 0);

    const pool     = await poolPromise;
    const teklifId = Number(id);

    await pool.request()
      .input("ID",           teklifId)
      .input("MusteriID",    Number(musteriId))
      .input("Toplam",       parseFloat(toplam.toFixed(2)))
      .input("Notlar",       notlar        || null)
      .input("TeklifKonusu", teklifKonusu  || "Fiyat teklifimiz")
      .input("TeklifVeren",   teklifVeren   || null)
      .input("KdvOran",       parseInt(kdvOran) || 20)
      .input("GenelIskonto",  parseFloat(genelIskonto) || 0)
      .query(`
        UPDATE TeklifX1
        SET MusteriID = @MusteriID, Toplam = @Toplam, Notlar = @Notlar,
            TeklifKonusu = @TeklifKonusu, TeklifVeren = @TeklifVeren,
            KdvOran = @KdvOran, GenelIskonto = @GenelIskonto
        WHERE ID = @ID
      `);

    await pool.request()
      .input("TeklifID", teklifId)
      .query(`DELETE FROM TeklifX2 WHERE TeklifID = @TeklifID`);

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
          INSERT INTO TeklifX2 (TeklifID, HizmetID, HizmetAdi, Adet, Metot, Akreditasyon, Fiyat, ParaBirimi, Iskonto, Notlar)
          VALUES (@TeklifID, @HizmetID, @HizmetAdi, @Adet, @Metot, @Akreditasyon, @Fiyat, @ParaBirimi, @Iskonto, @Notlar)
        `);
    }

    return Response.json({ success: true });
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
    const pool = await poolPromise;
    await pool.request()
      .input("ID", Number(id))
      .query(`UPDATE TeklifX1 SET Durum = 'Pasif' WHERE ID = @ID`);
    return Response.json({ success: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
