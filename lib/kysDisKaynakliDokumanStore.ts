/* eslint-disable @typescript-eslint/no-explicit-any */

import { cosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";

type AnyRow = Record<string, any>;

let schemaReady: Promise<void> | null = null;

export type DisKaynakliDokumanInput = {
  akreditasyon?: boolean;
  dokumanKodu?: string;
  dokumanAdi?: string;
  yayincisi?: string;
  yayinTarihi?: string;
  yayinLinki?: string;
  pdfPath?: string;
  pdfOriginalName?: string;
};

export type DisKaynakliDokumanKullanici = {
  userId: string;
  userName: string;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function nullableText(value: unknown): string | null {
  const v = text(value);
  return v || null;
}

function rowNumber(row: AnyRow, key: string): number {
  return Number(row[key] ?? row[key.toLowerCase()] ?? 0);
}

function rowString(row: AnyRow, key: string): string {
  return String(row[key] ?? row[key.toLowerCase()] ?? "");
}

function rowBool(row: AnyRow, key: string): boolean {
  const value = row[key] ?? row[key.toLowerCase()];
  return value === true || value === 1 || value === "1" || value === "true";
}

function asDateTime(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function cleanUrl(value: unknown): string | null {
  const url = text(value);
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

export async function ensureKysDisKaynakliDokumanSchema() {
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
      CREATE TABLE IF NOT EXISTS KysDisKaynakliDokuman (
        ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        Akreditasyon TINYINT(1) NOT NULL DEFAULT 0,
        DokumanKodu VARCHAR(80) NOT NULL,
        DokumanAdi VARCHAR(260) NOT NULL,
        Yayincisi VARCHAR(180) NULL,
        YayinTarihi VARCHAR(80) NULL,
        YayinLinki TEXT NULL,
        PdfPath VARCHAR(500) NULL,
        PdfOriginalName VARCHAR(260) NULL,
        KontrolEdildi TINYINT(1) NOT NULL DEFAULT 0,
        KontrolTarihi DATETIME NULL,
        KontrolEdenID VARCHAR(80) NULL,
        KontrolEdenAd VARCHAR(160) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY IX_KysDisKaynakliDokuman_Kod (DokumanKodu),
        KEY IX_KysDisKaynakliDokuman_Kontrol (KontrolEdildi, KontrolTarihi)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
  } else {
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'KysDisKaynakliDokuman')
      CREATE TABLE KysDisKaynakliDokuman (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        Akreditasyon BIT NOT NULL DEFAULT 0,
        DokumanKodu NVARCHAR(80) NOT NULL,
        DokumanAdi NVARCHAR(260) NOT NULL,
        Yayincisi NVARCHAR(180) NULL,
        YayinTarihi NVARCHAR(80) NULL,
        YayinLinki NVARCHAR(MAX) NULL,
        PdfPath NVARCHAR(500) NULL,
        PdfOriginalName NVARCHAR(260) NULL,
        KontrolEdildi BIT NOT NULL DEFAULT 0,
        KontrolTarihi DATETIME NULL,
        KontrolEdenID NVARCHAR(80) NULL,
        KontrolEdenAd NVARCHAR(160) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        UpdatedAt DATETIME NOT NULL DEFAULT GETDATE()
      )
    `);
  }
}

function mapRow(row: AnyRow) {
  return {
    id: rowNumber(row, "ID"),
    akreditasyon: rowBool(row, "Akreditasyon"),
    dokumanKodu: rowString(row, "DokumanKodu"),
    dokumanAdi: rowString(row, "DokumanAdi"),
    yayincisi: rowString(row, "Yayincisi"),
    yayinTarihi: rowString(row, "YayinTarihi"),
    yayinLinki: rowString(row, "YayinLinki"),
    pdfPath: rowString(row, "PdfPath"),
    pdfOriginalName: rowString(row, "PdfOriginalName"),
    kontrolEdildi: rowBool(row, "KontrolEdildi"),
    kontrolTarihi: asDateTime(row.KontrolTarihi ?? row.kontroltarihi),
    kontrolEdenAd: rowString(row, "KontrolEdenAd"),
    createdAt: asDateTime(row.CreatedAt ?? row.createdat),
    updatedAt: asDateTime(row.UpdatedAt ?? row.updatedat),
  };
}

export type DisKaynakliDokumanRow = ReturnType<typeof mapRow>;

export async function listDisKaynakliDokumanlar(params: {
  search?: string;
  akreditasyon?: string;
  kontrol?: string;
  sort?: string;
  page?: number;
  limit?: number;
}) {
  await ensureKysDisKaynakliDokumanSchema();
  const pool = await cosmoPool;
  const page = Math.max(1, Number(params.page || 1));
  const limit = Math.min(200, Math.max(5, Number(params.limit || 25)));
  const offset = (page - 1) * limit;
  const search = text(params.search);
  const akreditasyon = text(params.akreditasyon);
  const kontrol = text(params.kontrol);

  let where = "WHERE 1=1";
  if (search) where += " AND (DokumanKodu LIKE @search OR DokumanAdi LIKE @search OR Yayincisi LIKE @search)";
  if (akreditasyon === "var") where += " AND Akreditasyon = 1";
  if (akreditasyon === "yok") where += " AND Akreditasyon = 0";
  if (kontrol === "edildi") where += " AND KontrolEdildi = 1";
  if (kontrol === "bekliyor") where += " AND KontrolEdildi = 0";

  const order =
    params.sort === "kod-asc" ? "DokumanKodu ASC" :
    params.sort === "ad-asc" ? "DokumanAdi ASC" :
    params.sort === "kontrol-desc" ? "KontrolTarihi DESC, ID DESC" :
    "UpdatedAt DESC, ID DESC";

  const bind = (req: any) => req
    .input("search", `%${search}%`)
    .input("offset", offset)
    .input("limit", limit);

  const countRes = await bind(pool.request()).query(`SELECT COUNT(*) AS total FROM KysDisKaynakliDokuman ${where}`);
  const dataRes = await bind(pool.request()).query(`
    SELECT ID, Akreditasyon, DokumanKodu, DokumanAdi, Yayincisi, YayinTarihi, YayinLinki,
           PdfPath, PdfOriginalName, KontrolEdildi, KontrolTarihi, KontrolEdenAd, CreatedAt, UpdatedAt
    FROM KysDisKaynakliDokuman
    ${where}
    ORDER BY ${order}
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `);
  const statsRes = await pool.request().query(`
    SELECT
      COUNT(*) AS Toplam,
      SUM(CASE WHEN Akreditasyon = 1 THEN 1 ELSE 0 END) AS Akreditasyonlu,
      SUM(CASE WHEN KontrolEdildi = 1 THEN 1 ELSE 0 END) AS KontrolEdilen
    FROM KysDisKaynakliDokuman
  `);

  const total = Number(countRes.recordset[0]?.total ?? countRes.recordset[0]?.Toplam ?? 0);
  const statsRow = statsRes.recordset[0] || {};
  const toplam = rowNumber(statsRow, "Toplam");
  const kontrolEdilen = rowNumber(statsRow, "KontrolEdilen");
  return {
    data: dataRes.recordset.map(mapRow),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    stats: {
      toplam,
      akreditasyonlu: rowNumber(statsRow, "Akreditasyonlu"),
      kontrolEdilen,
      kontrolBekleyen: Math.max(toplam - kontrolEdilen, 0),
    },
  };
}

export async function createDisKaynakliDokuman(input: DisKaynakliDokumanInput) {
  await ensureKysDisKaynakliDokumanSchema();
  const dokumanKodu = text(input.dokumanKodu);
  const dokumanAdi = text(input.dokumanAdi);
  if (!dokumanKodu) throw new Error("Doküman kodu zorunludur.");
  if (!dokumanAdi) throw new Error("Doküman adı zorunludur.");
  if (!input.pdfPath) throw new Error("PDF dosyası zorunludur.");

  const pool = await cosmoPool;
  const res = await pool.request()
    .input("Akreditasyon", input.akreditasyon ? 1 : 0)
    .input("DokumanKodu", dokumanKodu)
    .input("DokumanAdi", dokumanAdi)
    .input("Yayincisi", nullableText(input.yayincisi))
    .input("YayinTarihi", nullableText(input.yayinTarihi))
    .input("YayinLinki", cleanUrl(input.yayinLinki))
    .input("PdfPath", nullableText(input.pdfPath))
    .input("PdfOriginalName", nullableText(input.pdfOriginalName))
    .query(`
      INSERT INTO KysDisKaynakliDokuman
        (Akreditasyon, DokumanKodu, DokumanAdi, Yayincisi, YayinTarihi, YayinLinki, PdfPath, PdfOriginalName)
      OUTPUT INSERTED.ID
      VALUES (@Akreditasyon, @DokumanKodu, @DokumanAdi, @Yayincisi, @YayinTarihi, @YayinLinki, @PdfPath, @PdfOriginalName)
    `);

  return {
    id: Number(res.recordset[0]?.ID ?? res.recordset[0]?.id ?? 0),
  };
}

export async function markDisKaynakliDokumanChecked(ids: number[], user: DisKaynakliDokumanKullanici) {
  await ensureKysDisKaynakliDokumanSchema();
  const cleanIds = Array.from(new Set(ids.map(Number).filter(id => Number.isFinite(id) && id > 0)));
  if (!cleanIds.length) throw new Error("Kontrol edilecek doküman seçilmedi.");

  const pool = await cosmoPool;
  const placeholders = cleanIds.map((_, index) => `@id${index}`).join(", ");
  const req = pool.request()
    .input("KontrolEdenID", user.userId || null)
    .input("KontrolEdenAd", user.userName || null);
  cleanIds.forEach((id, index) => req.input(`id${index}`, id));
  await req.query(`
    UPDATE KysDisKaynakliDokuman SET
      KontrolEdildi = 1,
      KontrolTarihi = GETDATE(),
      KontrolEdenID = @KontrolEdenID,
      KontrolEdenAd = @KontrolEdenAd,
      UpdatedAt = GETDATE()
    WHERE ID IN (${placeholders})
  `);
  return { count: cleanIds.length };
}
