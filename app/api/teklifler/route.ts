import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { type NextRequest } from "next/server";

async function ensureTables() {
  const pool = await poolPromise;

  // TeklifX1 — oluştur (TeklifNo INT: YYNNNN formatında)
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='TeklifX1' AND xtype='U')
    CREATE TABLE TeklifX1 (
      ID        INT IDENTITY(1,1) PRIMARY KEY,
      TeklifNo  INT           NULL,
      RevNo     INT           NOT NULL DEFAULT 0,
      MusteriID INT           NULL,
      Tarih     DATETIME      NOT NULL DEFAULT GETDATE(),
      Toplam    DECIMAL(18,2) NOT NULL DEFAULT 0,
      Notlar    NVARCHAR(MAX) NULL,
      Durum     NVARCHAR(20)  NOT NULL DEFAULT 'Aktif',
      KID       INT           NULL
    )
  `);

  // TeklifX1 — eksik kolon migrasyonu
  const cols1 = await pool.request().query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'TeklifX1'
  `);
  const c1 = new Set(cols1.recordset.map((r: any) => r.COLUMN_NAME as string));
  if (!c1.has("RevNo"))         await pool.request().query(`ALTER TABLE TeklifX1 ADD RevNo         INT           NOT NULL DEFAULT 0`);
  if (!c1.has("MusteriID"))     await pool.request().query(`ALTER TABLE TeklifX1 ADD MusteriID     INT           NULL`);
  if (!c1.has("Tarih"))         await pool.request().query(`ALTER TABLE TeklifX1 ADD Tarih         DATETIME      NOT NULL DEFAULT GETDATE()`);
  if (!c1.has("Toplam"))        await pool.request().query(`ALTER TABLE TeklifX1 ADD Toplam        DECIMAL(18,2) NOT NULL DEFAULT 0`);
  if (!c1.has("Notlar"))        await pool.request().query(`ALTER TABLE TeklifX1 ADD Notlar        NVARCHAR(MAX) NULL`);
  if (!c1.has("Durum"))         await pool.request().query(`ALTER TABLE TeklifX1 ADD Durum         NVARCHAR(20)  NOT NULL DEFAULT 'Aktif'`);
  if (!c1.has("KID"))           await pool.request().query(`ALTER TABLE TeklifX1 ADD KID           INT           NULL`);
  if (!c1.has("TeklifDurum"))   await pool.request().query(`ALTER TABLE TeklifX1 ADD TeklifDurum   NVARCHAR(20)  NOT NULL DEFAULT 'Taslak'`);
  if (!c1.has("KdvOran"))       await pool.request().query(`ALTER TABLE TeklifX1 ADD KdvOran       INT           NOT NULL DEFAULT 20`);
  if (!c1.has("TeklifKonusu"))  await pool.request().query(`ALTER TABLE TeklifX1 ADD TeklifKonusu  NVARCHAR(500) NULL`);
  if (!c1.has("TeklifVeren"))   await pool.request().query(`ALTER TABLE TeklifX1 ADD TeklifVeren   NVARCHAR(200) NULL`);
  if (!c1.has("GenelIskonto")) await pool.request().query(`ALTER TABLE TeklifX1 ADD GenelIskonto  DECIMAL(5,2)  NOT NULL DEFAULT 0`);

  // TeklifX2 — oluştur
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='TeklifX2' AND xtype='U')
    CREATE TABLE TeklifX2 (
      ID         INT IDENTITY(1,1) PRIMARY KEY,
      TeklifID   INT           NOT NULL,
      HizmetID   INT           NULL,
      HizmetAdi  NVARCHAR(200) NULL,
      Fiyat      DECIMAL(18,2) NOT NULL DEFAULT 0,
      ParaBirimi NVARCHAR(10)  NOT NULL DEFAULT 'TRY',
      Iskonto    DECIMAL(5,2)  NOT NULL DEFAULT 0,
      Notlar     NVARCHAR(500) NULL
    )
  `);

  // TeklifX2 — eksik kolon migrasyonu
  const cols2 = await pool.request().query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'TeklifX2'
  `);
  const c2 = new Set(cols2.recordset.map((r: any) => r.COLUMN_NAME as string));
  if (!c2.has("TeklifID"))    await pool.request().query(`ALTER TABLE TeklifX2 ADD TeklifID    INT           NOT NULL DEFAULT 0`);
  if (!c2.has("HizmetID"))    await pool.request().query(`ALTER TABLE TeklifX2 ADD HizmetID    INT           NULL`);
  if (!c2.has("HizmetAdi"))   await pool.request().query(`ALTER TABLE TeklifX2 ADD HizmetAdi   NVARCHAR(200) NULL`);
  if (!c2.has("Adet"))        await pool.request().query(`ALTER TABLE TeklifX2 ADD Adet        INT           NOT NULL DEFAULT 1`);
  if (!c2.has("Metot"))       await pool.request().query(`ALTER TABLE TeklifX2 ADD Metot       NVARCHAR(200) NULL`);
  if (!c2.has("Akreditasyon"))await pool.request().query(`ALTER TABLE TeklifX2 ADD Akreditasyon NVARCHAR(10)  NULL`);
  if (!c2.has("Fiyat"))       await pool.request().query(`ALTER TABLE TeklifX2 ADD Fiyat       DECIMAL(18,2) NOT NULL DEFAULT 0`);
  if (!c2.has("ParaBirimi"))  await pool.request().query(`ALTER TABLE TeklifX2 ADD ParaBirimi  NVARCHAR(10)  NOT NULL DEFAULT 'TRY'`);
  if (!c2.has("Iskonto"))     await pool.request().query(`ALTER TABLE TeklifX2 ADD Iskonto     DECIMAL(5,2)  NOT NULL DEFAULT 0`);
  if (!c2.has("Notlar"))      await pool.request().query(`ALTER TABLE TeklifX2 ADD Notlar      NVARCHAR(500) NULL`);
}

