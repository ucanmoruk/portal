import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";
import { calculateTlEquivalent, fetchTcmbTodayRates, normalizeParaBirimi } from "@/lib/tcmbRates";
import { hasProformaFaturaFirmaCol } from "@/lib/proformaSchema";
import { hasMysqlConfig } from "@/lib/mysqlCompat";

// Proforma — MSSQL massgrup_cosmo · YENİ tablolar ProformaBaslik / ProformaKalem
// (cosmo'da ProformaBaslik/X2 yoktu → sıfırdan kuruluyor). Cari kaynağı: Firma.
async function ensureProformaTables() {
  const pool = await cosmoPool;
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='ProformaBaslik' AND xtype='U')
    CREATE TABLE ProformaBaslik (
      ID           INT IDENTITY(1,1) PRIMARY KEY,
      ProformaNo   NVARCHAR(40)  NULL,
      EvrakNo      NVARCHAR(40)  NULL,
      TeklifID     INT           NULL,
      FirmaID      INT           NULL,
      Tarih        DATETIME      NOT NULL DEFAULT GETDATE(),
      Durum        NVARCHAR(20)  NOT NULL DEFAULT 'Taslak',
      KdvOran      DECIMAL(5,2)  NOT NULL DEFAULT 20,
      GenelIskonto DECIMAL(5,2)  NOT NULL DEFAULT 0,
      AraToplam    DECIMAL(18,2) NOT NULL DEFAULT 0,
      IskontoTutar DECIMAL(18,2) NOT NULL DEFAULT 0,
      KdvTutar     DECIMAL(18,2) NOT NULL DEFAULT 0,
      GenelToplam  DECIMAL(18,2) NOT NULL DEFAULT 0,
      Notlar       NVARCHAR(MAX) NULL,
      KID          INT           NULL,
      FaturaFirmaID INT          NULL,
      SilindiMi    BIT           NOT NULL DEFAULT 0
    )
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='ProformaKalem' AND xtype='U')
    CREATE TABLE ProformaKalem (
      ID             INT IDENTITY(1,1) PRIMARY KEY,
      ProformaID     INT           NOT NULL,
      HizmetID       INT           NULL,
      HizmetKodu     NVARCHAR(50)  NULL,
      HizmetAdi      NVARCHAR(300) NULL,
      RaporNoListesi NVARCHAR(MAX) NULL,
      NumuneListesi  NVARCHAR(MAX) NULL,
      Adet           DECIMAL(18,2) NOT NULL DEFAULT 1,
      BirimFiyat     DECIMAL(18,2) NOT NULL DEFAULT 0,
      ParaBirimi     NVARCHAR(10)  NOT NULL DEFAULT 'TRY',
      Iskonto        DECIMAL(5,2)  NOT NULL DEFAULT 0,
      Tutar          DECIMAL(18,2) NOT NULL DEFAULT 0,
      Kaynak         NVARCHAR(20)  NULL
    )
  `);
  if (hasMysqlConfig()) {
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS ProformaNkr (
        ID INT AUTO_INCREMENT PRIMARY KEY,
        ProformaID INT NOT NULL,
        NkrID INT NOT NULL,
        EvrakNo VARCHAR(40) NULL,
        RaporNo VARCHAR(60) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY UX_ProformaNkr_Proforma_Nkr (ProformaID, NkrID),
        KEY IX_ProformaNkr_EvrakNo (EvrakNo)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
  } else {
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='ProformaNkr' AND xtype='U')
      CREATE TABLE ProformaNkr (
        ID          INT IDENTITY(1,1) PRIMARY KEY,
        ProformaID  INT          NOT NULL,
        NkrID       INT          NOT NULL,
        EvrakNo     NVARCHAR(40) NULL,
        RaporNo     NVARCHAR(60) NULL,
        CreatedAt   DATETIME     NOT NULL DEFAULT GETDATE()
      )
    `);
  }
}

