/* eslint-disable @typescript-eslint/no-explicit-any */

import { cosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";

type AnyRow = Record<string, any>;

export const MUSTERI_NOT_DURUMLARI = ["Bekleyen", "Çalışılan", "Tamamlanan"] as const;
export type MusteriNotDurum = (typeof MUSTERI_NOT_DURUMLARI)[number];

export type MusteriNotUser = {
  userId: string;
  userName: string;
};

export type MusteriNotInput = {
  firmaId?: number | string;
  manuelFirmaAdi?: string;
  baslik?: string;
  notMetni?: string;
  gorusmeTarihi?: string;
  odemeTarihi?: string;
  durum?: string;
};

let schemaReady: Promise<void> | null = null;

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function nullableText(value: unknown): string | null {
  const v = text(value);
  return v || null;
}

function cleanDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : raw;
}

function asDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : String(value);
}

function asDateTime(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function rowNumber(row: AnyRow, key: string): number {
  return Number(row[key] ?? row[key.toLowerCase()] ?? 0);
}

function rowString(row: AnyRow, key: string): string {
  return String(row[key] ?? row[key.toLowerCase()] ?? "");
}

function normalizeDurum(value: unknown): MusteriNotDurum {
  const raw = text(value);
  return MUSTERI_NOT_DURUMLARI.find(item => item === raw) || "Bekleyen";
}

export async function ensureMusteriNotSchema() {
  if (!schemaReady) {
    schemaReady = createSchema().catch(err => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

async function createSchema() {
  const pool = await cosmoPool;

  if (hasMysqlConfig()) {
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS MusteriNot (
        ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        FirmaID INT NULL,
        ManuelFirmaAdi VARCHAR(200) NULL,
        Baslik VARCHAR(180) NULL,
        NotMetni TEXT NOT NULL,
        GorusmeTarihi DATE NULL,
        OdemeTarihi DATE NULL,
        Durum VARCHAR(30) NOT NULL DEFAULT 'Bekleyen',
        CreatedByID VARCHAR(80) NULL,
        CreatedByAd VARCHAR(160) NULL,
        DurumDegistirenID VARCHAR(80) NULL,
        DurumDegistirenAd VARCHAR(160) NULL,
        DurumDegisimTarihi DATETIME NULL,
        TamamlanmaTarihi DATETIME NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY IX_MusteriNot_Firma (FirmaID),
        KEY IX_MusteriNot_Durum (Durum),
        KEY IX_MusteriNot_Gorusme (GorusmeTarihi)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    // Eski kurulumlarda FirmaID NOT NULL + ManuelFirmaAdi yok — firma listede
    // bulunamayan kayıtlar için ikisini de gevşet/ekle (idempotent).
    await pool.request().query("ALTER TABLE MusteriNot ADD COLUMN IF NOT EXISTS ManuelFirmaAdi VARCHAR(200) NULL");
    await pool.request().query("ALTER TABLE MusteriNot MODIFY COLUMN FirmaID INT NULL");
    return;
  }

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MusteriNot')
    CREATE TABLE MusteriNot (
      ID INT IDENTITY(1,1) PRIMARY KEY,
      FirmaID INT NULL,
      ManuelFirmaAdi NVARCHAR(200) NULL,
      Baslik NVARCHAR(180) NULL,
      NotMetni NVARCHAR(MAX) NOT NULL,
      GorusmeTarihi DATE NULL,
      OdemeTarihi DATE NULL,
      Durum NVARCHAR(30) NOT NULL DEFAULT 'Bekleyen',
      CreatedByID NVARCHAR(80) NULL,
      CreatedByAd NVARCHAR(160) NULL,
      DurumDegistirenID NVARCHAR(80) NULL,
      DurumDegistirenAd NVARCHAR(160) NULL,
      DurumDegisimTarihi DATETIME NULL,
      TamamlanmaTarihi DATETIME NULL,
      CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
      UpdatedAt DATETIME NOT NULL DEFAULT GETDATE()
    )
  `);
  await pool.request().query("IF COL_LENGTH('MusteriNot', 'ManuelFirmaAdi') IS NULL ALTER TABLE MusteriNot ADD ManuelFirmaAdi NVARCHAR(200) NULL");
  await pool.request().query(`
    IF EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID('MusteriNot') AND name = 'FirmaID' AND is_nullable = 0
    )
    ALTER TABLE MusteriNot ALTER COLUMN FirmaID INT NULL
  `);
}

function mapNote(row: AnyRow) {
  const firmaId = row.FirmaID ?? row.firmaid;
  return {
    id: rowNumber(row, "ID"),
    firmaId: firmaId == null ? null : Number(firmaId),
    firmaAdi: rowString(row, "FirmaAdi") || rowString(row, "ManuelFirmaAdi"),
    baslik: rowString(row, "Baslik"),
    notMetni: rowString(row, "NotMetni"),
    gorusmeTarihi: asDate(row.GorusmeTarihi ?? row.gorusmetarihi),
    odemeTarihi: asDate(row.OdemeTarihi ?? row.odemetarihi),
    durum: normalizeDurum(rowString(row, "Durum")),
    createdByAd: rowString(row, "CreatedByAd"),
    durumDegistirenAd: rowString(row, "DurumDegistirenAd"),
    durumDegisimTarihi: asDateTime(row.DurumDegisimTarihi ?? row.durumdegisimtarihi),
    tamamlanmaTarihi: asDateTime(row.TamamlanmaTarihi ?? row.tamamlanmatarihi),
    createdAt: asDateTime(row.CreatedAt ?? row.createdat),
    updatedAt: asDateTime(row.UpdatedAt ?? row.updatedat),
  };
}

export type MusteriNotRow = ReturnType<typeof mapNote>;

export async function listMusteriNotlari(params: {
  search?: string;
  durum?: string;
  tarihBas?: string;
  tarihBit?: string;
  page?: number;
  limit?: number;
}) {
  await ensureMusteriNotSchema();
  const pool = await cosmoPool;
  const search = text(params.search);
  const durum = text(params.durum);
  const tarihBas = cleanDate(params.tarihBas);
  const tarihBit = cleanDate(params.tarihBit);
  const page = Math.max(1, Number(params.page || 1));
  const limit = Math.min(100, Math.max(5, Number(params.limit || 25)));
  const offset = (page - 1) * limit;

  let where = "WHERE 1=1";
  if (search) {
    where += " AND (mn.Baslik LIKE @search OR mn.NotMetni LIKE @search OR f.Firma_Adi LIKE @search OR mn.ManuelFirmaAdi LIKE @search)";
  }
  if (durum) where += " AND mn.Durum = @durum";
  if (tarihBas) where += " AND mn.GorusmeTarihi >= @tarihBas";
  if (tarihBit) where += " AND mn.GorusmeTarihi <= @tarihBit";

  const bind = (req: any) => req
    .input("search", `%${search}%`)
    .input("durum", durum)
    .input("tarihBas", tarihBas)
    .input("tarihBit", tarihBit)
    .input("offset", offset)
    .input("limit", limit);

  const countRes = await bind(pool.request()).query(`
    SELECT COUNT(*) AS total
    FROM MusteriNot mn
    LEFT JOIN Firma f ON f.ID = mn.FirmaID
    ${where}
  `);
  const dataRes = await bind(pool.request()).query(`
    SELECT mn.ID, mn.FirmaID, ISNULL(f.Firma_Adi, '') AS FirmaAdi, mn.ManuelFirmaAdi, mn.Baslik, mn.NotMetni,
           mn.GorusmeTarihi, mn.OdemeTarihi, mn.Durum, mn.CreatedByAd,
           mn.DurumDegistirenAd, mn.DurumDegisimTarihi, mn.TamamlanmaTarihi,
           mn.CreatedAt, mn.UpdatedAt
    FROM MusteriNot mn
    LEFT JOIN Firma f ON f.ID = mn.FirmaID
    ${where}
    ORDER BY
      CASE mn.Durum WHEN N'Bekleyen' THEN 0 WHEN N'Çalışılan' THEN 1 ELSE 2 END,
      CASE WHEN mn.GorusmeTarihi IS NULL THEN 1 ELSE 0 END,
      mn.GorusmeTarihi ASC,
      mn.ID DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `);
  const statsRes = await pool.request().query(`
    SELECT Durum, COUNT(*) AS Adet FROM MusteriNot GROUP BY Durum
  `);

  const stats: Record<string, number> = {};
  let toplam = 0;
  for (const row of statsRes.recordset as AnyRow[]) {
    const adet = rowNumber(row, "Adet");
    stats[rowString(row, "Durum")] = adet;
    toplam += adet;
  }
  const total = Number(countRes.recordset[0]?.total ?? 0);
  return {
    data: dataRes.recordset.map(mapNote),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    stats: {
      toplam,
      bekleyen: stats["Bekleyen"] || 0,
      calisilan: stats["Çalışılan"] || 0,
      tamamlanan: stats["Tamamlanan"] || 0,
    },
  };
}

export async function createMusteriNot(input: MusteriNotInput, user: MusteriNotUser) {
  await ensureMusteriNotSchema();
  const firmaIdRaw = Number(input.firmaId || 0);
  const firmaId = Number.isInteger(firmaIdRaw) && firmaIdRaw > 0 ? firmaIdRaw : null;
  const manuelFirmaAdi = nullableText(input.manuelFirmaAdi);
  const notMetni = text(input.notMetni);
  // Firma listeden seçilmediyse manuel isim ZORUNLU — ikisi de boşsa kayıt reddedilir.
  if (!firmaId && !manuelFirmaAdi) throw new Error("Firma seçimi ya da manuel firma adı zorunludur.");
  if (!notMetni) throw new Error("Not metni zorunludur.");

  const pool = await cosmoPool;
  const durum = normalizeDurum(input.durum);
  const res = await pool.request()
    .input("FirmaID", firmaId)
    .input("ManuelFirmaAdi", firmaId ? null : manuelFirmaAdi)
    .input("Baslik", nullableText(input.baslik))
    .input("NotMetni", notMetni)
    .input("GorusmeTarihi", cleanDate(input.gorusmeTarihi))
    .input("OdemeTarihi", cleanDate(input.odemeTarihi))
    .input("Durum", durum)
    .input("CreatedByID", user.userId || null)
    .input("CreatedByAd", user.userName || null)
    .input("DurumDegistirenID", user.userId || null)
    .input("DurumDegistirenAd", user.userName || null)
    .query(`
      INSERT INTO MusteriNot
        (FirmaID, ManuelFirmaAdi, Baslik, NotMetni, GorusmeTarihi, OdemeTarihi, Durum,
         CreatedByID, CreatedByAd, DurumDegistirenID, DurumDegistirenAd, DurumDegisimTarihi)
      OUTPUT INSERTED.ID
      VALUES
        (@FirmaID, @ManuelFirmaAdi, @Baslik, @NotMetni, @GorusmeTarihi, @OdemeTarihi, @Durum,
         @CreatedByID, @CreatedByAd, @DurumDegistirenID, @DurumDegistirenAd, GETDATE())
    `);
  return { id: Number(res.recordset[0]?.ID ?? res.recordset[0]?.id ?? 0) };
}

export async function updateMusteriNotStatus(id: number, durumRaw: unknown, user: MusteriNotUser) {
  await ensureMusteriNotSchema();
  const durum = normalizeDurum(durumRaw);
  const pool = await cosmoPool;
  await pool.request()
    .input("ID", id)
    .input("Durum", durum)
    .input("DurumDegistirenID", user.userId || null)
    .input("DurumDegistirenAd", user.userName || null)
    .query(`
      UPDATE MusteriNot SET
        Durum = @Durum,
        DurumDegistirenID = @DurumDegistirenID,
        DurumDegistirenAd = @DurumDegistirenAd,
        DurumDegisimTarihi = GETDATE(),
        TamamlanmaTarihi = CASE WHEN @Durum = N'Tamamlanan' THEN GETDATE() ELSE NULL END,
        UpdatedAt = GETDATE()
      WHERE ID = @ID
    `);
  return { success: true };
}

export async function listFirmaOptions(search: string) {
  const pool = await cosmoPool;
  const res = await pool.request()
    .input("search", `%${text(search)}%`)
    .query(`
      SELECT TOP 25 ID, ISNULL(Firma_Adi, '') AS Ad, ISNULL(Yetkili, '') AS Yetkili
      FROM Firma
      WHERE Durum = 'Aktif'
        AND (@search = '%%' OR Firma_Adi LIKE @search OR Yetkili LIKE @search)
      ORDER BY Firma_Adi
    `);
  return res.recordset.map((row: AnyRow) => ({
    id: rowNumber(row, "ID"),
    ad: rowString(row, "Ad"),
    yetkili: rowString(row, "Yetkili"),
  }));
}

export async function getFirmaNotDetay(firmaId: number) {
  const pool = await cosmoPool;
  const firmaRes = await pool.request().input("FirmaID", firmaId).query(`
    SELECT TOP 1 ID, ISNULL(Firma_Adi, '') AS Ad, ISNULL(Adres, '') AS Adres,
           ISNULL(Telefon, '') AS Telefon, ISNULL(Mail, '') AS Email,
           ISNULL(Yetkili, '') AS Yetkili, ISNULL(Vergi_No, '') AS VergiNo,
           ISNULL(Vergi_Dairesi, '') AS VergiDairesi
    FROM Firma WHERE ID = @FirmaID
  `);
  const firma = firmaRes.recordset[0] as AnyRow | undefined;
  if (!firma) return null;

  const sampleRes = await pool.request().input("FirmaID", firmaId).query(`
    SELECT TOP 20 ID, ISNULL(RaporNo, '') AS RaporNo, CONVERT(varchar(10), Tarih, 23) AS Tarih,
           ISNULL(Numune_Adi, '') AS NumuneAdi, ISNULL(Grup, '') AS Grup
    FROM NKR
    WHERE Durum = 'Aktif' AND Firma_ID = @FirmaID
    ORDER BY Tarih DESC, ID DESC
  `);

  const testsRes = await pool.request().input("FirmaID", firmaId).query(`
    SELECT TOP 30 ISNULL(s.Kod, '') AS Kod, ISNULL(s.Ad, '') AS Ad, COUNT(*) AS Adet,
           CONVERT(varchar(10), MAX(n.Tarih), 23) AS SonTarih
    FROM NumuneX1 x1
    INNER JOIN NKR n ON n.ID = x1.RaporID
    LEFT JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
    WHERE n.Durum = 'Aktif' AND n.Firma_ID = @FirmaID
    GROUP BY s.ID, s.Kod, s.Ad
    ORDER BY Adet DESC, SonTarih DESC
  `);

  return {
    firma: {
      id: rowNumber(firma, "ID"),
      ad: rowString(firma, "Ad"),
      adres: rowString(firma, "Adres"),
      telefon: rowString(firma, "Telefon"),
      email: rowString(firma, "Email"),
      yetkili: rowString(firma, "Yetkili"),
      vergiNo: rowString(firma, "VergiNo"),
      vergiDairesi: rowString(firma, "VergiDairesi"),
    },
    numuneler: (sampleRes.recordset as AnyRow[]).map(row => ({
      id: rowNumber(row, "ID"),
      raporNo: rowString(row, "RaporNo"),
      tarih: rowString(row, "Tarih"),
      numuneAdi: rowString(row, "NumuneAdi"),
      grup: rowString(row, "Grup"),
    })),
    testler: (testsRes.recordset as AnyRow[]).map(row => ({
      kod: rowString(row, "Kod"),
      ad: rowString(row, "Ad"),
      adet: rowNumber(row, "Adet"),
      sonTarih: rowString(row, "SonTarih"),
    })),
  };
}
