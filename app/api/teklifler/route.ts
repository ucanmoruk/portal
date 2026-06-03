import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";
import { writeInternalTeklifLog, teklifNoLabel, clientIpFromRequest } from "@/lib/teklifLog";
import { icTeklifRange, randomDisKod } from "@/lib/teklifNo";

// ─────────────────────────────────────────────────────────────────────────────
// Teklifler — MSSQL massgrup_cosmo · YENİ tablolar TeklifBaslik / TeklifKalem
// (legacy TeklifX1/TeklifX2'ye dokunulmaz). Cari kaynağı: Firma.
//
//  • İç teklif no (TeklifNo, INT): 2026 için ilk 260200, sonra +1.
//  • Dış teklif kodu (DisTeklifKodu): ÜGAM-26-XXXXX (benzersiz, tahmin edilemez).
//  • Revizyon: her ikisi sabit kalır, RevNo (/NN) artar.
// ─────────────────────────────────────────────────────────────────────────────

async function ensureTables() {
  const pool = await cosmoPool;

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='TeklifBaslik' AND xtype='U')
    CREATE TABLE TeklifBaslik (
      ID            INT IDENTITY(1,1) PRIMARY KEY,
      TeklifNo      INT           NULL,           -- iç takip no (260200+)
      DisTeklifKodu NVARCHAR(20)  NULL,           -- dış kod: ÜGAM-26-XXXXX
      RevNo         INT           NOT NULL DEFAULT 0,
      MusteriID     INT           NULL,           -- → Firma.ID
      Tarih         DATETIME      NOT NULL DEFAULT GETDATE(),
      Toplam        DECIMAL(18,2) NOT NULL DEFAULT 0,
      Notlar        NVARCHAR(MAX) NULL,
      TeklifDurum   NVARCHAR(20)  NOT NULL DEFAULT 'Taslak',
      KdvOran       INT           NOT NULL DEFAULT 20,
      TeklifKonusu  NVARCHAR(500) NULL,
      TeklifVeren   NVARCHAR(200) NULL,
      GenelIskonto  DECIMAL(5,2)  NOT NULL DEFAULT 0,
      Durum         NVARCHAR(20)  NOT NULL DEFAULT 'Aktif',
      KID           INT           NULL,
      OlusturanAd   NVARCHAR(255) NULL
    )
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='TeklifKalem' AND xtype='U')
    CREATE TABLE TeklifKalem (
      ID           INT IDENTITY(1,1) PRIMARY KEY,
      TeklifID     INT           NOT NULL,
      HizmetID     INT           NULL,
      HizmetAdi    NVARCHAR(200) NULL,
      Adet         INT           NOT NULL DEFAULT 1,
      Metot        NVARCHAR(200) NULL,
      Akreditasyon NVARCHAR(10)  NULL,
      Fiyat        DECIMAL(18,2) NOT NULL DEFAULT 0,
      ParaBirimi   NVARCHAR(10)  NOT NULL DEFAULT 'TRY',
      Iskonto      DECIMAL(5,2)  NOT NULL DEFAULT 0,
      Notlar       NVARCHAR(500) NULL
    )
  `);
}

// Yıla göre sıradaki iç teklif no (2026 → ilk 260200)
async function nextIcTeklifNo(pool: any): Promise<number> {
  const { yearMin, yearMax, floor } = icTeklifRange(new Date().getFullYear());
  const res = await pool.request()
    .input("yearMin", yearMin)
    .input("yearMax", yearMax)
    .input("floor", floor)
    .query(`
      SELECT ISNULL(MAX(TeklifNo), @floor) + 1 AS nextNo
      FROM TeklifBaslik
      WHERE TeklifNo >= @yearMin AND TeklifNo <= @yearMax
    `);
  return res.recordset[0].nextNo as number;
}

// Benzersiz dış teklif kodu üret (çakışırsa tekrar dener)
async function genUniqueDisKod(pool: any): Promise<string> {
  const year = new Date().getFullYear();
  for (let i = 0; i < 25; i++) {
    const kod = randomDisKod(year);
    const exists = await pool.request()
      .input("kod", kod)
      .query(`SELECT TOP 1 ID FROM TeklifBaslik WHERE DisTeklifKodu = @kod`);
    if (!exists.recordset.length) return kod;
  }
  // Aşırı düşük olasılık: yine de benzersizleştir
  return randomDisKod(year) + String(Date.now()).slice(-2);
}

async function insertSatirlar(pool: any, teklifId: number, satirlar: any[]) {
  for (const s of satirlar) {
    await pool.request()
      .input("TeklifID",    teklifId)
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
    const pool = await cosmoPool;
    // Arama: dış kod + iç no + müşteri adı + notlar
    const searchClause = search
      ? `AND (
           LOWER(ISNULL(t.DisTeklifKodu,'')) LIKE LOWER(@searchLike)
        OR CAST(ISNULL(t.TeklifNo,0) AS NVARCHAR) LIKE N'%'+@search+'%'
        OR LOWER(ISNULL(m.Firma_Adi,'')) LIKE LOWER(@searchLike)
        OR LOWER(ISNULL(t.Notlar,'')) LIKE LOWER(@searchLike)
        )`
      : "";

    const countRes = await pool.request()
      .input("search", search)
      .input("searchLike", `%${search}%`)
      .query(`
        SELECT COUNT(*) AS total
        FROM TeklifBaslik t
        LEFT JOIN Firma m ON m.ID = t.MusteriID
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
          t.DisTeklifKodu,
          t.RevNo,
          FORMAT(t.Tarih, 'dd.MM.yyyy') AS Tarih,
          t.MusteriID,
          ISNULL(m.Firma_Adi, '') AS MusteriAd,
          t.Toplam, t.Notlar, t.Durum,
          ISNULL(t.TeklifDurum, 'Taslak') AS TeklifDurum,
          ISNULL(t.OlusturanAd, '') AS OlusturanAd,
          COUNT(k.ID) AS HizmetSayisi
        FROM TeklifBaslik t
        LEFT JOIN Firma m ON m.ID = t.MusteriID
        LEFT JOIN TeklifKalem k ON k.TeklifID = t.ID
        WHERE t.Durum = 'Aktif' ${searchClause}
        GROUP BY t.ID, t.TeklifNo, t.DisTeklifKodu, t.RevNo, t.Tarih, t.MusteriID, m.Firma_Adi, t.Toplam, t.Notlar, t.Durum, t.TeklifDurum, t.OlusturanAd
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
//   Normal:   { musteriId, satirlar, notlar, ... }
//   Revizyon: { ..., revizeOfId: number }
// ----------------------------------------------------------------
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  const userId = (session.user as any)?.userId ?? null;
  const userName = (session.user as any)?.name || (session.user as any)?.email || "";

  await ensureTables();

  try {
    const body = await request.json();
    const { musteriId, satirlar, notlar, revizeOfId, teklifKonusu, teklifVeren, kdvOran, genelIskonto, revisionReason } = body;

    if (!musteriId) {
      return Response.json({ error: "Müşteri seçimi zorunludur." }, { status: 400 });
    }
    if (!Array.isArray(satirlar) || satirlar.length === 0) {
      return Response.json({ error: "En az bir hizmet eklemelisiniz." }, { status: 400 });
    }

    const toplam = calcToplam(satirlar);
    const pool   = await cosmoPool;

    let teklifNo: number;
    let disKod: string;
    let revNo = 0;

    if (revizeOfId) {
      // Revizyon: orijinalin iç no + dış kodunu koru, RevNo'yu artır
      const origRes = await pool.request()
        .input("OrigID", Number(revizeOfId))
        .query(`SELECT TeklifNo, DisTeklifKodu FROM TeklifBaslik WHERE ID = @OrigID`);
      if (!origRes.recordset.length) {
        return Response.json({ error: "Revize edilecek teklif bulunamadı." }, { status: 404 });
      }
      teklifNo = origRes.recordset[0].TeklifNo as number;
      disKod   = origRes.recordset[0].DisTeklifKodu as string;

      const maxRevRes = await pool.request()
        .input("TeklifNo", teklifNo)
        .query(`SELECT ISNULL(MAX(RevNo), 0) + 1 AS nextRevNo FROM TeklifBaslik WHERE TeklifNo = @TeklifNo`);
      revNo = maxRevRes.recordset[0].nextRevNo as number;
    } else {
      // Yeni teklif: sıradaki iç no + benzersiz dış kod
      teklifNo = await nextIcTeklifNo(pool);
      disKod   = await genUniqueDisKod(pool);
    }

    const insertRes = await pool.request()
      .input("TeklifNo",     teklifNo)
      .input("DisTeklifKodu",disKod)
      .input("RevNo",        revNo)
      .input("MusteriID",    Number(musteriId))
      .input("Tarih",        new Date())
      .input("Toplam",       parseFloat(toplam.toFixed(2)))
      .input("Notlar",       notlar        || null)
      .input("TeklifKonusu", teklifKonusu  || "Fiyat teklifimiz")
      .input("TeklifVeren",  teklifVeren   || null)
      .input("KdvOran",      parseInt(kdvOran) || 20)
      .input("GenelIskonto", parseFloat(genelIskonto) || 0)
      .input("KID",          userId ? parseInt(userId) : null)
      .input("OlusturanAd",  userName || null)
      .query(`
        INSERT INTO TeklifBaslik (TeklifNo, DisTeklifKodu, RevNo, MusteriID, Tarih, Toplam, Notlar, TeklifKonusu, TeklifVeren, KdvOran, GenelIskonto, Durum, KID, OlusturanAd)
        OUTPUT INSERTED.ID
        VALUES (@TeklifNo, @DisTeklifKodu, @RevNo, @MusteriID, @Tarih, @Toplam, @Notlar, @TeklifKonusu, @TeklifVeren, @KdvOran, @GenelIskonto, 'Aktif', @KID, @OlusturanAd)
      `);

    const teklifId = insertRes.recordset[0].ID;
    await insertSatirlar(pool, teklifId, satirlar);

    const reason = String(revisionReason || "").trim();
    try {
      await writeInternalTeklifLog({
        teklifId,
        teklifNo: teklifNoLabel(teklifNo, revNo),
        aksiyon: revizeOfId ? "Revize" : "Oluşturuldu",
        aciklama: revizeOfId ? (reason || null) : null,
        kullaniciId: userId ? parseInt(userId) : null,
        kullaniciAd: userName,
        ipAdresi: clientIpFromRequest(request.headers),
      });
      if (revizeOfId) {
        await writeInternalTeklifLog({
          teklifId: Number(revizeOfId),
          teklifNo: teklifNoLabel(teklifNo, revNo),
          aksiyon: "Revize",
          aciklama: `Yeni revizyon (#${teklifId}) oluşturuldu${reason ? ` — ${reason}` : ""}.`,
          kullaniciId: userId ? parseInt(userId) : null,
          kullaniciAd: userName,
          ipAdresi: clientIpFromRequest(request.headers),
        });
      }
    } catch (logErr) {
      console.error("[teklif log] Oluşturuldu/Revize logu yazılamadı:", logErr);
    }

    return Response.json({ id: teklifId }, { status: 201 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
