import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

const RAPOR_TEXT_FIELDS = [
  "NormalKullanim",
  "MaruziyetAciklama",
  "BilesenlereMaruziyet",
  "ToksikolojikProfil",
  "IstenmedEtkiler",
  "UrunBilgisi",
  "DegerlendirmeSonucu",
  "EtiketUyarilariB2",
  "Gerekce",
  "SorumluAd",
  "SorumluAdres",
  "SorumluKanit",
  "Kullanim",
  "Ozellikler",
  "Uyarilar",
  "Mikrobiyoloji",
  "MikrobiyolojiDurum",
  "MikrobiyolojiGorsel",
  "KoruyucuEtkinlik",
  "KoruyucuEtkinlikDurum",
  "KoruyucuEtkinlikGorsel",
  "Stabilite",
  "StabiliteDurum",
  "StabiliteRafOmruAy",
  "StabiliteAcilisAy",
  "StabiliteGorsel",
  "EtiketGorsel",
];

async function saveRaporTexts(pool: any, urunId: number, body: any) {
  await pool.request()
    .input("UrunID", urunId)
    .query(`DELETE FROM rUGDRaporMetinleri WHERE UrunID = @UrunID`);

  for (const field of RAPOR_TEXT_FIELDS) {
    const tr = body[field] ?? "";
    const en = body[`${field}En`] ?? "";
    for (const [dil, metin] of [["tr", tr], ["en", en]] as const) {
      await pool.request()
        .input("UrunID", urunId)
        .input("Alan", field)
        .input("Dil", dil)
        .input("Metin", metin)
        .query(`
          INSERT INTO rUGDRaporMetinleri (UrunID, Alan, Dil, Metin, UpdatedAt)
          VALUES (@UrunID, @Alan, @Dil, @Metin, GETDATE())
        `);
    }
  }
}

// ----------------------------------------------------------------
// GET /api/urunler/[id] (Ürün Detay)
// ----------------------------------------------------------------
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("id", id)
      .query(`
        SELECT l.ID, l.Tarih, l.RaporNo, l.Versiyon, l.FirmaID,
               l.Barkod, l.Urun, l.UrunEn, l.Miktar, l.Tip1, l.Tip2,
               l.Uygulama, l.Hedef, l.A, l.RaporDurum
        FROM rUGDListe l
        WHERE l.ID = @id AND l.Durum = 'Aktif'
      `);

    if (!result.recordset[0]) return Response.json({ error: "Kayıt bulunamadı" }, { status: 404 });
    const row = result.recordset[0];
    const textResult = await pool.request()
      .input("UrunID", id)
      .query(`SELECT Alan, Dil, Metin FROM rUGDRaporMetinleri WHERE UrunID = @UrunID`);

    for (const item of textResult.recordset) {
      const key = item.Dil === "en" ? `${item.Alan}En` : item.Alan;
      row[key] = item.Metin ?? "";
    }

    return Response.json(row);
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ----------------------------------------------------------------
// PUT /api/urunler/[id] (Ürün Güncelle)
// ----------------------------------------------------------------
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const body = await request.json();
    const { Tarih, RaporNo, Versiyon, FirmaID, Barkod, Urun, Miktar, Tip1, Tip2, A, RaporDurum } = body;

    const pool = await poolPromise;
    await pool.request()
      .input("id", id)
      .input("Tarih", Tarih || null)
      .input("RaporNo", RaporNo || null)
      .input("Versiyon", Versiyon || null)
      .input("FirmaID", FirmaID || null)
      .input("Barkod", Barkod || null)
      .input("Urun", Urun || null)
      .input("Miktar", Miktar || null)
      .input("Tip1", Tip1 || null)
      .input("Tip2", Tip2 || null)
      .input("A", A || null)
      .input("RaporDurum", RaporDurum || null)
      .query(`
        UPDATE rUGDListe
        SET Tarih = @Tarih, RaporNo = @RaporNo, Versiyon = @Versiyon, FirmaID = @FirmaID,
            Barkod = @Barkod, Urun = @Urun, Miktar = @Miktar, Tip1 = @Tip1,
            Tip2 = @Tip2, A = @A, RaporDurum = @RaporDurum
        WHERE ID = @id
      `);

    await saveRaporTexts(pool, Number(id), body);

    return Response.json({ message: "Başarıyla güncellendi" });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ----------------------------------------------------------------
// DELETE /api/urunler/[id] (Soft Delete)
// ----------------------------------------------------------------
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const pool = await poolPromise;
    await pool.request()
      .input("id", id)
      .query("UPDATE rUGDListe SET Durum = 'Pasif' WHERE ID = @id");

    return Response.json({ message: "Başarıyla silindi (pasif yapıldı)" });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
