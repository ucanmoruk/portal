import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";
import { type NextRequest } from "next/server";

const CARI_TIPLER = new Set(["Gelen Ödeme", "Giden Ödeme"]);

function toNumber(value: unknown, fallback = 0) {
  const raw = String(value ?? "").trim();
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

function clean(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

async function ensureCariOdemeTable(pool: any) {
  if (hasMysqlConfig()) {
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS FirmaCariOdeme (
        ID INT AUTO_INCREMENT PRIMARY KEY,
        FirmaID INT NOT NULL,
        Tip VARCHAR(30) NOT NULL,
        Tutar DECIMAL(18,2) NOT NULL DEFAULT 0,
        ParaBirimi VARCHAR(10) NOT NULL DEFAULT 'TRY',
        Tarih DATETIME NOT NULL,
        OdemeYeri VARCHAR(120) NULL,
        Aciklama TEXT NULL,
        KID INT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY IX_FirmaCariOdeme_FirmaID (FirmaID),
        KEY IX_FirmaCariOdeme_Tarih (Tarih)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    return;
  }

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='FirmaCariOdeme' AND xtype='U')
    CREATE TABLE FirmaCariOdeme (
      ID          INT IDENTITY(1,1) PRIMARY KEY,
      FirmaID     INT            NOT NULL,
      Tip         NVARCHAR(30)   NOT NULL,
      Tutar       DECIMAL(18,2)  NOT NULL DEFAULT 0,
      ParaBirimi  NVARCHAR(10)   NOT NULL DEFAULT 'TRY',
      Tarih       DATETIME       NOT NULL,
      OdemeYeri   NVARCHAR(120)  NULL,
      Aciklama    NVARCHAR(MAX)  NULL,
      KID         INT            NULL,
      CreatedAt   DATETIME       NOT NULL DEFAULT GETDATE()
    )
  `);
}

function dateFilter(alias: string, tarihBas: string, tarihBit: string) {
  return [
    tarihBas ? `AND CONVERT(date, ${alias}.Tarih) >= CONVERT(date, @tarihBas)` : "",
    tarihBit ? `AND CONVERT(date, ${alias}.Tarih) <= CONVERT(date, @tarihBit)` : "",
  ].filter(Boolean).join("\n");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  const firmaId = Number(id);
  if (!Number.isInteger(firmaId) || firmaId <= 0) {
    return Response.json({ error: "Geçersiz firma ID" }, { status: 400 });
  }

  const sp = request.nextUrl.searchParams;
  const tip = (sp.get("tip") || "Tümü").trim();
  const tarihBas = (sp.get("tarihBas") || "").trim();
  const tarihBit = (sp.get("tarihBit") || "").trim();

  try {
    const pool = await cosmoPool;
    await ensureCariOdemeTable(pool);

    const firmaRes = await pool.request()
      .input("firmaId", firmaId)
      .query(`
        SELECT TOP 1 ID, ISNULL(Firma_Adi, '') AS FirmaAd
        FROM Firma
        WHERE ID = @firmaId
      `);
    if (!firmaRes.recordset.length) return Response.json({ error: "Firma bulunamadı." }, { status: 404 });

    const movements: any[] = [];
    const includeTeklif = tip === "Tümü" || tip === "Teklif";
    const includeProforma = tip === "Tümü" || tip === "Proforma";
    const includeFatura = tip === "Tümü" || tip === "Fatura";
    const includeOdeme = tip === "Tümü" || tip === "Ödeme";

    if (includeTeklif) {
      const teklifRes = await pool.request()
        .input("firmaId", firmaId)
        .input("tarihBas", tarihBas)
        .input("tarihBit", tarihBit)
        .query(`
          SELECT
            'Teklif' AS Kaynak,
            t.ID AS KaynakID,
            COALESCE(NULLIF(t.DisTeklifKodu, ''), CAST(t.TeklifNo AS NVARCHAR)) AS BelgeNo,
            CONVERT(varchar(10), t.Tarih, 23) AS Tarih,
            ISNULL(t.TeklifDurum, 'Taslak') AS Durum,
            ISNULL(t.Toplam, 0) AS Tutar,
            CASE
              WHEN COUNT(DISTINCT ISNULL(k.ParaBirimi, '')) > 1 THEN N'Çoklu'
              ELSE ISNULL(MAX(k.ParaBirimi), 'TRY')
            END AS ParaBirimi,
            N'Alacak' AS Yon,
            CAST(NULL AS NVARCHAR(120)) AS OdemeYeri,
            ISNULL(t.KisaAciklama, '') AS Aciklama
          FROM TeklifBaslik t
          LEFT JOIN TeklifKalem k ON k.TeklifID = t.ID
          WHERE t.Durum = 'Aktif'
            AND t.MusteriID = @firmaId
            ${dateFilter("t", tarihBas, tarihBit)}
          GROUP BY t.ID, t.DisTeklifKodu, t.TeklifNo, t.Tarih, t.TeklifDurum, t.Toplam, t.KisaAciklama
        `);
      movements.push(...teklifRes.recordset);
    }

    if (includeProforma) {
      const proformaRes = await pool.request()
        .input("firmaId", firmaId)
        .input("tarihBas", tarihBas)
        .input("tarihBit", tarihBit)
        .query(`
          SELECT
            'Proforma' AS Kaynak,
            p.ID AS KaynakID,
            ISNULL(p.ProformaNo, '') AS BelgeNo,
            CONVERT(varchar(10), p.Tarih, 23) AS Tarih,
            ISNULL(p.Durum, '') AS Durum,
            ISNULL(p.GenelToplam, 0) AS Tutar,
            CASE
              WHEN COUNT(DISTINCT ISNULL(k.ParaBirimi, '')) > 1 THEN N'Çoklu'
              ELSE ISNULL(MAX(k.ParaBirimi), 'TRY')
            END AS ParaBirimi,
            N'Alacak' AS Yon,
            CAST(NULL AS NVARCHAR(120)) AS OdemeYeri,
            ISNULL(p.Notlar, '') AS Aciklama
          FROM ProformaBaslik p
          LEFT JOIN ProformaKalem k ON k.ProformaID = p.ID
          WHERE p.SilindiMi = 0
            AND p.FirmaID = @firmaId
            ${dateFilter("p", tarihBas, tarihBit)}
          GROUP BY p.ID, p.ProformaNo, p.Tarih, p.Durum, p.GenelToplam, p.Notlar
        `);
      movements.push(...proformaRes.recordset);
    }

    if (includeFatura) {
      const faturaRes = await pool.request()
        .input("firmaId", firmaId)
        .input("tarihBas", tarihBas)
        .input("tarihBit", tarihBit)
        .query(`
          SELECT
            'Fatura' AS Kaynak,
            f.ID AS KaynakID,
            ISNULL(f.Fatura_No, '') AS BelgeNo,
            CONVERT(varchar(10), f.Tarih, 23) AS Tarih,
            ISNULL((SELECT TOP 1 o.Odeme_Durumu FROM Odeme o WHERE o.Fatura_ID = f.ID ORDER BY o.ID DESC), 'Ödeme Bekliyor') AS Durum,
            ISNULL(f.Toplam, 0) AS Tutar,
            'TRY' AS ParaBirimi,
            N'Alacak' AS Yon,
            CAST(NULL AS NVARCHAR(120)) AS OdemeYeri,
            ISNULL(f.Aciklama, '') AS Aciklama
          FROM Fatura f
          WHERE f.Durum = 'Aktif'
            AND (
              f.FaturaFirmaID = @firmaId
              OR EXISTS (
                SELECT 1
                FROM ProformaBaslik p
                WHERE p.SilindiMi = 0
                  AND p.FirmaID = @firmaId
                  AND p.EvrakNo = f.ProformaNo
              )
            )
            ${dateFilter("f", tarihBas, tarihBit)}
        `);
      movements.push(...faturaRes.recordset);
    }

    if (includeOdeme) {
      const odemeRes = await pool.request()
        .input("firmaId", firmaId)
        .input("tarihBas", tarihBas)
        .input("tarihBit", tarihBit)
        .query(`
          SELECT
            N'Ödeme' AS Kaynak,
            o.ID AS KaynakID,
            CAST(o.ID AS NVARCHAR) AS BelgeNo,
            CONVERT(varchar(10), o.Tarih, 23) AS Tarih,
            o.Tip AS Durum,
            ISNULL(o.Tutar, 0) AS Tutar,
            ISNULL(o.ParaBirimi, 'TRY') AS ParaBirimi,
            CASE WHEN o.Tip = N'Gelen Ödeme' THEN N'Tahsilat' ELSE N'Borç' END AS Yon,
            ISNULL(o.OdemeYeri, '') AS OdemeYeri,
            ISNULL(o.Aciklama, '') AS Aciklama
          FROM FirmaCariOdeme o
          WHERE o.FirmaID = @firmaId
            ${dateFilter("o", tarihBas, tarihBit)}
        `);
      movements.push(...odemeRes.recordset);
    }

    movements.sort((a, b) => String(b.Tarih || "").localeCompare(String(a.Tarih || "")) || Number(b.KaynakID || 0) - Number(a.KaynakID || 0));

    const summary = movements.reduce((acc, row) => {
      const currency = String(row.ParaBirimi || "TRY");
      if (!acc[currency]) acc[currency] = { paraBirimi: currency, teklif: 0, proforma: 0, fatura: 0, gelenOdeme: 0, gidenOdeme: 0, net: 0 };
      const item = acc[currency];
      const tutar = Number(row.Tutar || 0);
      if (row.Kaynak === "Teklif") item.teklif += tutar;
      else if (row.Kaynak === "Proforma") item.proforma += tutar;
      else if (row.Kaynak === "Fatura") item.fatura += tutar;
      else if (row.Durum === "Gelen Ödeme") item.gelenOdeme += tutar;
      else if (row.Durum === "Giden Ödeme") item.gidenOdeme += tutar;
      item.net = item.fatura - item.gelenOdeme + item.gidenOdeme;
      return acc;
    }, {} as Record<string, any>);

    return Response.json({
      firma: firmaRes.recordset[0],
      data: movements,
      summary: Object.values(summary),
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  const firmaId = Number(id);
  if (!Number.isInteger(firmaId) || firmaId <= 0) {
    return Response.json({ error: "Geçersiz firma ID" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const tip = String(body.tip || "").trim();
    const tutar = toNumber(body.tutar);
    const tarih = String(body.tarih || "").trim();
    const paraBirimi = String(body.paraBirimi || "TRY").trim().toUpperCase() || "TRY";
    const odemeYeri = clean(body.odemeYeri);
    const aciklama = clean(body.aciklama);

    if (!CARI_TIPLER.has(tip)) return Response.json({ error: "Ödeme tipi geçersiz." }, { status: 400 });
    if (tutar <= 0) return Response.json({ error: "Ödeme tutarı sıfırdan büyük olmalı." }, { status: 400 });
    if (!tarih) return Response.json({ error: "Ödeme tarihi zorunludur." }, { status: 400 });

    const pool = await cosmoPool;
    await ensureCariOdemeTable(pool);

    const userId = (session.user as any)?.userId ?? null;
    const result = await pool.request()
      .input("FirmaID", firmaId)
      .input("Tip", tip)
      .input("Tutar", Number(tutar.toFixed(2)))
      .input("ParaBirimi", paraBirimi)
      .input("Tarih", tarih)
      .input("OdemeYeri", odemeYeri)
      .input("Aciklama", aciklama)
      .input("KID", userId ? Number(userId) : null)
      .query(`
        INSERT INTO FirmaCariOdeme (FirmaID, Tip, Tutar, ParaBirimi, Tarih, OdemeYeri, Aciklama, KID)
        OUTPUT INSERTED.ID
        VALUES (@FirmaID, @Tip, @Tutar, @ParaBirimi, @Tarih, @OdemeYeri, @Aciklama, @KID)
      `);

    return Response.json({ id: result.recordset?.[0]?.ID ?? null }, { status: 201 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
