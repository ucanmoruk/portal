/* eslint-disable @typescript-eslint/no-explicit-any */

import { randomUUID } from "node:crypto";
import { cosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";

type AnyRow = Record<string, any>;

let schemaReady: Promise<void> | null = null;

export type DisKaynakliDokumanInput = {
  birim?: string;
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

export const DIS_KAYNAKLI_BIRIMLER = ["Kalite", "Kimyasal Analiz Lab.", "Mikrobiyoloji Analiz Lab.", "Diğer"] as const;

function validateBirim(value: unknown): string {
  const birim = text(value) || "Kalite";
  if (!(DIS_KAYNAKLI_BIRIMLER as readonly string[]).includes(birim)) throw new Error("Geçerli bir birim seçin.");
  return birim;
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
        Birim VARCHAR(80) NOT NULL DEFAULT 'Kalite',
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
    await pool.request().query("ALTER TABLE KysDisKaynakliDokuman ADD COLUMN IF NOT EXISTS Birim VARCHAR(80) NOT NULL DEFAULT 'Kalite'");
  } else {
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'KysDisKaynakliDokuman')
      CREATE TABLE KysDisKaynakliDokuman (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        Akreditasyon BIT NOT NULL DEFAULT 0,
        Birim NVARCHAR(80) NOT NULL DEFAULT 'Kalite',
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
    await pool.request().query("IF COL_LENGTH('KysDisKaynakliDokuman', 'Birim') IS NULL ALTER TABLE KysDisKaynakliDokuman ADD Birim NVARCHAR(80) NOT NULL CONSTRAINT DF_KysDisKaynakliDokuman_Birim DEFAULT 'Kalite'");
  }
  await pool.request().query(hasMysqlConfig() ? `CREATE TABLE IF NOT EXISTS KysDisKaynakliDokumanLog (
    ID INT AUTO_INCREMENT PRIMARY KEY, DokumanID INT NOT NULL, KaynakAnahtar VARCHAR(100) NOT NULL,
    Islem VARCHAR(60) NOT NULL, KullaniciID VARCHAR(80) NULL, KullaniciAd VARCHAR(160) NULL,
    Tarih DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, DokumanKodu VARCHAR(80) NOT NULL,
    DokumanAdi VARCHAR(260) NOT NULL, YayinTarihi VARCHAR(80) NULL, Aciklama VARCHAR(500) NULL,
    Aktarildi INT NOT NULL DEFAULT 0, UNIQUE KEY UX_DisDokumanLog_Kaynak (KaynakAnahtar),
    KEY IX_DisDokumanLog_Dokuman (DokumanID,Tarih)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci` : `
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='KysDisKaynakliDokumanLog')
    CREATE TABLE KysDisKaynakliDokumanLog (
      ID INT IDENTITY(1,1) PRIMARY KEY, DokumanID INT NOT NULL, KaynakAnahtar NVARCHAR(100) NOT NULL UNIQUE,
      Islem NVARCHAR(60) NOT NULL, KullaniciID NVARCHAR(80) NULL, KullaniciAd NVARCHAR(160) NULL,
      Tarih DATETIME NOT NULL DEFAULT GETDATE(), DokumanKodu NVARCHAR(80) NOT NULL,
      DokumanAdi NVARCHAR(260) NOT NULL, YayinTarihi NVARCHAR(80) NULL, Aciklama NVARCHAR(500) NULL,
      Aktarildi INT NOT NULL DEFAULT 0)`);
  const insert = hasMysqlConfig() ? "INSERT IGNORE" : "INSERT";
  const key = (prefix: string) => hasMysqlConfig() ? `CONCAT('${prefix}',d.ID)` : `'${prefix}'+CAST(d.ID AS NVARCHAR(20))`;
  await pool.request().query(`${insert} INTO KysDisKaynakliDokumanLog
    (DokumanID,KaynakAnahtar,Islem,Tarih,DokumanKodu,DokumanAdi,YayinTarihi,Aciklama,Aktarildi)
    SELECT d.ID,${key("created:")},N'Oluşturuldu',d.CreatedAt,d.DokumanKodu,d.DokumanAdi,d.YayinTarihi,N'Mevcut kayıttan aktarıldı.',1
    FROM KysDisKaynakliDokuman d WHERE NOT EXISTS (SELECT 1 FROM KysDisKaynakliDokumanLog h WHERE h.KaynakAnahtar=${key("created:")})`);
  await pool.request().query(`${insert} INTO KysDisKaynakliDokumanLog
    (DokumanID,KaynakAnahtar,Islem,KullaniciID,KullaniciAd,Tarih,DokumanKodu,DokumanAdi,YayinTarihi,Aciklama,Aktarildi)
    SELECT d.ID,${key("legacy-check:")},N'Kontrol edildi',d.KontrolEdenID,d.KontrolEdenAd,d.KontrolTarihi,d.DokumanKodu,d.DokumanAdi,d.YayinTarihi,N'Önceki sistemde saklanan son kontrol kaydı.',1
    FROM KysDisKaynakliDokuman d WHERE d.KontrolTarihi IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM KysDisKaynakliDokumanLog h WHERE h.DokumanID=d.ID AND h.Islem=N'Kontrol edildi')`);

}

async function appendDocumentLog(executor: any, id: number, islem: string, user?: DisKaynakliDokumanKullanici, aciklama = "") {
  await executor.request().input("ID",id).input("Key",islem === "Oluşturuldu" ? `created:${id}` : randomUUID())
    .input("Islem",islem).input("UserID",user?.userId || null).input("UserName",user?.userName || null).input("Note",aciklama)
    .query(`INSERT INTO KysDisKaynakliDokumanLog (DokumanID,KaynakAnahtar,Islem,KullaniciID,KullaniciAd,Tarih,DokumanKodu,DokumanAdi,YayinTarihi,Aciklama)
      SELECT ID,@Key,@Islem,@UserID,@UserName,CASE WHEN @Islem=N'Kontrol edildi' THEN KontrolTarihi ELSE GETDATE() END,DokumanKodu,DokumanAdi,YayinTarihi,@Note
      FROM KysDisKaynakliDokuman WHERE ID=@ID`);
}

export async function listDisKaynakliDokumanHistory(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Geçersiz doküman ID.");
  await ensureKysDisKaynakliDokumanSchema();
  const pool = await cosmoPool;
  const result = await pool.request().input("ID",id).query(`SELECT ID,Islem,KullaniciAd,Tarih,DokumanKodu,DokumanAdi,YayinTarihi,Aciklama,Aktarildi
    FROM KysDisKaynakliDokumanLog WHERE DokumanID=@ID ORDER BY Tarih DESC,ID DESC`);
  return result.recordset.map((row: AnyRow) => ({ id:rowNumber(row,"ID"), islem:rowString(row,"Islem"), kullaniciAd:rowString(row,"KullaniciAd"), tarih:asDateTime(row.Tarih ?? row.tarih),
    dokumanKodu:rowString(row,"DokumanKodu"), dokumanAdi:rowString(row,"DokumanAdi"), yayinTarihi:rowString(row,"YayinTarihi"), aciklama:rowString(row,"Aciklama"), aktarildi:rowBool(row,"Aktarildi") }));
}

function mapRow(row: AnyRow) {
  return {
    id: rowNumber(row, "ID"),
    birim: rowString(row, "Birim") || (rowBool(row, "Akreditasyon") ? "Kalite" : "Diğer"),
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
  birim?: string;
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
  const birim = text(params.birim);
  const kontrol = text(params.kontrol);

  let where = "WHERE 1=1";
  if (search) where += " AND (DokumanKodu LIKE @search OR DokumanAdi LIKE @search OR Yayincisi LIKE @search)";
  if (birim) where += " AND Birim = @birim";
  if (kontrol === "edildi") where += " AND KontrolEdildi = 1";
  if (kontrol === "bekliyor") where += " AND KontrolEdildi = 0";

  const order =
    params.sort === "kod-asc" ? "DokumanKodu ASC" :
    params.sort === "ad-asc" ? "DokumanAdi ASC" :
    params.sort === "kontrol-desc" ? "KontrolTarihi DESC, ID DESC" :
    "UpdatedAt DESC, ID DESC";

  const bind = (req: any) => req
    .input("search", `%${search}%`)
    .input("birim", birim)
    .input("offset", offset)
    .input("limit", limit);

  const countRes = await bind(pool.request()).query(`SELECT COUNT(*) AS total FROM KysDisKaynakliDokuman ${where}`);
  const dataRes = await bind(pool.request()).query(`
    SELECT ID, Akreditasyon, Birim, DokumanKodu, DokumanAdi, Yayincisi, YayinTarihi, YayinLinki,
           PdfPath, PdfOriginalName, KontrolEdildi, KontrolTarihi, KontrolEdenAd, CreatedAt, UpdatedAt
    FROM KysDisKaynakliDokuman
    ${where}
    ORDER BY ${order}
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `);
  const statsRes = await pool.request().query(`
    SELECT
      COUNT(*) AS Toplam,
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
      kontrolEdilen,
      kontrolBekleyen: Math.max(toplam - kontrolEdilen, 0),
    },
  };
}

export async function createDisKaynakliDokuman(input: DisKaynakliDokumanInput, user?: DisKaynakliDokumanKullanici) {
  await ensureKysDisKaynakliDokumanSchema();
  const dokumanKodu = text(input.dokumanKodu);
  const dokumanAdi = text(input.dokumanAdi);
  if (!dokumanKodu) throw new Error("Doküman kodu zorunludur.");
  if (!dokumanAdi) throw new Error("Doküman adı zorunludur.");
  const birim = validateBirim(input.birim);
  const pool = await cosmoPool;
  const transaction = await pool.transaction();
  await transaction.begin();
  try {
    const res = await transaction.request()
      .input("Birim", birim)
      .input("DokumanKodu", dokumanKodu)
      .input("DokumanAdi", dokumanAdi)
      .input("Yayincisi", nullableText(input.yayincisi))
      .input("YayinTarihi", nullableText(input.yayinTarihi))
      .input("YayinLinki", cleanUrl(input.yayinLinki))
      .input("PdfPath", nullableText(input.pdfPath))
      .input("PdfOriginalName", nullableText(input.pdfOriginalName))
      .query(`
        INSERT INTO KysDisKaynakliDokuman
          (Birim, DokumanKodu, DokumanAdi, Yayincisi, YayinTarihi, YayinLinki, PdfPath, PdfOriginalName)
        OUTPUT INSERTED.ID
        VALUES (@Birim, @DokumanKodu, @DokumanAdi, @Yayincisi, @YayinTarihi, @YayinLinki, @PdfPath, @PdfOriginalName)
      `);

    const id = Number(res.recordset[0]?.ID ?? res.recordset[0]?.id ?? 0);
    if (!id) throw new Error("Doküman oluşturulamadı.");
    await appendDocumentLog(transaction,id,"Oluşturuldu",user);
    await transaction.commit();
    return { id };
  } catch (error) { await transaction.rollback(); throw error; }

}

export async function getDisKaynakliDokuman(id: number) {
  await ensureKysDisKaynakliDokumanSchema();
  const pool = await cosmoPool;
  const res = await pool.request().input("ID", id).query(`
    SELECT ID, Akreditasyon, Birim, DokumanKodu, DokumanAdi, Yayincisi, YayinTarihi, YayinLinki,
           PdfPath, PdfOriginalName, KontrolEdildi, KontrolTarihi, KontrolEdenAd, CreatedAt, UpdatedAt
    FROM KysDisKaynakliDokuman WHERE ID = @ID
  `);
  const row = res.recordset[0] as AnyRow | undefined;
  return row ? mapRow(row) : null;
}

/**
 * Doküman metadata'sını günceller. `input.pdfPath` verilmişse (yeni PDF
 * yüklendiyse) PDF'i de değiştirir; verilmemişse mevcut PDF korunur.
 * Dönüşteki `previousPdfPath`, PDF gerçekten değiştiyse eski dosyanın FTP'den
 * silinebilmesi için route'a iletilir (store kendisi FTP'ye dokunmaz).
 */
export async function updateDisKaynakliDokuman(id: number, input: DisKaynakliDokumanInput, user?: DisKaynakliDokumanKullanici) {
  await ensureKysDisKaynakliDokumanSchema();
  const pool = await cosmoPool;
  const existingRes = await pool.request().input("ID", id).query(
    "SELECT PdfPath, PdfOriginalName FROM KysDisKaynakliDokuman WHERE ID = @ID",
  );
  const existing = existingRes.recordset[0] as AnyRow | undefined;
  if (!existing) throw new Error("Doküman bulunamadı.");

  const dokumanKodu = text(input.dokumanKodu);
  const dokumanAdi = text(input.dokumanAdi);
  if (!dokumanKodu) throw new Error("Doküman kodu zorunludur.");
  if (!dokumanAdi) throw new Error("Doküman adı zorunludur.");

  const previousPdfPath = rowString(existing, "PdfPath");
  const pdfReplaced = Boolean(input.pdfPath);
  const nextPdfPath = pdfReplaced ? input.pdfPath! : previousPdfPath;
  const nextPdfOriginalName = pdfReplaced ? nullableText(input.pdfOriginalName) : rowString(existing, "PdfOriginalName");
  const birim = validateBirim(input.birim);

  const transaction = await pool.transaction();
  await transaction.begin();
  try {
    await transaction.request()
      .input("ID", id)
      .input("Birim", birim)
      .input("DokumanKodu", dokumanKodu)
      .input("DokumanAdi", dokumanAdi)
      .input("Yayincisi", nullableText(input.yayincisi))
      .input("YayinTarihi", nullableText(input.yayinTarihi))
      .input("YayinLinki", cleanUrl(input.yayinLinki))
      .input("PdfPath", nextPdfPath)
      .input("PdfOriginalName", nextPdfOriginalName)
      .query(`
        UPDATE KysDisKaynakliDokuman SET
          Birim = @Birim, DokumanKodu = @DokumanKodu, DokumanAdi = @DokumanAdi,
          Yayincisi = @Yayincisi, YayinTarihi = @YayinTarihi, YayinLinki = @YayinLinki,
          PdfPath = @PdfPath, PdfOriginalName = @PdfOriginalName, UpdatedAt = GETDATE()
        WHERE ID = @ID
      `);

    await appendDocumentLog(transaction,id,"Güncellendi",user,pdfReplaced ? "PDF dosyası değiştirildi." : "Doküman bilgileri güncellendi.");
    await transaction.commit();
  } catch (error) { await transaction.rollback(); throw error; }

  return { id, previousPdfPath: pdfReplaced && previousPdfPath !== nextPdfPath ? previousPdfPath : null };
}

/** Kaydı siler ve route'un FTP'den de silebilmesi için eski PdfPath'i döner. */
export async function deleteDisKaynakliDokuman(id: number) {
  await ensureKysDisKaynakliDokumanSchema();
  const pool = await cosmoPool;
  const existingRes = await pool.request().input("ID", id).query(
    "SELECT PdfPath FROM KysDisKaynakliDokuman WHERE ID = @ID",
  );
  const existing = existingRes.recordset[0] as AnyRow | undefined;
  if (!existing) throw new Error("Doküman bulunamadı.");

  await pool.request().input("ID", id).query("DELETE FROM KysDisKaynakliDokuman WHERE ID = @ID");
  return { pdfPath: rowString(existing, "PdfPath") };
}

export async function markDisKaynakliDokumanChecked(ids: number[], user: DisKaynakliDokumanKullanici) {
  await ensureKysDisKaynakliDokumanSchema();
  if (!Array.isArray(ids) || ids.length > 200 || ids.some(id => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) throw new Error("Geçersiz doküman seçimi (en fazla 200 kayıt).");
  const cleanIds = [...new Set(ids.map(Number))];
  if (!cleanIds.length) throw new Error("Kontrol edilecek doküman seçilmedi.");
  const pool = await cosmoPool;
  const transaction = await pool.transaction();
  await transaction.begin();
  try {
    for (const id of cleanIds) {
      const existing = await transaction.request().input("ID",id).query("SELECT ID FROM KysDisKaynakliDokuman WHERE ID=@ID");
      if (!existing.recordset.length) throw new Error("Seçili dokümanlardan biri bulunamadı. Listeyi yenileyin.");
      await transaction.request().input("ID",id).input("UserID",user.userId).input("UserName",user.userName).query(`
        UPDATE KysDisKaynakliDokuman SET KontrolEdildi=1,KontrolTarihi=GETDATE(),KontrolEdenID=@UserID,KontrolEdenAd=@UserName,UpdatedAt=GETDATE() WHERE ID=@ID`);
      await appendDocumentLog(transaction,id,"Kontrol edildi",user);
    }
    await transaction.commit();
    return { count:cleanIds.length };
  } catch (error) { await transaction.rollback(); throw error; }
}