// Yıla göre sıradaki TeklifNo'yu üretir: YYNNNN (örn. 260001)
async function nextTeklifNo(pool: any): Promise<number> {
  const year2   = new Date().getFullYear() % 100;   // 26
  const yearMin = year2 * 10000;                     // 260000
  const yearMax = yearMin + 9999;                    // 269999
  const res = await pool.request()
    .input("yearMin", yearMin)
    .input("yearMax", yearMax)
    .query(`
      SELECT ISNULL(MAX(TeklifNo), @yearMin) + 1 AS nextNo
      FROM TeklifX1
      WHERE TeklifNo >= @yearMin AND TeklifNo <= @yearMax
    `);
  return res.recordset[0].nextNo as number;
}

// Satırları TeklifX2'ye ekler
async function insertSatirlar(pool: any, teklifId: number, satirlar: any[]) {
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
}

function calcToplam(satirlar: any[]): number {
  return satirlar.reduce((sum: number, s: any) => {
    const adet = parseInt(s.adet) || 1;
    const f    = parseFloat(s.fiyat)   || 0;
    const i    = parseFloat(s.iskonto) || 0;
    return sum + adet * f * (1 - i / 100);
  }, 0);
}

// ----------------------------------------------------------------
// GET  /api/teklifler?search=&page=1&limit=20
// ----------------------------------------------------------------
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  await ensureTables();

  const sp     = request.nextUrl.searchParams;
  const search = sp.get("search")?.trim() || "";
  const page   = Math.max(1, parseInt(sp.get("page")  || "1",  10));
  const limit  = Math.min(100, Math.max(5, parseInt(sp.get("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  try {
    const pool = await poolPromise;
    const searchClause = search
      ? `AND (
           LOWER(ISNULL(m.Ad,'')) LIKE LOWER(@searchLike)
        OR LOWER(ISNULL(t.Notlar,'')) LIKE LOWER(@searchLike)
        OR CAST(ISNULL(t.TeklifNo,0) AS NVARCHAR) LIKE N'%'+@search+'%'
        )`
      : "";

    const countRes = await pool.request()
      .input("search", search)
      .input("searchLike", `%${search}%`)
      .query(`
        SELECT COUNT(*) AS total
        FROM TeklifX1 t
        LEFT JOIN RootTedarikci m ON m.ID = t.MusteriID
        WHERE t.Durum = 'Aktif' ${searchClause}
      `);

    const dataRes = await pool.request()
      .input("search", search)
      .input("searchLike", `%${search}%`)
      .input("offset", offset)
      .input("limit",  limit)
      .query(`
        SELECT
          t.ID,
          t.TeklifNo,
          t.RevNo,
          FORMAT(t.Tarih, 'dd.MM.yyyy') AS Tarih,
          t.MusteriID,
          ISNULL(m.Ad, '') AS MusteriAd,
          t.Toplam, t.Notlar, t.Durum,
          ISNULL(t.TeklifDurum, 'Taslak') AS TeklifDurum,
          COUNT(x2.ID) AS HizmetSayisi
        FROM TeklifX1 t
        LEFT JOIN RootTedarikci m ON m.ID = t.MusteriID
        LEFT JOIN TeklifX2 x2 ON x2.TeklifID = t.ID
        WHERE t.Durum = 'Aktif' ${searchClause}
        GROUP BY t.ID, t.TeklifNo, t.RevNo, t.Tarih, t.MusteriID, m.Ad, t.Toplam, t.Notlar, t.Durum, t.TeklifDurum
        ORDER BY t.ID DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    const total = countRes.recordset[0].total;
    return Response.json({
      data: dataRes.recordset,
      total, page, limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ----------------------------------------------------------------
// POST /api/teklifler
//   Normal: { musteriId, satirlar, notlar }
//   Revizyon: { musteriId, satirlar, notlar, revizeOfId: number }
// ----------------------------------------------------------------
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  const userId = (session.user as any)?.userId ?? null;

  await ensureTables();

  try {
    const body = await request.json();
    const { musteriId, satirlar, notlar, revizeOfId, teklifKonusu, teklifVeren, kdvOran, genelIskonto } = body;

    if (!musteriId) {
      return Response.json({ error: "Müşteri seçimi zorunludur." }, { status: 400 });
    }
    if (!Array.isArray(satirlar) || satirlar.length === 0) {
      return Response.json({ error: "En az bir hizmet eklemelisiniz." }, { status: 400 });
    }

    const toplam = calcToplam(satirlar);
    const pool   = await poolPromise;

    let teklifNo: number;
    let revNo   = 0;

    if (revizeOfId) {
      // Revizyon: orijinal teklif numarasını al, RevNo'yu bir artır
      const origRes = await pool.request()
        .input("OrigID", Number(revizeOfId))
        .query(`SELECT TeklifNo FROM TeklifX1 WHERE ID = @OrigID`);

      if (!origRes.recordset.length) {
        return Response.json({ error: "Revize edilecek teklif bulunamadı." }, { status: 404 });
      }
      teklifNo = origRes.recordset[0].TeklifNo as number;

      const maxRevRes = await pool.request()
        .input("TeklifNo", teklifNo)
        .query(`SELECT ISNULL(MAX(RevNo), 0) + 1 AS nextRevNo FROM TeklifX1 WHERE TeklifNo = @TeklifNo`);
      revNo = maxRevRes.recordset[0].nextRevNo as number;
    } else {
      // Yeni teklif: yıla göre sıradaki numara
      teklifNo = await nextTeklifNo(pool);
    }

    const insertRes = await pool.request()
      .input("TeklifNo",     teklifNo)
      .input("RevNo",        revNo)
      .input("MusteriID",    Number(musteriId))
      .input("Toplam",       parseFloat(toplam.toFixed(2)))
      .input("Notlar",       notlar        || null)
      .input("TeklifKonusu", teklifKonusu  || "Fiyat teklifimiz")
      .input("TeklifVeren",   teklifVeren   || null)
      .input("KdvOran",       parseInt(kdvOran) || 20)
      .input("GenelIskonto",  parseFloat(genelIskonto) || 0)
      .input("KID",           userId ? parseInt(userId) : null)
      .query(`
        INSERT INTO TeklifX1 (TeklifNo, RevNo, MusteriID, Tarih, Toplam, Notlar, TeklifKonusu, TeklifVeren, KdvOran, GenelIskonto, Durum, KID)
        OUTPUT INSERTED.ID
        VALUES (@TeklifNo, @RevNo, @MusteriID, GETDATE(), @Toplam, @Notlar, @TeklifKonusu, @TeklifVeren, @KdvOran, @GenelIskonto, 'Aktif', @KID)
      `);

    const teklifId = insertRes.recordset[0].ID;
    await insertSatirlar(pool, teklifId, satirlar);

    return Response.json({ id: teklifId }, { status: 201 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
