import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { type NextRequest } from "next/server";

async function ensureTables() {
  const pool = await poolPromise;

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='RootKozTeklif' AND xtype='U')
    CREATE TABLE RootKozTeklif (
      ID                INT IDENTITY(1,1) PRIMARY KEY,
      TeklifNo          NVARCHAR(30)   NOT NULL,
      RevNo             INT            NOT NULL DEFAULT 0,
      Tarih             DATETIME       NOT NULL DEFAULT GETDATE(),
      MusteriAdi        NVARCHAR(200)  NULL,
      MusteriEmail      NVARCHAR(200)  NULL,
      MusteriTelefon    NVARCHAR(50)   NULL,
      MarkaAdi          NVARCHAR(200)  NULL,
      UrunKategorisi    NVARCHAR(300)  NULL,
      SKUSayisi         INT            NULL,
      UretimMiktari     NVARCHAR(100)  NULL,
      HedefPazar        NVARCHAR(100)  NULL,
      OdemeTuru         NVARCHAR(50)   NULL,
      KDVOran           DECIMAL(5,2)   NOT NULL DEFAULT 20,
      GenelIskonto      DECIMAL(5,2)   NOT NULL DEFAULT 0,
      ToplamTutar       DECIMAL(18,2)  NOT NULL DEFAULT 0,
      Durum             NVARCHAR(30)   NOT NULL DEFAULT 'Taslak',
      Notlar            NVARCHAR(MAX)  NULL,
      KID               INT            NULL,
      OlusturmaTarihi   DATETIME       NOT NULL DEFAULT GETDATE(),
      GuncellenmeTarihi DATETIME       NULL,
      SilindiMi         BIT            NOT NULL DEFAULT 0
    )
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='RootKozTeklifKalem' AND xtype='U')
    CREATE TABLE RootKozTeklifKalem (
      ID           INT IDENTITY(1,1) PRIMARY KEY,
      TeklifID     INT            NOT NULL,
      Bolum        NVARCHAR(50)   NOT NULL,
      HizmetAdi    NVARCHAR(300)  NOT NULL,
      Sure         NVARCHAR(100)  NULL,
      Miktar       DECIMAL(18,2)  NOT NULL DEFAULT 1,
      BirimFiyat   DECIMAL(18,2)  NOT NULL DEFAULT 0,
      ParaBirimi   NVARCHAR(10)   NOT NULL DEFAULT 'TRY',
      Iskonto      DECIMAL(5,2)   NOT NULL DEFAULT 0,
      Dahil        BIT            NOT NULL DEFAULT 1,
      Sira         INT            NOT NULL DEFAULT 0,
      Notlar       NVARCHAR(MAX)  NULL
    )
  `);

  // Eksik kolon migrasyonu
  const cols = await pool.request().query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'RootKozTeklif'
  `);
  const c = new Set(cols.recordset.map((r: any) => r.COLUMN_NAME as string));
  if (!c.has("GuncellenmeTarihi")) await pool.request().query(`ALTER TABLE RootKozTeklif ADD GuncellenmeTarihi DATETIME NULL`);
  if (!c.has("SilindiMi"))        await pool.request().query(`ALTER TABLE RootKozTeklif ADD SilindiMi BIT NOT NULL DEFAULT 0`);
}

async function nextTeklifNo(pool: any): Promise<string> {
  const year = new Date().getFullYear();
  const res = await pool.request()
    .input("prefix", `RKZ-${year}-`)
    .query(`
      SELECT ISNULL(MAX(CAST(RIGHT(TeklifNo, 4) AS INT)), 0) + 1 AS nextSeq
      FROM RootKozTeklif
      WHERE TeklifNo LIKE @prefix + '%' AND SilindiMi = 0
    `);
  const seq: number = res.recordset[0].nextSeq;
  return `RKZ-${year}-${String(seq).padStart(4, "0")}`;
}

async function insertKalemler(pool: any, teklifId: number, kalemler: any[]) {
  for (let i = 0; i < kalemler.length; i++) {
    const k = kalemler[i];
    await pool.request()
      .input("TeklifID",   teklifId)
      .input("Bolum",      k.bolum      || "")
      .input("HizmetAdi",  k.hizmetAdi  || "")
      .input("Sure",       k.sure       || null)
      .input("Miktar",     parseFloat(k.miktar)     || 1)
      .input("BirimFiyat", parseFloat(k.birimFiyat) || 0)
      .input("ParaBirimi", k.paraBirimi || "TRY")
      .input("Iskonto",    parseFloat(k.iskonto)    || 0)
      .input("Dahil",      k.dahil ? 1 : 0)
      .input("Sira",       i)
      .input("Notlar",     k.notlar || null)
      .query(`
        INSERT INTO RootKozTeklifKalem
          (TeklifID, Bolum, HizmetAdi, Sure, Miktar, BirimFiyat, ParaBirimi, Iskonto, Dahil, Sira, Notlar)
        VALUES
          (@TeklifID, @Bolum, @HizmetAdi, @Sure, @Miktar, @BirimFiyat, @ParaBirimi, @Iskonto, @Dahil, @Sira, @Notlar)
      `);
  }
}

