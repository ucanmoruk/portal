import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { type NextRequest } from "next/server";

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
  "Gorunum",
  "Renk",
  "Koku",
  "PH",
  "Yogunluk",
  "Viskozite",
  "Kaynama",
  "Erime",
  "SudaCozunebilirlik",
  "DigerCozunebilirlik",
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

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const search = sp.get("search")?.trim() || "";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(5, parseInt(sp.get("limit") || "10", 10)));
  const offset = (page - 1) * limit;

  try {
    const pool = await poolPromise;
    let whereClauses: string[] = ["l.Durum = 'Aktif'", "l.BirimID = '1005'"];

    if (search) {
      whereClauses.push(`(
        l.Urun LIKE N'%' + @search + '%'
        OR l.Barkod LIKE N'%' + @search + '%'
        OR t.Ad LIKE N'%' + @search + '%'
      )`);
    }

    const where = `WHERE ${whereClauses.join(" AND ")}`;

    const req = pool.request()
        .input("search", search)
        .input("offset", offset)
        .input("limit", limit);

    const countResult = await req.query(`
        SELECT COUNT(*) as total FROM rUGDListe l
        LEFT JOIN RootTedarikci t ON l.FirmaID = t.ID
        ${where}
    `);
    const total = countResult.recordset[0].total;

    const dataResult = await req.query(`
        SELECT l.Tarih, l.RaporNo, l.Versiyon, t.Ad as 'Firma', t.ID as 'FirmaID',
        l.Barkod, l.Urun, l.Miktar, l.Tip1, l.Tip2, g.UrunTipi,
        (l.Tip1 + ' - ' + g.UrunTipi) as 'UrunTipiFull',
        l.A as 'ADegeri', l.RaporDurum as 'DurumLabel', l.ID 
        FROM rUGDListe l 
        LEFT JOIN RootTedarikci t ON l.FirmaID = t.ID
        LEFT JOIN rUGDTip g ON NULLIF(l.Tip2, '')::int = g.ID 
        ${where}
        ORDER BY l.ID DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    return Response.json({
      data: dataResult.recordset,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ----------------------------------------------------------------
// POST /api/urunler (Yeni Ürün Ekle)
// ----------------------------------------------------------------
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  try {
    const body = await request.json();
    const { 
      Tarih, RaporNo, Versiyon, FirmaID, Barkod, Urun, UrunEn, Miktar, 
      Tip1, Tip2, Uygulama, Hedef, A, RaporDurum 
    } = body;

    const pool = await poolPromise;
    const result = await pool.request()
      .input("Tarih", Tarih || null)
      .input("RaporNo", RaporNo || null)
      .input("Versiyon", Versiyon || null)
      .input("FirmaID", FirmaID || null)
      .input("Barkod", Barkod || null)
      .input("Urun", Urun || null)
      .input("UrunEn", UrunEn || null)
      .input("Miktar", Miktar || null)
      .input("Tip1", Tip1 || null)
      .input("Tip2", Tip2 || null)
      .input("Uygulama", Uygulama || null)
      .input("Hedef", Hedef || "Yetişkinler")
      .input("A", A || null)
      .input("RaporDurum", RaporDurum || "Tamamlandı")
      .input("Durum", "Aktif")
      .input("BirimID", "1005")
      .query(`
        INSERT INTO rUGDListe (
          Tarih, RaporNo, Versiyon, FirmaID, Barkod, Urun, UrunEn, Miktar,
          Tip1, Tip2, Uygulama, Hedef, A, RaporDurum, Durum, BirimID
        )
        OUTPUT INSERTED.ID
        VALUES (
          @Tarih, @RaporNo, @Versiyon, @FirmaID, @Barkod, @Urun, @UrunEn, @Miktar,
          @Tip1, @Tip2, @Uygulama, @Hedef, @A, @RaporDurum, @Durum, @BirimID
        )
      `);

    const newId = result.recordset[0]?.ID ?? null;
    if (newId) await saveRaporTexts(pool, Number(newId), body);
    return Response.json({ message: "Başarıyla eklendi", id: newId });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