function toNumber(value: any, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function calcLine(line: any) {
  const adet = toNumber(line.adet ?? line.Adet, 1);
  const fiyat = toNumber(line.birimFiyat ?? line.BirimFiyat, 0);
  const iskonto = toNumber(line.iskonto ?? line.Iskonto, 0);
  return adet * fiyat * (1 - iskonto / 100);
}

function parseNkrIds(value: any): number[] {
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  return Array.from(new Set(
    raw
      .map((x: any) => Number(String(x).trim()))
      .filter((x: number) => Number.isInteger(x) && x > 0)
  )).slice(0, 500);
}

function isMultiEvrakLabelSql(alias = "p") {
  return `UPPER(ISNULL(${alias}.EvrakNo, N'')) LIKE N'ÇOKLU%'`;
}

async function getProformaNkrTargets(pool: any, nkrIds: number[], evrakNo: unknown) {
  const evrakNoStr = String(evrakNo || "").trim();
  if (nkrIds.length > 0) {
    const res = await pool.request().query(`
      SELECT ID, Evrak_No, RaporNo
      FROM NKR
      WHERE Durum = 'Aktif' AND ID IN (${nkrIds.join(",")})
      ORDER BY Evrak_No, RaporNo
    `);
    return res.recordset || [];
  }

  const evrakNoNumber = Number(evrakNoStr);
  if (!Number.isFinite(evrakNoNumber) || evrakNoNumber <= 0) return [];
  const res = await pool.request()
    .input("Evrak_No", evrakNoNumber)
    .query(`
      SELECT ID, Evrak_No, RaporNo
      FROM NKR
      WHERE Durum = 'Aktif' AND Evrak_No = @Evrak_No
      ORDER BY RaporNo
    `);
  return res.recordset || [];
}

async function linkProformaToNkr(pool: any, proformaId: number, targets: any[]) {
  for (const row of targets) {
    await pool.request()
      .input("ProformaID", proformaId)
      .input("NkrID", Number(row.ID))
      .input("EvrakNo", String(row.Evrak_No || ""))
      .input("RaporNo", String(row.RaporNo || ""))
      .query(`
        INSERT INTO ProformaNkr (ProformaID, NkrID, EvrakNo, RaporNo)
        SELECT @ProformaID, @NkrID, @EvrakNo, @RaporNo
        WHERE NOT EXISTS (
          SELECT 1 FROM ProformaNkr WHERE ProformaID = @ProformaID AND NkrID = @NkrID
        )
      `);
  }
}

async function markProformaCreated(pool: any, targets: any[]) {
  const evrakNos = Array.from(new Set(
    targets
      .map(row => Number(row.Evrak_No))
      .filter(n => Number.isFinite(n) && n > 0)
  ));
  for (const evrakNo of evrakNos) {
    await pool.request()
      .input("Evrak_No", evrakNo)
      .query(`
        INSERT INTO Odeme (Evrak_No, Odeme_Durumu, Tarih)
        VALUES (@Evrak_No, N'Proforma', GETDATE())
      `);
  }
}

async function nextProformaNo(pool: any) {
  const year = new Date().getFullYear();
  const prefix = `PRF-${year}-`;
  const res = await pool.request()
    .input("prefix", prefix)
    .query(`
      SELECT ISNULL(MAX(CAST(RIGHT(ProformaNo, 4) AS INT)), 0) + 1 AS nextSeq
      FROM ProformaBaslik
      WHERE ProformaNo LIKE @prefix + '%'
    `);
  const seq = Number(res.recordset[0]?.nextSeq || 1);
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const search = sp.get("search")?.trim() || "";
  const durum = sp.get("durum")?.trim() || "";   // "" = tümü
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(5, parseInt(sp.get("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  try {
    await ensureProformaTables();
    const pool = await cosmoPool;
    // FaturaFirmaID kolonu (opsiyonel) varsa fatura firması adını da getir.
    const hasFF = await hasProformaFaturaFirmaCol(pool);
    const ffJoin = hasFF ? `LEFT JOIN (SELECT ID, Firma_Adi AS Ad FROM Firma) ff ON ff.ID = p.FaturaFirmaID` : "";
    const ffSelect = hasFF ? `ISNULL(ff.Ad, '') AS FaturaFirmaAd,` : `'' AS FaturaFirmaAd,`;
    const ffGroupBy = hasFF ? `, ff.Ad` : "";
    const where = search
      ? `AND (
          ISNULL(p.ProformaNo, '') COLLATE Turkish_CI_AS LIKE @search
          OR ISNULL(p.EvrakNo, '') COLLATE Turkish_CI_AS LIKE @search
          OR ISNULL(f.Ad, '') COLLATE Turkish_CI_AS LIKE @search
          OR ISNULL(p.Durum, '') COLLATE Turkish_CI_AS LIKE @search
        )`
      : "";
    // Durum filtresi (Taslak/Gönderildi/Onaylandı/İptal/Faturalaştı)
    const durumClause = durum ? `AND ISNULL(p.Durum, '') = @durum` : "";

    const countRes = await pool.request()
      .input("search", `%${search}%`)
      .input("durum", durum)
      .query(`
        SELECT COUNT(*) AS total
        FROM ProformaBaslik p
        LEFT JOIN (SELECT ID, Firma_Adi AS Ad, Adres, Mail AS Email, Telefon, Vergi_Dairesi AS VergiDairesi, Vergi_No AS VergiNo, Yetkili FROM Firma) f ON f.ID = p.FirmaID
        WHERE p.SilindiMi = 0 ${where} ${durumClause}
      `);

    // Footer toplamı — filtreli tüm proformaların genel toplamı, para birimine göre.
    const sumRes = await pool.request()
      .input("search", `%${search}%`)
      .input("durum", durum)
      .query(`
        SELECT pb.ParaBirimi, ISNULL(SUM(pb.GenelToplam), 0) AS toplam, COUNT(*) AS adet
        FROM (
          SELECT p.ID, p.GenelToplam,
            CASE
              WHEN COUNT(DISTINCT ISNULL(x.ParaBirimi, '')) > 1 THEN N'Çoklu'
              ELSE ISNULL(MAX(x.ParaBirimi), 'TRY')
            END AS ParaBirimi
          FROM ProformaBaslik p
          LEFT JOIN (SELECT ID, Firma_Adi AS Ad FROM Firma) f ON f.ID = p.FirmaID
          LEFT JOIN ProformaKalem x ON x.ProformaID = p.ID
          WHERE p.SilindiMi = 0 ${where} ${durumClause}
          GROUP BY p.ID, p.GenelToplam
        ) pb
        GROUP BY pb.ParaBirimi
      `);

    const odemeDurumuExpr = `
      CASE
        WHEN p.Durum = N'Faturalaştı' THEN COALESCE(
          (
            SELECT TOP 1 o.Odeme_Durumu
            FROM Fatura ft
            INNER JOIN Odeme o ON o.Fatura_ID = ft.ID
            WHERE ft.Durum = 'Aktif'
              AND (
                ft.ProformaNo = p.ProformaNo
                OR (NOT (${isMultiEvrakLabelSql("p")}) AND ft.ProformaNo = p.EvrakNo)
              )
              AND ISNULL(o.Odeme_Durumu, N'') <> N'Proforma'
            ORDER BY o.ID DESC
          ),
          (
            SELECT TOP 1 o.Odeme_Durumu
            FROM Odeme o
            WHERE NOT (${isMultiEvrakLabelSql("p")})
              AND o.Evrak_No = p.EvrakNo
              AND ISNULL(o.Odeme_Durumu, N'') <> N'Proforma'
            ORDER BY o.ID DESC
          )
        )
        ELSE NULL
      END
    `;

    const dataRes = await pool.request()
      .input("search", `%${search}%`)
      .input("durum", durum)
      .input("offset", offset)
      .input("limit", limit)
      .query(`
        SELECT
          p.ID, p.ProformaNo, p.EvrakNo, p.TeklifID, p.FirmaID,
          FORMAT(p.Tarih, 'dd.MM.yyyy') AS Tarih,
          p.Durum, p.AraToplam, p.IskontoTutar, p.KdvTutar, p.GenelToplam,
          p.KdvOran, p.GenelIskonto, p.Notlar,
          ISNULL(f.Ad, '') AS FirmaAd,
          ISNULL(f.Email, '') AS FirmaEmail,
          ${ffSelect}
          CASE
            WHEN COUNT(DISTINCT ISNULL(x.ParaBirimi, '')) > 1 THEN N'Çoklu'
            ELSE ISNULL(MAX(x.ParaBirimi), 'TRY')
          END AS ParaBirimi,
          COUNT(x.ID) AS KalemSayisi,
          ${odemeDurumuExpr} AS OdemeDurumu
        FROM ProformaBaslik p
        LEFT JOIN (SELECT ID, Firma_Adi AS Ad, Adres, Mail AS Email, Telefon, Vergi_Dairesi AS VergiDairesi, Vergi_No AS VergiNo, Yetkili FROM Firma) f ON f.ID = p.FirmaID
        ${ffJoin}
        LEFT JOIN ProformaKalem x ON x.ProformaID = p.ID
        WHERE p.SilindiMi = 0 ${where} ${durumClause}
        GROUP BY p.ID, p.ProformaNo, p.EvrakNo, p.TeklifID, p.FirmaID, p.Tarih, p.Durum,
          p.AraToplam, p.IskontoTutar, p.KdvTutar, p.GenelToplam, p.KdvOran, p.GenelIskonto,
          p.Notlar, f.Ad, f.Email${ffGroupBy}
        ORDER BY p.ID DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    let rates: Record<string, any> = {};
    if (dataRes.recordset.some((row: any) => !["TRY", "TL", "₺", "ÇOKLU"].includes(normalizeParaBirimi(row.ParaBirimi)))) {
      try {
        rates = await fetchTcmbTodayRates();
      } catch (e) {
        console.warn("proformalar: TCMB kuru alınamadı:", e);
      }
    }

    const data = dataRes.recordset.map((row: any) => {
      const paraBirimi = normalizeParaBirimi(row.ParaBirimi);
      const rate = rates[paraBirimi]?.forexBuying ?? null;
      const tlKarsiligi = calculateTlEquivalent(row.GenelToplam, paraBirimi, rates);
      return {
        ...row,
        ParaBirimi: paraBirimi === "ÇOKLU" ? "Çoklu" : paraBirimi,
        DovizAlisKuru: rate,
        TlKarsiligi: tlKarsiligi,
      };
    });

    const total = Number(countRes.recordset[0]?.total || 0);

    // Footer özeti: para birimine göre genel toplamlar (filtreli tüm kayıtlar).
    const summaryByCurrency = (sumRes.recordset || []).map((r: any) => ({
      paraBirimi: normalizeParaBirimi(r.ParaBirimi) === "ÇOKLU" ? "Çoklu" : normalizeParaBirimi(r.ParaBirimi),
      toplam: Number(r.toplam || 0),
      adet: Number(r.adet || 0),
    }));

    return Response.json({
      data, total, page, limit, totalPages: Math.ceil(total / limit),
      summary: summaryByCurrency,
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const body = await request.json();
    const firmaId = Number(body.firmaId);
    const satirlar = Array.isArray(body.satirlar) ? body.satirlar : [];
    if (!firmaId) return Response.json({ error: "Firma seçimi zorunludur." }, { status: 400 });
    if (satirlar.length === 0) return Response.json({ error: "En az bir proforma kalemi eklenmelidir." }, { status: 400 });

    const kdvOran = toNumber(body.kdvOran, 20);
    const genelIskonto = toNumber(body.genelIskonto, 0);
    const araToplam = satirlar.reduce((sum: number, line: any) => sum + calcLine(line), 0);
    const iskontoTutar = araToplam * (genelIskonto / 100);
    const kdvMatrah = araToplam - iskontoTutar;
    const kdvTutar = kdvMatrah * (kdvOran / 100);
    const genelToplam = kdvMatrah + kdvTutar;

    await ensureProformaTables();
    const pool = await cosmoPool;
    const proformaNo = await nextProformaNo(pool);
    const userId = (session.user as any)?.userId ?? null;

    // Fatura firması rapor firmasından farklı olabilir (opsiyonel kolon).
    const hasFaturaFirmaCol = await hasProformaFaturaFirmaCol(pool);
    const faturaFirmaId = body.faturaFirmaId ? Number(body.faturaFirmaId) : null;
    const ffCol = hasFaturaFirmaCol ? ", FaturaFirmaID" : "";
    const ffVal = hasFaturaFirmaCol ? ", @FaturaFirmaID" : "";

    const insReq = pool.request()
      .input("ProformaNo", proformaNo)
      .input("EvrakNo", body.evrakNo || null)
      .input("TeklifID", body.teklifId ? Number(body.teklifId) : null)
      .input("FirmaID", firmaId)
      .input("Durum", body.durum || "Taslak")
      .input("KdvOran", kdvOran)
      .input("GenelIskonto", genelIskonto)
      .input("AraToplam", Number(araToplam.toFixed(2)))
      .input("IskontoTutar", Number(iskontoTutar.toFixed(2)))
      .input("KdvTutar", Number(kdvTutar.toFixed(2)))
      .input("GenelToplam", Number(genelToplam.toFixed(2)))
      .input("Notlar", body.notlar || null)
      .input("KID", userId ? Number(userId) : null);
    if (hasFaturaFirmaCol) insReq.input("FaturaFirmaID", faturaFirmaId);
    await insReq.query(`
        INSERT INTO ProformaBaslik
          (ProformaNo, EvrakNo, TeklifID, FirmaID, Tarih, Durum, KdvOran, GenelIskonto,
           AraToplam, IskontoTutar, KdvTutar, GenelToplam, Notlar, KID${ffCol}, SilindiMi)
        VALUES
          (@ProformaNo, @EvrakNo, @TeklifID, @FirmaID, GETDATE(), @Durum, @KdvOran, @GenelIskonto,
           @AraToplam, @IskontoTutar, @KdvTutar, @GenelToplam, @Notlar, @KID${ffVal}, 0)
      `);

    const idRes = await pool.request()
      .input("ProformaNo", proformaNo)
      .query(`SELECT TOP 1 ID FROM ProformaBaslik WHERE ProformaNo = @ProformaNo ORDER BY ID DESC`);
    const proformaId = Number(idRes.recordset[0]?.ID);
    const nkrIds = parseNkrIds(body.nkrIds);
    const nkrTargets = await getProformaNkrTargets(pool, nkrIds, body.evrakNo);

    for (const line of satirlar) {
      const adet = toNumber(line.adet ?? line.Adet, 1);
      const birimFiyat = toNumber(line.birimFiyat ?? line.BirimFiyat, 0);
      const iskonto = toNumber(line.iskonto ?? line.Iskonto, 0);
      const tutar = calcLine({ adet, birimFiyat, iskonto });
      await pool.request()
        .input("ProformaID", proformaId)
        .input("HizmetID", line.hizmetId ? Number(line.hizmetId) : null)
        .input("HizmetKodu", line.hizmetKodu || null)
        .input("HizmetAdi", line.hizmetAdi || "")
        .input("RaporNoListesi", line.raporNoListesi || null)
        .input("NumuneListesi", line.numuneListesi || null)
        .input("Adet", adet)
        .input("BirimFiyat", birimFiyat)
        .input("ParaBirimi", line.paraBirimi || "TRY")
        .input("Iskonto", iskonto)
        .input("Tutar", Number(tutar.toFixed(2)))
        .input("Kaynak", line.kaynak || null)
        .query(`
          INSERT INTO ProformaKalem
            (ProformaID, HizmetID, HizmetKodu, HizmetAdi, RaporNoListesi, NumuneListesi,
             Adet, BirimFiyat, ParaBirimi, Iskonto, Tutar, Kaynak)
          VALUES
            (@ProformaID, @HizmetID, @HizmetKodu, @HizmetAdi, @RaporNoListesi, @NumuneListesi,
             @Adet, @BirimFiyat, @ParaBirimi, @Iskonto, @Tutar, @Kaynak)
        `);
    }

    await linkProformaToNkr(pool, proformaId, nkrTargets);
    await markProformaCreated(pool, nkrTargets);

    return Response.json({ id: proformaId, proformaNo }, { status: 201 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