function calcToplam(kalemler: any[], genelIskonto: number, kdvOran: number): number {
  const ara = kalemler
    .filter((k: any) => k.dahil)
    .reduce((sum: number, k: any) => {
      const m = parseFloat(k.miktar)     || 1;
      const f = parseFloat(k.birimFiyat) || 0;
      const i = parseFloat(k.iskonto)    || 0;
      return sum + m * f * (1 - i / 100);
    }, 0);
  const iskontolu = ara * (1 - genelIskonto / 100);
  return iskontolu * (1 + kdvOran / 100);
}

// ──────────────────────────────────────────────────────────────
// GET — liste (sayfalama + arama)
// ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  await ensureTables();
  const pool = await poolPromise;

  const sp     = req.nextUrl.searchParams;
  const search = (sp.get("search") || "").trim();
  const page   = Math.max(1, parseInt(sp.get("page")  || "1"));
  const limit  = Math.min(100, Math.max(1, parseInt(sp.get("limit") || "20")));
  const offset = (page - 1) * limit;

  const whereClause = search
    ? `AND (t.MusteriAdi LIKE @s OR t.MarkaAdi LIKE @s OR t.TeklifNo LIKE @s OR t.UrunKategorisi LIKE @s)`
    : "";

  const countRes = await pool.request()
    .input("s", `%${search}%`)
    .query(`
      SELECT COUNT(*) AS total FROM RootKozTeklif t
      WHERE t.SilindiMi = 0 ${whereClause}
    `);
  const total = countRes.recordset[0].total as number;

  const dataRes = await pool.request()
    .input("s",      `%${search}%`)
    .input("limit",  limit)
    .input("offset", offset)
    .query(`
      SELECT
        t.ID, t.TeklifNo, t.RevNo, t.Tarih,
        t.MusteriAdi, t.MusteriEmail, t.MarkaAdi, t.UrunKategorisi,
        t.SKUSayisi, t.UretimMiktari, t.HedefPazar,
        t.ToplamTutar, t.KDVOran, t.GenelIskonto, t.OdemeTuru,
        t.Durum, t.Notlar,
        (SELECT COUNT(*) FROM RootKozTeklifKalem k WHERE k.TeklifID = t.ID AND k.Dahil = 1) AS DahilKalemSayisi
      FROM RootKozTeklif t
      WHERE t.SilindiMi = 0 ${whereClause}
      ORDER BY t.ID DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

  return Response.json({
    data: dataRes.recordset,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}

// ──────────────────────────────────────────────────────────────
// POST — yeni teklif oluştur
// ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  await ensureTables();
  const pool = await poolPromise;
  const body = await req.json();

  const {
    musteriAdi, musteriEmail, musteriTelefon,
    markaAdi, urunKategorisi, skuSayisi, uretimMiktari, hedefPazar,
    odemeTuru, kdvOran, genelIskonto, notlar,
    kalemler = [],
  } = body;

  const teklifNo   = await nextTeklifNo(pool);
  const kdv        = parseFloat(kdvOran)       || 20;
  const gIskonto   = parseFloat(genelIskonto)  || 0;
  const toplam     = calcToplam(kalemler, gIskonto, kdv);
  const kid        = (session.user as any)?.userId || null;

  const ins = await pool.request()
    .input("TeklifNo",       teklifNo)
    .input("MusteriAdi",     musteriAdi     || null)
    .input("MusteriEmail",   musteriEmail   || null)
    .input("MusteriTelefon", musteriTelefon || null)
    .input("MarkaAdi",       markaAdi       || null)
    .input("UrunKategorisi", urunKategorisi || null)
    .input("SKUSayisi",      parseInt(skuSayisi) || null)
    .input("UretimMiktari",  uretimMiktari  || null)
    .input("HedefPazar",     hedefPazar     || null)
    .input("OdemeTuru",      odemeTuru      || null)
    .input("KDVOran",        kdv)
    .input("GenelIskonto",   gIskonto)
    .input("ToplamTutar",    toplam)
    .input("Notlar",         notlar         || null)
    .input("KID",            kid)
    .query(`
      INSERT INTO RootKozTeklif
        (TeklifNo, MusteriAdi, MusteriEmail, MusteriTelefon, MarkaAdi, UrunKategorisi,
         SKUSayisi, UretimMiktari, HedefPazar, OdemeTuru, KDVOran, GenelIskonto,
         ToplamTutar, Notlar, KID)
      OUTPUT INSERTED.ID
      VALUES
        (@TeklifNo, @MusteriAdi, @MusteriEmail, @MusteriTelefon, @MarkaAdi, @UrunKategorisi,
         @SKUSayisi, @UretimMiktari, @HedefPazar, @OdemeTuru, @KDVOran, @GenelIskonto,
         @ToplamTutar, @Notlar, @KID)
    `);

  const newId = ins.recordset[0].ID as number;
  await insertKalemler(pool, newId, kalemler);

  return Response.json({ id: newId, teklifNo });
}
