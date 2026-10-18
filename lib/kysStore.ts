/* eslint-disable @typescript-eslint/no-explicit-any */
import { ensureKysRequestNumbers, nextKysRequestNumber, nextSpektrotekRequestNumber } from "@/lib/kysRequestNumbers";
import { cosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";
import { requireRequestAcceptance, requireRequestTransition } from "@/lib/kysRequestRules";
import { ensureFaturaTrackingSchema } from "@/lib/faturaSchema";

import { normalizeKysProduct, readKysProduct } from "@/lib/kysProduct";
import { KYS_STOCK_SOURCES, kysStockSource } from "@/lib/kysStockSources";

type AnyRow = Record<string, any>;

let schemaReady: Promise<void> | null = null;

export type KysStockInput = {
  kaynak?: string;
  urun?: unknown;
  barkod?: string;
  malzemeTuru?: string;
  kod?: string;
  ad?: string;
  name?: string;
  casNo?: string;
  ozellik?: string;
  ambalaj?: string;
  saklamaKosullari?: string;
  kritikLimit?: number | string | null;
  stokDurumu?: string;
  birim?: string;
};

export type KysMovementInput = {
  hareketTipi?: string;
  miktar?: number | string;
  birim?: string;
  marka?: string;
  lot?: string;
  skt?: string | null;
  stokGirisTarihi?: string | null;
  kaynakBirimId?: number | null;
  hedefBirimId?: number | null;
  aciklama?: string;
  kullaniciId?: string | null;
  kullaniciAd?: string | null;
};

export type KysRequestInput = {
  seri?: string;
  firmaAdi?: string;
  talepTuru?: string;
  notlar?: string;
  teknikSartname?: string;
  olusturanId?: string | null;
  olusturanAd?: string | null;
  kalemler?: Array<{
    stokId?: number | null;
    kod?: string;
    malzemeAdi?: string;
    miktar?: number | string;
    birim?: string;
    ozellik?: string;
    marka?: string;
    kullaniciNotu?: string;
  }>;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function nullableText(value: unknown): string | null {
  const valueText = text(value);
  return valueText || null;
}

function numberValue(value: unknown, fallback = 0): number {
  const raw = String(value ?? "").trim();
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

function dateValue(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : raw;
}

function asDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = String(value);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : raw.slice(0, 10);
}

function asDateTime(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function ean13CheckDigit(base: string): number {
  let sum = 0;
  for (let i = 0; i < base.length; i += 1) {
    sum += Number(base[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(value: string): boolean {
  return /^\d{13}$/.test(value) && ean13CheckDigit(value.slice(0, 12)) === Number(value[12]);
}

function generatedStockBarcode(): string {
  const base = `869${String(Date.now()).slice(-7)}${String(Math.floor(Math.random() * 100)).padStart(2, "0")}`;
  return `${base}${ean13CheckDigit(base)}`;
}

/** Ürün kartlarında (Unique dışı kaynaklar) barkod EAN-13 olmalı; boşsa yeni EAN-13 üretilir. */
async function productBarcode(pool: any, value: unknown, excludeId = 0): Promise<string> {
  const barkod = text(value).replace(/\s+/g, "");
  if (!barkod) return generatedUniqueStockBarcode(pool);
  if (!isValidEan13(barkod)) throw new Error("Barkod geçerli bir EAN-13 olmalıdır (13 hane, doğru kontrol hanesi). Boş bırakırsanız otomatik oluşturulur.");
  const existing = await pool.request().input("Barkod", barkod).input("ID", excludeId)
    .query("SELECT ID FROM KysStokKart WHERE Barkod = @Barkod AND ID <> @ID");
  if (existing.recordset[0]) throw new Error("Bu barkod başka bir stok kartında kullanılıyor.");
  return barkod;
}

async function generatedUniqueStockBarcode(pool: any): Promise<string> {
  for (let i = 0; i < 10; i += 1) {
    const barkod = generatedStockBarcode();
    const existing = await pool.request()
      .input("Barkod", barkod)
      .query("SELECT ID FROM KysStokKart WHERE Barkod = @Barkod");
    if (!existing.recordset[0]) return barkod;
  }
  throw new Error("Benzersiz barkod oluşturulamadı. Lütfen tekrar deneyin.");
}

function rowNumber(row: AnyRow, key: string): number {
  return Number(row[key] ?? row[key.toLowerCase()] ?? 0);
}

function rowString(row: AnyRow, key: string): string {
  return String(row[key] ?? row[key.toLowerCase()] ?? "");
}

export async function ensureKysSchema() {
  if (!schemaReady) schemaReady = createKysSchema().catch(error => { schemaReady = null; throw error; });
  return schemaReady;
}

async function createKysSchema() {
  const pool = await cosmoPool;

  if (hasMysqlConfig()) {
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS KysLaboratuvarBirim (
        ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        LegacyID INT NULL,
        Kod VARCHAR(40) NULL,
        Ad VARCHAR(160) NOT NULL,
        Aciklama TEXT NULL,
        Durum VARCHAR(20) NOT NULL DEFAULT 'Aktif',
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY UX_KysLaboratuvarBirim_Ad (Ad)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    await pool.request().query("ALTER TABLE KysLaboratuvarBirim ADD COLUMN IF NOT EXISTS LegacyID INT NULL");
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS KysStokKart (
        ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        LegacyID INT NULL,
        Barkod VARCHAR(80) NULL,
        MalzemeTuru VARCHAR(60) NOT NULL DEFAULT 'Sarf',
        Kod VARCHAR(80) NOT NULL,
        Ad VARCHAR(220) NOT NULL,
        Name VARCHAR(220) NULL,
        CasNo VARCHAR(80) NULL,
        Ozellik TEXT NULL,
        Ambalaj VARCHAR(160) NULL,
        SaklamaKosullari VARCHAR(220) NULL,
        KritikLimit DECIMAL(18,4) NOT NULL DEFAULT 0,
        StokMiktari DECIMAL(18,4) NOT NULL DEFAULT 0,
        StokDurumu VARCHAR(30) NOT NULL DEFAULT 'Aktif',
        Birim VARCHAR(40) NOT NULL DEFAULT 'Adet',
        GorselDosyaAdi VARCHAR(260) NULL,
        GorselMimeType VARCHAR(120) NULL,
        GorselData LONGBLOB NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY UX_KysStokKart_Kod (Kod),
        KEY IX_KysStokKart_Barkod (Barkod)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    await pool.request().query("ALTER TABLE KysStokKart ADD COLUMN IF NOT EXISTS LegacyID INT NULL");
    await pool.request().query("ALTER TABLE KysStokKart ADD COLUMN IF NOT EXISTS GorselDosyaAdi VARCHAR(260) NULL");
    await pool.request().query("ALTER TABLE KysStokKart ADD COLUMN IF NOT EXISTS GorselMimeType VARCHAR(120) NULL");
    await pool.request().query("ALTER TABLE KysStokKart ADD COLUMN IF NOT EXISTS GorselData LONGBLOB NULL");
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS KysStokBirimMiktar (
        ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        StokID INT NOT NULL,
        BirimID INT NOT NULL,
        Miktar DECIMAL(18,4) NOT NULL DEFAULT 0,
        UNIQUE KEY UX_KysStokBirimMiktar_Stok_Birim (StokID, BirimID),
        KEY IX_KysStokBirimMiktar_StokID (StokID)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS KysStokHareket (
        ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        StokID INT NOT NULL,
        HareketTipi VARCHAR(30) NOT NULL,
        Miktar DECIMAL(18,4) NOT NULL,
        Birim VARCHAR(40) NOT NULL DEFAULT 'Adet',
        Marka VARCHAR(160) NULL,
        Lot VARCHAR(120) NULL,
        SKT DATE NULL,
        StokGirisTarihi DATE NULL,
        KaynakBirimID INT NULL,
        HedefBirimID INT NULL,
        Aciklama TEXT NULL,
        KullaniciID VARCHAR(80) NULL,
        KullaniciAd VARCHAR(160) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY IX_KysStokHareket_StokID (StokID),
        KEY IX_KysStokHareket_SKT (SKT)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS KysStokSertifika (
        ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        StokID INT NOT NULL,
        HareketID INT NULL,
        DosyaAdi VARCHAR(260) NOT NULL,
        MimeType VARCHAR(120) NULL,
        FileData LONGBLOB NOT NULL,
        YukleyenID VARCHAR(80) NULL,
        YukleyenAd VARCHAR(160) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY IX_KysStokSertifika_StokID (StokID)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS KysTalep (
        ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        TalepNo VARCHAR(40) NOT NULL,
        TalepTuru VARCHAR(20) NOT NULL DEFAULT 'Sarf',
        Durum VARCHAR(40) NOT NULL DEFAULT 'Taslak',
        OlusturanID VARCHAR(80) NULL,
        OlusturanAd VARCHAR(160) NULL,
        OlusturmaTarihi DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        OnaylayanID VARCHAR(80) NULL,
        OnaylayanAd VARCHAR(160) NULL,
        OnayTarihi DATETIME NULL,
        IslemeAlanID VARCHAR(80) NULL,
        IslemeAlanAd VARCHAR(160) NULL,
        IslemeAlmaTarihi DATETIME NULL,
        Notlar TEXT NULL,
        TeknikSartname TEXT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY UX_KysTalep_TalepNo (TalepNo)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS KysTalepKalem (
        ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        TalepID INT NOT NULL,
        StokID INT NULL,
        Kod VARCHAR(80) NULL,
        MalzemeAdi VARCHAR(220) NOT NULL,
        Miktar DECIMAL(18,4) NOT NULL DEFAULT 0,
        Birim VARCHAR(40) NOT NULL DEFAULT 'Adet',
        Ozellik TEXT NULL,
        Marka VARCHAR(160) NULL,
        KullaniciNotu TEXT NULL,
        KabulMiktari DECIMAL(18,4) NOT NULL DEFAULT 0,
        Durum VARCHAR(40) NOT NULL DEFAULT 'Bekliyor',
        KEY IX_KysTalepKalem_TalepID (TalepID)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS KysTalepKabul (
        ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        TalepID INT NOT NULL,
        KalemID INT NOT NULL,
        GelenMiktar DECIMAL(18,4) NOT NULL DEFAULT 0,
        IstenilenMiktardaGeldi TINYINT(1) NOT NULL DEFAULT 0,
        MarkaOzellikUygun TINYINT(1) NOT NULL DEFAULT 0,
        SktUygun TINYINT(1) NOT NULL DEFAULT 0,
        SertifikaGerekli TINYINT(1) NOT NULL DEFAULT 0,
        GenelDegerlendirme TEXT NULL,
        KabulTarihi DATE NOT NULL,
        DegerlendirenID VARCHAR(80) NULL,
        DegerlendirenAd VARCHAR(160) NULL,
        StokID INT NULL,
        HareketID INT NULL,
        Tedarikci VARCHAR(220) NULL,
        SatinAlmaTarihi DATE NULL,
        BirimFiyat DECIMAL(18,4) NULL,
        ParaBirimi VARCHAR(10) NULL,
        ToplamTutar DECIMAL(18,4) NULL,
        FaturaNo VARCHAR(100) NULL,
        SatinAlanID VARCHAR(80) NULL,
        SatinAlanAd VARCHAR(160) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY IX_KysTalepKabul_TalepID (TalepID)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    await pool.request().query("ALTER TABLE KysTalepKabul ADD COLUMN IF NOT EXISTS Tedarikci VARCHAR(220) NULL");
    await pool.request().query("ALTER TABLE KysTalepKabul ADD COLUMN IF NOT EXISTS SatinAlmaTarihi DATE NULL");
    await pool.request().query("ALTER TABLE KysTalepKabul ADD COLUMN IF NOT EXISTS BirimFiyat DECIMAL(18,4) NULL");
    await pool.request().query("ALTER TABLE KysTalepKabul ADD COLUMN IF NOT EXISTS ParaBirimi VARCHAR(10) NULL");
    await pool.request().query("ALTER TABLE KysTalepKabul ADD COLUMN IF NOT EXISTS ToplamTutar DECIMAL(18,4) NULL");
    await pool.request().query("ALTER TABLE KysTalepKabul ADD COLUMN IF NOT EXISTS FaturaNo VARCHAR(100) NULL");
    await pool.request().query("ALTER TABLE KysTalepKabul ADD COLUMN IF NOT EXISTS SatinAlanID VARCHAR(80) NULL");
    await pool.request().query("ALTER TABLE KysTalepKabul ADD COLUMN IF NOT EXISTS SatinAlanAd VARCHAR(160) NULL");
  } else {
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'KysLaboratuvarBirim')
      CREATE TABLE KysLaboratuvarBirim (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        LegacyID INT NULL,
        Kod NVARCHAR(40) NULL,
        Ad NVARCHAR(160) NOT NULL UNIQUE,
        Aciklama NVARCHAR(MAX) NULL,
        Durum NVARCHAR(20) NOT NULL DEFAULT 'Aktif',
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        UpdatedAt DATETIME NOT NULL DEFAULT GETDATE()
      )
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'KysStokKart')
      CREATE TABLE KysStokKart (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        LegacyID INT NULL,
        Barkod NVARCHAR(80) NULL,
        MalzemeTuru NVARCHAR(60) NOT NULL DEFAULT 'Sarf',
        Kod NVARCHAR(80) NOT NULL UNIQUE,
        Ad NVARCHAR(220) NOT NULL,
        Name NVARCHAR(220) NULL,
        CasNo NVARCHAR(80) NULL,
        Ozellik NVARCHAR(MAX) NULL,
        Ambalaj NVARCHAR(160) NULL,
        SaklamaKosullari NVARCHAR(220) NULL,
        KritikLimit DECIMAL(18,4) NOT NULL DEFAULT 0,
        StokMiktari DECIMAL(18,4) NOT NULL DEFAULT 0,
        StokDurumu NVARCHAR(30) NOT NULL DEFAULT 'Aktif',
        Birim NVARCHAR(40) NOT NULL DEFAULT 'Adet',
        GorselDosyaAdi NVARCHAR(260) NULL,
        GorselMimeType NVARCHAR(120) NULL,
        GorselData VARBINARY(MAX) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        UpdatedAt DATETIME NOT NULL DEFAULT GETDATE()
      )
    `);
    await pool.request().query("IF COL_LENGTH('KysStokKart', 'GorselDosyaAdi') IS NULL ALTER TABLE KysStokKart ADD GorselDosyaAdi NVARCHAR(260) NULL");
    await pool.request().query("IF COL_LENGTH('KysStokKart', 'GorselMimeType') IS NULL ALTER TABLE KysStokKart ADD GorselMimeType NVARCHAR(120) NULL");
    await pool.request().query("IF COL_LENGTH('KysStokKart', 'GorselData') IS NULL ALTER TABLE KysStokKart ADD GorselData VARBINARY(MAX) NULL");
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'KysStokBirimMiktar')
      CREATE TABLE KysStokBirimMiktar (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        StokID INT NOT NULL,
        BirimID INT NOT NULL,
        Miktar DECIMAL(18,4) NOT NULL DEFAULT 0
      )
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'KysStokHareket')
      CREATE TABLE KysStokHareket (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        StokID INT NOT NULL,
        HareketTipi NVARCHAR(30) NOT NULL,
        Miktar DECIMAL(18,4) NOT NULL,
        Birim NVARCHAR(40) NOT NULL DEFAULT 'Adet',
        Marka NVARCHAR(160) NULL,
        Lot NVARCHAR(120) NULL,
        SKT DATE NULL,
        StokGirisTarihi DATE NULL,
        KaynakBirimID INT NULL,
        HedefBirimID INT NULL,
        Aciklama NVARCHAR(MAX) NULL,
        KullaniciID NVARCHAR(80) NULL,
        KullaniciAd NVARCHAR(160) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
      )
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'KysStokSertifika')
      CREATE TABLE KysStokSertifika (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        StokID INT NOT NULL,
        HareketID INT NULL,
        DosyaAdi NVARCHAR(260) NOT NULL,
        MimeType NVARCHAR(120) NULL,
        FileData VARBINARY(MAX) NOT NULL,
        YukleyenID NVARCHAR(80) NULL,
        YukleyenAd NVARCHAR(160) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
      )
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'KysTalep')
      CREATE TABLE KysTalep (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        TalepNo NVARCHAR(40) NOT NULL UNIQUE,
        TalepTuru NVARCHAR(20) NOT NULL DEFAULT 'Sarf',
        Durum NVARCHAR(40) NOT NULL DEFAULT 'Taslak',
        OlusturanID NVARCHAR(80) NULL,
        OlusturanAd NVARCHAR(160) NULL,
        OlusturmaTarihi DATETIME NOT NULL DEFAULT GETDATE(),
        OnaylayanID NVARCHAR(80) NULL,
        OnaylayanAd NVARCHAR(160) NULL,
        OnayTarihi DATETIME NULL,
        IslemeAlanID NVARCHAR(80) NULL,
        IslemeAlanAd NVARCHAR(160) NULL,
        IslemeAlmaTarihi DATETIME NULL,
        Notlar NVARCHAR(MAX) NULL,
        TeknikSartname NVARCHAR(MAX) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        UpdatedAt DATETIME NOT NULL DEFAULT GETDATE()
      )
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'KysTalepKalem')
      CREATE TABLE KysTalepKalem (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        TalepID INT NOT NULL,
        StokID INT NULL,
        Kod NVARCHAR(80) NULL,
        MalzemeAdi NVARCHAR(220) NOT NULL,
        Miktar DECIMAL(18,4) NOT NULL DEFAULT 0,
        Birim NVARCHAR(40) NOT NULL DEFAULT 'Adet',
        Ozellik NVARCHAR(MAX) NULL,
        Marka NVARCHAR(160) NULL,
        KullaniciNotu NVARCHAR(MAX) NULL,
        KabulMiktari DECIMAL(18,4) NOT NULL DEFAULT 0,
        Durum NVARCHAR(40) NOT NULL DEFAULT 'Bekliyor'
      )
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'KysTalepKabul')
      CREATE TABLE KysTalepKabul (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        TalepID INT NOT NULL,
        KalemID INT NOT NULL,
        GelenMiktar DECIMAL(18,4) NOT NULL DEFAULT 0,
        IstenilenMiktardaGeldi BIT NOT NULL DEFAULT 0,
        MarkaOzellikUygun BIT NOT NULL DEFAULT 0,
        SktUygun BIT NOT NULL DEFAULT 0,
        SertifikaGerekli BIT NOT NULL DEFAULT 0,
        GenelDegerlendirme NVARCHAR(MAX) NULL,
        KabulTarihi DATE NOT NULL,
        DegerlendirenID NVARCHAR(80) NULL,
        DegerlendirenAd NVARCHAR(160) NULL,
        StokID INT NULL,
        HareketID INT NULL,
        Tedarikci NVARCHAR(220) NULL,
        SatinAlmaTarihi DATE NULL,
        BirimFiyat DECIMAL(18,4) NULL,
        ParaBirimi NVARCHAR(10) NULL,
        ToplamTutar DECIMAL(18,4) NULL,
        FaturaNo NVARCHAR(100) NULL,
        SatinAlanID NVARCHAR(80) NULL,
        SatinAlanAd NVARCHAR(160) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
      )
    `);
    await pool.request().query("IF COL_LENGTH('KysTalepKabul', 'Tedarikci') IS NULL ALTER TABLE KysTalepKabul ADD Tedarikci NVARCHAR(220) NULL");
    await pool.request().query("IF COL_LENGTH('KysTalepKabul', 'SatinAlmaTarihi') IS NULL ALTER TABLE KysTalepKabul ADD SatinAlmaTarihi DATE NULL");
    await pool.request().query("IF COL_LENGTH('KysTalepKabul', 'BirimFiyat') IS NULL ALTER TABLE KysTalepKabul ADD BirimFiyat DECIMAL(18,4) NULL");
    await pool.request().query("IF COL_LENGTH('KysTalepKabul', 'ParaBirimi') IS NULL ALTER TABLE KysTalepKabul ADD ParaBirimi NVARCHAR(10) NULL");
    await pool.request().query("IF COL_LENGTH('KysTalepKabul', 'ToplamTutar') IS NULL ALTER TABLE KysTalepKabul ADD ToplamTutar DECIMAL(18,4) NULL");
    await pool.request().query("IF COL_LENGTH('KysTalepKabul', 'FaturaNo') IS NULL ALTER TABLE KysTalepKabul ADD FaturaNo NVARCHAR(100) NULL");
    await pool.request().query("IF COL_LENGTH('KysTalepKabul', 'SatinAlanID') IS NULL ALTER TABLE KysTalepKabul ADD SatinAlanID NVARCHAR(80) NULL");
    await pool.request().query("IF COL_LENGTH('KysTalepKabul', 'SatinAlanAd') IS NULL ALTER TABLE KysTalepKabul ADD SatinAlanAd NVARCHAR(160) NULL");
  }

  // Nullable addition allows a retryable backfill without overwriting chosen sources.
  await pool.request().query(hasMysqlConfig()
    ? "ALTER TABLE KysStokKart ADD COLUMN IF NOT EXISTS Kaynak VARCHAR(20) NULL"
    : "IF COL_LENGTH('KysStokKart', 'Kaynak') IS NULL ALTER TABLE KysStokKart ADD Kaynak NVARCHAR(20) NULL");
  await pool.request().query("UPDATE KysStokKart SET Kaynak = CASE WHEN MalzemeTuru = 'Spektrotek' THEN 'Spektrotek' ELSE 'Unique' END WHERE Kaynak IS NULL OR Kaynak = ''");

  await pool.request().query(hasMysqlConfig()
    ? "ALTER TABLE KysStokKart ADD COLUMN IF NOT EXISTS UrunBilgileri LONGTEXT NULL"
    : "IF COL_LENGTH('KysStokKart', 'UrunBilgileri') IS NULL ALTER TABLE KysStokKart ADD UrunBilgileri NVARCHAR(MAX) NULL");
  await pool.request().query(hasMysqlConfig() ? `
    CREATE TABLE IF NOT EXISTS KysStokGorsel (
      ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      StokID INT NOT NULL,
      DosyaAdi VARCHAR(260) NOT NULL,
      MimeType VARCHAR(120) NOT NULL,
      DosyaData LONGBLOB NOT NULL,
      AltMetin VARCHAR(220) NULL,
      Sira INT NOT NULL DEFAULT 0,
      Silindi TINYINT NOT NULL DEFAULT 0,
      CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY IX_KysStokGorsel_Stok (StokID, Silindi, Sira)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
  ` : `
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'KysStokGorsel')
    CREATE TABLE KysStokGorsel (
      ID INT IDENTITY(1,1) PRIMARY KEY,
      StokID INT NOT NULL REFERENCES KysStokKart(ID),
      DosyaAdi NVARCHAR(260) NOT NULL,
      MimeType NVARCHAR(120) NOT NULL,
      DosyaData VARBINARY(MAX) NOT NULL,
      AltMetin NVARCHAR(220) NULL,
      Sira INT NOT NULL DEFAULT 0,
      Silindi BIT NOT NULL DEFAULT 0,
      CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
    )
  `);

  await pool.request().query(hasMysqlConfig()
    ? "ALTER TABLE KysTalep ADD COLUMN IF NOT EXISTS FirmaAdi VARCHAR(220) NULL"
    : "IF COL_LENGTH('KysTalep', 'FirmaAdi') IS NULL ALTER TABLE KysTalep ADD FirmaAdi NVARCHAR(220) NULL");

  await pool.request().query(hasMysqlConfig()
    ? "ALTER TABLE KysTalep ADD COLUMN IF NOT EXISTS Seri VARCHAR(20) NOT NULL DEFAULT 'Unique'"
    : "IF COL_LENGTH('KysTalep', 'Seri') IS NULL ALTER TABLE KysTalep ADD Seri NVARCHAR(20) NOT NULL DEFAULT 'Unique'");
  await pool.request().query("UPDATE KysTalep SET Seri='Spektrotek' WHERE TalepNo LIKE 'S%' AND Seri='Unique'");

  for (const [name, mysqlType, sqlType] of [["SiparisFaturaID","INT","INT"],["SiparisFaturaNo","VARCHAR(100)","NVARCHAR(100)"],["SiparisFaturaTutari","DECIMAL(18,2)","DECIMAL(18,2)"],["SiparisVade","DATE","DATE"],["OdemeDurumu","VARCHAR(30)","NVARCHAR(30)"]]) await pool.request().query(hasMysqlConfig()
    ? `ALTER TABLE KysTalep ADD COLUMN IF NOT EXISTS ${name} ${mysqlType} NULL`
    : `IF COL_LENGTH('KysTalep', '${name}') IS NULL ALTER TABLE KysTalep ADD ${name} ${sqlType} NULL`);

  for (const birim of ["Depo", "Mikrobiyoloji", "Kimyasal", "Dış Laboratuvar", "Numune Kabul"]) {
    await pool.request().input("Ad", birim).query(`
      INSERT INTO KysLaboratuvarBirim (Ad, Durum)
      SELECT @Ad, 'Aktif'
      WHERE NOT EXISTS (SELECT 1 FROM KysLaboratuvarBirim WHERE Ad = @Ad)
    `);
  }
}

export async function listKysBirimler() {
  await ensureKysSchema();
  const pool = await cosmoPool;
  const res = await pool.request().query(`
    SELECT ID, LegacyID, Kod, Ad, Aciklama, Durum, CreatedAt, UpdatedAt
    FROM KysLaboratuvarBirim
    ORDER BY CASE WHEN Durum = 'Aktif' THEN 0 ELSE 1 END, Ad
  `);
  return res.recordset.map((r: AnyRow) => ({
    id: rowNumber(r, "ID"),
    legacyId: r.LegacyID == null ? null : Number(r.LegacyID),
    kod: rowString(r, "Kod"),
    ad: rowString(r, "Ad"),
    aciklama: rowString(r, "Aciklama"),
    durum: rowString(r, "Durum") || "Aktif",
    createdAt: asDateTime(r.CreatedAt),
    updatedAt: asDateTime(r.UpdatedAt),
  }));
}

export async function createKysBirim(input: { kod?: string; ad?: string; aciklama?: string; durum?: string }) {
  await ensureKysSchema();
  const ad = text(input.ad);
  if (!ad) throw new Error("Birim adı zorunludur.");
  const pool = await cosmoPool;
  const res = await pool.request()
    .input("Kod", nullableText(input.kod))
    .input("Ad", ad)
    .input("Aciklama", nullableText(input.aciklama))
    .input("Durum", text(input.durum) || "Aktif")
    .query(`
      INSERT INTO KysLaboratuvarBirim (Kod, Ad, Aciklama, Durum)
      OUTPUT INSERTED.ID
      VALUES (@Kod, @Ad, @Aciklama, @Durum)
    `);
  return Number(res.recordset[0]?.ID || res.recordset[0]?.id || 0);
}

export async function updateKysBirim(id: number, input: { kod?: string; ad?: string; aciklama?: string; durum?: string }) {
  await ensureKysSchema();
  const pool = await cosmoPool;
  await pool.request()
    .input("ID", id)
    .input("Kod", nullableText(input.kod))
    .input("Ad", text(input.ad))
    .input("Aciklama", nullableText(input.aciklama))
    .input("Durum", text(input.durum) || "Aktif")
    .query(`
      UPDATE KysLaboratuvarBirim
      SET Kod = @Kod, Ad = @Ad, Aciklama = @Aciklama, Durum = @Durum, UpdatedAt = GETDATE()
      WHERE ID = @ID
    `);
}

export async function listKysStocks(params: {
  search?: string;
  liste?: "stok" | "urun";
  kaynak?: string;
  malzemeTuru?: string;
  kategori?: string;
  durum?: string;
  kritik?: boolean;
  sort?: string;
  page?: number;
  limit?: number;
  allowedFirmalar?: string[];
}) {
  await ensureKysSchema();
  const pool = await cosmoPool;
  const page = Math.max(1, Number(params.page || 1));
  const limit = Math.min(100, Math.max(5, Number(params.limit || 20)));
  const offset = (page - 1) * limit;
  const search = text(params.search);
  const malzemeTuru = text(params.malzemeTuru);
  const durum = text(params.durum);
  const kategori = text(params.kategori);
  // Listede kategorisi boş ürünler malzeme türüyle gösterildiği için filtre de aynı değeri kullanır.
  const kategoriSql = "COALESCE(NULLIF(JSON_VALUE(UrunBilgileri, '$.kategori'), ''), MalzemeTuru)";

  let scope = "WHERE 1=1";
  if (params.liste === "stok") scope += " AND Kaynak = 'Unique'";
  if (params.liste === "urun") scope += " AND Kaynak IN ('Root','Spektrotek')";
  if (params.allowedFirmalar) {
    const visibleSources = KYS_STOCK_SOURCES.filter(source => params.allowedFirmalar!.includes(source));
    scope += visibleSources.length ? ` AND Kaynak IN (${visibleSources.map(source => `'${source}'`).join(",")})` : " AND 1 = 0";
  }
  let where = scope;
  if (search) where += " AND (Kod LIKE @search OR Ad LIKE @search OR Name LIKE @search OR Barkod LIKE @search OR CasNo LIKE @search)";
  if (malzemeTuru) where += " AND MalzemeTuru = @malzemeTuru";
  if (kategori) where += ` AND ${kategoriSql} = @kategori`;
  if (durum) where += " AND StokDurumu = @durum";
  if (params.kritik) where += " AND StokMiktari <= KritikLimit";
  if (params.kaynak) where += " AND Kaynak = @kaynak";
  const order =
    params.sort === "miktar-asc" ? "StokMiktari ASC, Ad ASC" :
    params.sort === "miktar-desc" ? "StokMiktari DESC, Ad ASC" :
    "ID DESC";

  const bind = (req: any) => req
    .input("search", `%${search}%`)
    .input("kaynak", text(params.kaynak))
    .input("malzemeTuru", malzemeTuru)
    .input("kategori", kategori)
    .input("durum", durum);

  const countRes = await bind(pool.request()).query(`SELECT COUNT(*) AS total FROM KysStokKart ${where}`);
  const kategoriler = params.liste === "urun"
    ? (await pool.request().query(`SELECT DISTINCT ${kategoriSql} AS kategori FROM KysStokKart ${scope} AND ${kategoriSql} <> ''`)).recordset
      .map((r: AnyRow) => text(r.kategori ?? r.KATEGORI)).filter(Boolean).sort((a: string, b: string) => a.localeCompare(b, "tr"))
    : [];
  const dataRes = await bind(pool.request())
    .input("offset", offset)
    .input("limit", limit)
    .query(`
      SELECT ID, LegacyID, Barkod, Kaynak, UrunBilgileri, MalzemeTuru, Kod, Ad, Name, CasNo, Ozellik, Ambalaj,
             SaklamaKosullari, KritikLimit, StokMiktari, StokDurumu, Birim, GorselDosyaAdi, CreatedAt, UpdatedAt
      FROM KysStokKart
      ${where}
      ORDER BY ${order}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

  const total = Number(countRes.recordset[0]?.total || 0);
  return {
    data: dataRes.recordset.map(mapStock),
    kategoriler,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

function mapStock(r: AnyRow) {
  const stokMiktari = Number(r.StokMiktari ?? 0);
  const kritikLimit = Number(r.KritikLimit ?? 0);
  return {
    id: rowNumber(r, "ID"),
    legacyId: r.LegacyID == null ? null : Number(r.LegacyID),
    barkod: rowString(r, "Barkod"),
    kaynak: rowString(r, "Kaynak"),
    urun: readKysProduct(r.UrunBilgileri ?? r.urunbilgileri),
    malzemeTuru: rowString(r, "MalzemeTuru"),
    kod: rowString(r, "Kod"),
    ad: rowString(r, "Ad"),
    name: rowString(r, "Name"),
    casNo: rowString(r, "CasNo"),
    ozellik: rowString(r, "Ozellik"),
    ambalaj: rowString(r, "Ambalaj"),
    saklamaKosullari: rowString(r, "SaklamaKosullari"),
    kritikLimit,
    stokMiktari,
    kritikMi: kritikLimit > 0 && stokMiktari <= kritikLimit,
    stokDurumu: rowString(r, "StokDurumu") || "Aktif",
    birim: rowString(r, "Birim") || "Adet",
    hasImage: Boolean(rowString(r, "GorselDosyaAdi")),
    gorselDosyaAdi: rowString(r, "GorselDosyaAdi"),
    createdAt: asDateTime(r.CreatedAt),
    updatedAt: asDateTime(r.UpdatedAt),
  };
}

export async function createKysStock(input: KysStockInput, executor?: any) {
  await ensureKysSchema();
  const kod = text(input.kod);
  const ad = text(input.ad);
  if (!kod || !ad) throw new Error("Kod ve ad zorunludur.");
  const source = kysStockSource(input.kaynak, input.malzemeTuru);
  const product = input.urun === undefined ? null : JSON.stringify(normalizeKysProduct(input.urun, source));
  const pool = executor || await cosmoPool;
  const res = await pool.request()
    .input("Barkod", source === "Unique"
      ? nullableText(input.barkod) || await generatedUniqueStockBarcode(pool)
      : await productBarcode(pool, input.barkod))
    .input("Kaynak", source)
    .input("UrunBilgileri", product)
    .input("MalzemeTuru", text(input.malzemeTuru) || "Sarf")
    .input("Kod", kod)
    .input("Ad", ad)
    .input("Name", nullableText(input.name))
    .input("CasNo", nullableText(input.casNo))
    .input("Ozellik", nullableText(input.ozellik))
    .input("Ambalaj", nullableText(input.ambalaj))
    .input("SaklamaKosullari", nullableText(input.saklamaKosullari))
    .input("KritikLimit", numberValue(input.kritikLimit))
    .input("StokDurumu", text(input.stokDurumu) || "Aktif")
    .input("Birim", text(input.birim) || "Adet")
    .query(`
      INSERT INTO KysStokKart
        (Barkod, Kaynak, UrunBilgileri, MalzemeTuru, Kod, Ad, Name, CasNo, Ozellik, Ambalaj, SaklamaKosullari, KritikLimit, StokDurumu, Birim)
      OUTPUT INSERTED.ID
      VALUES
        (@Barkod, @Kaynak, @UrunBilgileri, @MalzemeTuru, @Kod, @Ad, @Name, @CasNo, @Ozellik, @Ambalaj, @SaklamaKosullari, @KritikLimit, @StokDurumu, @Birim)
    `);
  return Number(res.recordset[0]?.ID || res.recordset[0]?.id || 0);
}

/** Yeni kartı ilk stok girişiyle birlikte tek işlemde açar; giriş hareket geçmişinde "İlk stok kaydı" olarak görünür. */
export async function createKysStockWithOpening(input: KysStockInput, opening: { miktar?: unknown; kullaniciId?: string | null; kullaniciAd?: string | null }) {
  const raw = text(opening.miktar);
  const miktar = raw ? numberValue(raw, Number.NaN) : 0;
  if (!Number.isFinite(miktar) || miktar < 0) throw new Error("Başlangıç stok miktarı 0 veya pozitif bir sayı olmalıdır.");
  if (!miktar) return createKysStock(input);
  await ensureKysSchema();
  const tx = await (await cosmoPool).transaction();
  await tx.begin();
  try {
    const id = await createKysStock(input, tx);
    await createKysStockMovement(id, {
      hareketTipi: "Giriş", miktar, birim: text(input.birim) || "Adet",
      marka: text((input.urun as { marka?: unknown } | undefined)?.marka) || undefined,
      stokGirisTarihi: new Date().toISOString().slice(0, 10), aciklama: "İlk stok kaydı",
      kullaniciId: opening.kullaniciId, kullaniciAd: opening.kullaniciAd,
    }, tx);
    await tx.commit();
    return id;
  } catch (error) { await tx.rollback(); throw error; }
}

export async function updateKysStock(id: number, input: KysStockInput) {
  await ensureKysSchema();
  const pool = await cosmoPool;
  if (!text(input.kod) || !text(input.ad)) throw new Error("Kod ve ad zorunludur.");
  const current = (await pool.request().input("ID", id).query("SELECT Kaynak, UrunBilgileri FROM KysStokKart WHERE ID=@ID")).recordset[0];
  if (!current) throw new Error("Stok kartı bulunamadı.");
  const source = kysStockSource(input.kaynak ?? rowString(current, "Kaynak"));
  const product = input.urun === undefined
    ? JSON.stringify(normalizeKysProduct(readKysProduct(current.UrunBilgileri), source))
    : JSON.stringify(normalizeKysProduct(input.urun, source));
  await pool.request()
    .input("ID", id)
    .input("UrunBilgileri", product)
    .input("Barkod", source === "Unique" ? nullableText(input.barkod) : await productBarcode(pool, input.barkod, id))
    .input("Kaynak", input.kaynak === undefined ? null : kysStockSource(input.kaynak))
    .input("MalzemeTuru", text(input.malzemeTuru) || "Sarf")
    .input("Kod", text(input.kod))
    .input("Ad", text(input.ad))
    .input("Name", nullableText(input.name))
    .input("CasNo", nullableText(input.casNo))
    .input("Ozellik", nullableText(input.ozellik))
    .input("Ambalaj", nullableText(input.ambalaj))
    .input("SaklamaKosullari", nullableText(input.saklamaKosullari))
    .input("KritikLimit", numberValue(input.kritikLimit))
    .input("StokDurumu", text(input.stokDurumu) || "Aktif")
    .input("Birim", text(input.birim) || "Adet")
    .query(`
      UPDATE KysStokKart
      SET UrunBilgileri = @UrunBilgileri, Kaynak = COALESCE(@Kaynak, Kaynak), Barkod = @Barkod, MalzemeTuru = @MalzemeTuru, Kod = @Kod, Ad = @Ad,
          Name = @Name, CasNo = @CasNo, Ozellik = @Ozellik, Ambalaj = @Ambalaj,
          SaklamaKosullari = @SaklamaKosullari, KritikLimit = @KritikLimit,
          StokDurumu = @StokDurumu, Birim = @Birim, UpdatedAt = GETDATE()
      WHERE ID = @ID
    `);
}

export async function getKysStockDetail(id: number) {
  await ensureKysSchema();
  const pool = await cosmoPool;
  const stockRes = await pool.request().input("ID", id).query(`
    SELECT ID, LegacyID, Barkod, Kaynak, UrunBilgileri, MalzemeTuru, Kod, Ad, Name, CasNo, Ozellik, Ambalaj,
           SaklamaKosullari, KritikLimit, StokMiktari, StokDurumu, Birim, GorselDosyaAdi, CreatedAt, UpdatedAt
    FROM KysStokKart
    WHERE ID = @ID
  `);
  const stock = stockRes.recordset[0];
  if (!stock) return null;

  const movementsRes = await pool.request().input("ID", id).query(`
    SELECT h.ID, h.StokID, h.HareketTipi, h.Miktar, h.Birim, h.Marka, h.Lot, h.SKT,
           h.StokGirisTarihi, h.KaynakBirimID, kb.Ad AS KaynakBirimAd,
           h.HedefBirimID, hb.Ad AS HedefBirimAd, h.Aciklama, h.KullaniciID, h.KullaniciAd, h.CreatedAt,
           t.ID AS TalepID, t.TalepNo, t.TalepTuru, t.Seri AS TalepSeri
    FROM KysStokHareket h
    LEFT JOIN KysLaboratuvarBirim kb ON kb.ID = h.KaynakBirimID
    LEFT JOIN KysLaboratuvarBirim hb ON hb.ID = h.HedefBirimID
    LEFT JOIN KysTalepKabul k ON k.HareketID = h.ID
    LEFT JOIN KysTalep t ON t.ID = k.TalepID AND t.Durum <> 'Silindi'
    WHERE h.StokID = @ID
    ORDER BY h.ID DESC
  `);
  const balanceRes = await pool.request().input("ID", id).query(`
    SELECT bm.ID, bm.StokID, bm.BirimID, b.Ad AS BirimAd, bm.Miktar
    FROM KysStokBirimMiktar bm
    INNER JOIN KysLaboratuvarBirim b ON b.ID = bm.BirimID
    WHERE bm.StokID = @ID
    ORDER BY b.Ad
  `);
  const certRes = await pool.request().input("ID", id).query(`
    SELECT c.ID, c.StokID, c.HareketID, c.DosyaAdi, c.MimeType,
           COALESCE(NULLIF(c.YukleyenAd, ''),
             NULLIF(LTRIM(RTRIM(CONCAT(COALESCE(u.Ad, ''), ' ', COALESCE(u.Soyad, '')))), ''),
             c.YukleyenID) AS YukleyenAd,
           c.CreatedAt,
           'stok' AS Kaynak, NULL AS TalepID, h.Marka, h.Lot, h.SKT
    FROM KysStokSertifika c
    LEFT JOIN KysStokHareket h ON h.ID = c.HareketID AND h.StokID = c.StokID
    LEFT JOIN RootKullanici u ON u.ID = TRY_CAST(c.YukleyenID AS INT)
    WHERE c.StokID = @ID
    ORDER BY c.CreatedAt DESC, c.ID DESC
  `);
  const acceptanceCertRes = await pool.request().input("ID", id).query(`
    SELECT b.ID, k.StokID, k.HareketID, b.DosyaAdi, b.MimeType,
           COALESCE(
             NULLIF(LTRIM(RTRIM(CONCAT(COALESCE(u.Ad, ''), ' ', COALESCE(u.Soyad, '')))), ''),
             b.YukleyenID) AS YukleyenAd,
           b.CreatedAt,
           'talep' AS Kaynak, b.TalepID, h.Marka, h.Lot, h.SKT
    FROM KysTalepBelge b
    INNER JOIN KysTalepKabul k ON k.ID = b.KabulID AND k.TalepID = b.TalepID
    LEFT JOIN KysStokHareket h ON h.ID = k.HareketID AND h.StokID = k.StokID
    LEFT JOIN RootKullanici u ON u.ID = TRY_CAST(b.YukleyenID AS INT)
    WHERE k.StokID = @ID
    ORDER BY b.CreatedAt DESC, b.ID DESC
  `);

  const gallery = await pool.request().input("ID", id).query("SELECT ID, DosyaAdi, AltMetin, Sira FROM KysStokGorsel WHERE StokID=@ID AND Silindi=0 ORDER BY Sira,ID");
  return {
    images: gallery.recordset.map((r: AnyRow) => ({ id: rowNumber(r, "ID"), dosyaAdi: rowString(r, "DosyaAdi"), altMetin: rowString(r, "AltMetin"), sira: rowNumber(r, "Sira") })),
    stock: { ...mapStock(stock), hasOriginalImage: Boolean(rowString(stock, "GorselDosyaAdi")), hasImage: Boolean(rowString(stock, "GorselDosyaAdi")) || gallery.recordset.length > 0 },
    movements: movementsRes.recordset.map(mapMovement),
    balances: balanceRes.recordset.map((r: AnyRow) => ({
      id: rowNumber(r, "ID"),
      stokId: rowNumber(r, "StokID"),
      birimId: rowNumber(r, "BirimID"),
      birimAd: rowString(r, "BirimAd"),
      miktar: Number(r.Miktar || 0),
    })),
    certificates: [...certRes.recordset, ...acceptanceCertRes.recordset]
      .map(mapCertificate)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))),
  };
}

export async function updateKysStockImage(id: number, input: { fileName: string; mimeType: string; data: Buffer }) {
  await ensureKysSchema();
  const pool = await cosmoPool;
  await pool.request()
    .input("ID", id)
    .input("GorselDosyaAdi", input.fileName)
    .input("GorselMimeType", input.mimeType)
    .input("GorselData", input.data)
    .query(`
      UPDATE KysStokKart
      SET GorselDosyaAdi = @GorselDosyaAdi,
          GorselMimeType = @GorselMimeType,
          GorselData = @GorselData,
          UpdatedAt = GETDATE()
      WHERE ID = @ID
    `);
}

export async function getKysStockImage(id: number) {
  await ensureKysSchema();
  const pool = await cosmoPool;
  const gallery = await pool.request().input("ID", id).query("SELECT TOP 1 DosyaAdi AS GorselDosyaAdi, MimeType AS GorselMimeType, DosyaData AS GorselData FROM KysStokGorsel WHERE StokID=@ID AND Silindi=0 ORDER BY Sira,ID");
  if (gallery.recordset[0]) return gallery.recordset[0];
  const res = await pool.request().input("ID", id).query(`
    SELECT GorselDosyaAdi, GorselMimeType, GorselData
    FROM KysStokKart
    WHERE ID = @ID AND GorselData IS NOT NULL
  `);
  return res.recordset[0] || null;
}

function mapMovement(r: AnyRow) {
  return {
    id: rowNumber(r, "ID"),
    stokId: rowNumber(r, "StokID"),
    hareketTipi: rowString(r, "HareketTipi"),
    miktar: Number(r.Miktar || 0),
    birim: rowString(r, "Birim"),
    marka: rowString(r, "Marka"),
    lot: rowString(r, "Lot"),
    skt: asDate(r.SKT),
    stokGirisTarihi: asDate(r.StokGirisTarihi),
    kaynakBirimId: r.KaynakBirimID == null ? null : Number(r.KaynakBirimID),
    kaynakBirimAd: rowString(r, "KaynakBirimAd"),
    hedefBirimId: r.HedefBirimID == null ? null : Number(r.HedefBirimID),
    hedefBirimAd: rowString(r, "HedefBirimAd"),
    aciklama: rowString(r, "Aciklama"),
    talepId: r.TalepID == null ? null : Number(r.TalepID),
    talepNo: rowString(r, "TalepNo"),
    siparis: ["Spektrotek", "Root"].includes(r.TalepSeri) && r.TalepTuru === "Sipariş",
    kullaniciAd: rowString(r, "KullaniciAd"),
    createdAt: asDateTime(r.CreatedAt),
  };
}

function mapCertificate(r: AnyRow) {
  return {
    id: rowNumber(r, "ID"),
    stokId: rowNumber(r, "StokID"),
    hareketId: r.HareketID == null ? null : Number(r.HareketID),
    dosyaAdi: rowString(r, "DosyaAdi"),
    mimeType: rowString(r, "MimeType"),
    yukleyenAd: rowString(r, "YukleyenAd"),
    createdAt: asDateTime(r.CreatedAt),
    kaynak: rowString(r, "Kaynak") || "stok",
    talepId: r.TalepID == null ? null : Number(r.TalepID),
    marka: rowString(r, "Marka"),
    lot: rowString(r, "Lot"),
    skt: asDate(r.SKT),
  };
}

async function adjustUnitBalance(pool: any, stokId: number, birimId: number | null | undefined, delta: number) {
  if (!birimId || !Number.isFinite(delta) || delta === 0) return;
  const existing = await pool.request()
    .input("StokID", stokId)
    .input("BirimID", Number(birimId))
    .query(`SELECT ID, Miktar FROM KysStokBirimMiktar WHERE StokID = @StokID AND BirimID = @BirimID`);
  if (existing.recordset[0]) {
    await pool.request()
      .input("StokID", stokId)
      .input("BirimID", Number(birimId))
      .input("Delta", delta)
      .query(`UPDATE KysStokBirimMiktar SET Miktar = Miktar + @Delta WHERE StokID = @StokID AND BirimID = @BirimID`);
  } else {
    await pool.request()
      .input("StokID", stokId)
      .input("BirimID", Number(birimId))
      .input("Miktar", delta)
      .query(`INSERT INTO KysStokBirimMiktar (StokID, BirimID, Miktar) VALUES (@StokID, @BirimID, @Miktar)`);
  }
}

export async function createKysStockMovement(stokId: number, input: KysMovementInput, executor?: any) {
  await ensureKysSchema();
  const pool = executor || await cosmoPool;
  const hareketTipi = text(input.hareketTipi) || "Giriş";
  const miktar = numberValue(input.miktar);
  if (miktar <= 0) throw new Error("Miktar 0'dan büyük olmalıdır.");

  const res = await pool.request()
    .input("StokID", stokId)
    .input("HareketTipi", hareketTipi)
    .input("Miktar", miktar)
    .input("Birim", text(input.birim) || "Adet")
    .input("Marka", nullableText(input.marka))
    .input("Lot", nullableText(input.lot))
    .input("SKT", dateValue(input.skt))
    .input("StokGirisTarihi", dateValue(input.stokGirisTarihi))
    .input("KaynakBirimID", input.kaynakBirimId ? Number(input.kaynakBirimId) : null)
    .input("HedefBirimID", input.hedefBirimId ? Number(input.hedefBirimId) : null)
    .input("Aciklama", nullableText(input.aciklama))
    .input("KullaniciID", nullableText(input.kullaniciId))
    .input("KullaniciAd", nullableText(input.kullaniciAd))
    .query(`
      INSERT INTO KysStokHareket
        (StokID, HareketTipi, Miktar, Birim, Marka, Lot, SKT, StokGirisTarihi, KaynakBirimID, HedefBirimID, Aciklama, KullaniciID, KullaniciAd)
      OUTPUT INSERTED.ID
      VALUES
        (@StokID, @HareketTipi, @Miktar, @Birim, @Marka, @Lot, @SKT, @StokGirisTarihi, @KaynakBirimID, @HedefBirimID, @Aciklama, @KullaniciID, @KullaniciAd)
    `);

  const movementId = Number(res.recordset[0]?.ID || res.recordset[0]?.id || 0);
  const totalDelta = hareketTipi === "Çıkış" ? -miktar : hareketTipi === "Aktarma" ? 0 : miktar;
  if (totalDelta) {
    await pool.request().input("ID", stokId).input("Delta", totalDelta).query(`
      UPDATE KysStokKart SET StokMiktari = StokMiktari + @Delta, UpdatedAt = GETDATE() WHERE ID = @ID
    `);
  }
  if (hareketTipi === "Aktarma") {
    await adjustUnitBalance(pool, stokId, input.kaynakBirimId, -miktar);
    await adjustUnitBalance(pool, stokId, input.hedefBirimId, miktar);
  } else if (hareketTipi === "Çıkış") {
    await adjustUnitBalance(pool, stokId, input.kaynakBirimId || input.hedefBirimId, -miktar);
  } else {
    await adjustUnitBalance(pool, stokId, input.hedefBirimId || input.kaynakBirimId, miktar);
  }
  return movementId;
}

export async function addKysCertificate(input: {
  stokId: number;
  hareketId?: number | null;
  dosyaAdi: string;
  mimeType?: string | null;
  fileData: Buffer;
  yukleyenId?: string | null;
  yukleyenAd?: string | null;
}) {
  await ensureKysSchema();
  const pool = await cosmoPool;
  if (input.hareketId) {
    const movement = await pool.request()
      .input("HareketID", input.hareketId)
      .input("StokID", input.stokId)
      .query("SELECT ID FROM KysStokHareket WHERE ID = @HareketID AND StokID = @StokID");
    if (!movement.recordset[0]) throw new Error("Seçilen marka / lot kaydı bu stok kartına ait değil.");
  }
  const res = await pool.request()
    .input("StokID", input.stokId)
    .input("HareketID", input.hareketId || null)
    .input("DosyaAdi", input.dosyaAdi)
    .input("MimeType", input.mimeType || "application/octet-stream")
    .input("FileData", input.fileData)
    .input("YukleyenID", input.yukleyenId || null)
    .input("YukleyenAd", input.yukleyenAd || null)
    .query(`
      INSERT INTO KysStokSertifika (StokID, HareketID, DosyaAdi, MimeType, FileData, YukleyenID, YukleyenAd)
      OUTPUT INSERTED.ID
      VALUES (@StokID, @HareketID, @DosyaAdi, @MimeType, @FileData, @YukleyenID, @YukleyenAd)
    `);
  return Number(res.recordset[0]?.ID || res.recordset[0]?.id || 0);
}

export async function getKysCertificateFile(id: number) {
  await ensureKysSchema();
  const pool = await cosmoPool;
  const res = await pool.request().input("ID", id).query(`
    SELECT ID, DosyaAdi, MimeType, FileData FROM KysStokSertifika WHERE ID = @ID
  `);
  return res.recordset[0] || null;
}

export async function listKysExpiry(params: { search?: string; days?: number; page?: number; limit?: number }) {
  await ensureKysSchema();
  const pool = await cosmoPool;
  const page = Math.max(1, Number(params.page || 1));
  const limit = Math.min(100, Math.max(5, Number(params.limit || 20)));
  const offset = (page - 1) * limit;
  const search = text(params.search);
  const days = Math.max(0, Number(params.days ?? 0));
  let where = "WHERE h.SKT IS NOT NULL";
  if (search) where += " AND (s.Kod LIKE @search OR s.Ad LIKE @search OR h.Lot LIKE @search OR h.Marka LIKE @search)";
  if (days) where += " AND h.SKT <= DATEADD(day, @days, CAST(GETDATE() AS date))";

  const bind = (req: any) => req.input("search", `%${search}%`).input("days", days);
  const countRes = await bind(pool.request()).query(`
    SELECT COUNT(*) AS total
    FROM KysStokHareket h
    INNER JOIN KysStokKart s ON s.ID = h.StokID
    ${where}
  `);
  const rowsRes = await bind(pool.request())
    .input("offset", offset)
    .input("limit", limit)
    .query(`
      SELECT h.ID, h.StokID, s.Kod, s.Ad, h.Marka, h.Lot, h.Miktar, h.Birim, h.SKT, h.CreatedAt
      FROM KysStokHareket h
      INNER JOIN KysStokKart s ON s.ID = h.StokID
      ${where}
      ORDER BY h.SKT ASC, h.ID DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);
  const total = Number(countRes.recordset[0]?.total || 0);
  return {
    data: rowsRes.recordset.map((r: AnyRow) => ({
      id: rowNumber(r, "ID"),
      stokId: rowNumber(r, "StokID"),
      kod: rowString(r, "Kod"),
      ad: rowString(r, "Ad"),
      marka: rowString(r, "Marka"),
      lot: rowString(r, "Lot"),
      miktar: Number(r.Miktar || 0),
      birim: rowString(r, "Birim"),
      skt: asDate(r.SKT),
      createdAt: asDateTime(r.CreatedAt),
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function listKysRequests(params: { search?: string; durum?: string; tur?: string; seri?: string; odeme?: string; page?: number; limit?: number; allowedFirmalar?: string[] }) {
  await ensureKysSchema();
  await ensureKysRequestNumbers(await cosmoPool);
  const pool = await cosmoPool;
  await ensureFaturaTrackingSchema(pool);
  const page = Math.max(1, Number(params.page || 1));
  const limit = Math.min(100, Math.max(5, Number(params.limit || 20)));
  const offset = (page - 1) * limit;
  const search = text(params.search);
  const durum = text(params.durum);
  const tur = text(params.tur);
  let where = durum === "Silindi" ? "WHERE 1=1" : "WHERE t.Durum <> 'Silindi'";
  const sonOdeme = `COALESCE(
    (SELECT TOP 1 o.Odeme_Durumu FROM Odeme o WHERE o.Fatura_ID = f.ID AND ISNULL(o.Odeme_Durumu, N'') <> N'Proforma' ORDER BY o.ID DESC),
    (SELECT TOP 1 o.Odeme_Durumu FROM Odeme o WHERE o.Evrak_No = f.ProformaNo AND o.Fatura_ID IS NULL AND ISNULL(o.Odeme_Durumu, N'') <> N'Proforma' ORDER BY o.ID DESC),
    t.OdemeDurumu,
    N'Ödeme Bekliyor'
  )`;
  if (search) where += " AND (t.TalepNo LIKE @search OR t.OlusturanAd LIKE @search OR t.Notlar LIKE @search OR t.TalepTuru LIKE @search OR t.FirmaAdi LIKE @search OR COALESCE(f.Fatura_No,t.SiparisFaturaNo) LIKE @search)";
  if (durum) where += " AND t.Durum = @durum";
  if (params.odeme) where += ` AND ${sonOdeme}=@odeme`;
  if (tur) where += " AND t.TalepTuru = @tur";
  if (["Unique", "Spektrotek", "Root"].includes(params.seri || "")) where += ` AND t.Seri = '${params.seri}'`;
  const visibleSeries = ["Unique", "Spektrotek", "Root"].filter((firma) => params.allowedFirmalar?.includes(firma));
  if (params.allowedFirmalar && visibleSeries.length === 0) where += " AND 1 = 0";
  else if (params.allowedFirmalar) where += ` AND t.Seri IN (${visibleSeries.map(series => `'${series}'`).join(",")})`;
  const bind = (req: any) => req.input("search", `%${search}%`).input("durum", durum).input("tur", tur).input("odeme", text(params.odeme));

  const countRes = await bind(pool.request()).query(`SELECT COUNT(*) AS total FROM KysTalep t LEFT JOIN Fatura f ON f.ID=t.SiparisFaturaID AND f.Durum='Aktif' ${where}`);
  const rowsRes = await bind(pool.request())
    .input("offset", offset)
    .input("limit", limit)
    .query(`
      SELECT t.ID, t.TalepNo, t.SiparisFaturaID,
             COALESCE(f.Fatura_No,t.SiparisFaturaNo) AS SiparisFaturaNo,
             COALESCE(f.Toplam,t.SiparisFaturaTutari) AS SiparisFaturaTutari,
             COALESCE(f.VadeTarihi,t.SiparisVade) AS SiparisVade,
             ${sonOdeme} AS OdemeDurumu,
             t.Seri, t.FirmaAdi, t.TalepTuru, t.Durum, t.OlusturanAd, t.OlusturmaTarihi,
             t.OnaylayanAd, t.OnayTarihi, t.IslemeAlanAd, t.IslemeAlmaTarihi,
             (SELECT COUNT(*) FROM KysTalepKalem k WHERE k.TalepID = t.ID) AS KalemSayisi
      FROM KysTalep t
      LEFT JOIN Fatura f ON f.ID=t.SiparisFaturaID AND f.Durum='Aktif'
      ${where}
      ORDER BY t.ID DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);
  const total = Number(countRes.recordset[0]?.total || 0);
  return {
    data: rowsRes.recordset.map(mapRequest),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

function mapRequest(r: AnyRow) {
  return {
    id: rowNumber(r, "ID"),
    talepNo: rowString(r, "TalepNo"),
    talepTuru: rowString(r, "TalepTuru"),
    firmaAdi: rowString(r, "FirmaAdi"),
    faturaId: r.SiparisFaturaID == null ? null : Number(r.SiparisFaturaID),
    faturaNo: rowString(r,"SiparisFaturaNo"),
    faturaTutari: r.SiparisFaturaTutari == null ? null : Number(r.SiparisFaturaTutari),
    vade: asDate(r.SiparisVade),
    odemeDurumu: rowString(r,"OdemeDurumu") || "Ödeme Bekliyor",
    seri: rowString(r, "Seri") || (rowString(r, "TalepNo").startsWith("S") ? "Spektrotek" : "Unique"),
    durum: rowString(r, "Durum"),
    olusturanAd: rowString(r, "OlusturanAd"),
    olusturmaTarihi: asDateTime(r.OlusturmaTarihi),
    onaylayanAd: rowString(r, "OnaylayanAd"),
    onayTarihi: asDateTime(r.OnayTarihi),
    islemeAlanAd: rowString(r, "IslemeAlanAd"),
    islemeAlmaTarihi: asDateTime(r.IslemeAlmaTarihi),
    kalemSayisi: Number(r.KalemSayisi || 0),
  };
}

/** Resolve the same inventory card for an order; never create inventory quantities here. */
export async function ensureKysOrderProduct(pool: any, series: string, item: { stokId?: unknown; kod?: string; malzemeAdi?: string; birim?: string; ozellik?: string; marka?: string }, fallbackCode: string) {
  if (!["Spektrotek", "Root"].includes(series)) throw new Error("Ürün kaynağı geçersiz.");
  const code = text(item.kod) || fallbackCode;
  if (code.length > 80 || text(item.malzemeAdi).length > 220) throw new Error("Ürün kodu en fazla 80, adı en fazla 220 karakter olabilir.");
  const request = pool.request();
  let stock: AnyRow | undefined;
  if (item.stokId) {
    stock = (await request.input("ID", Number(item.stokId)).query(hasMysqlConfig()
      ? "SELECT ID,Kod,Birim,Kaynak FROM KysStokKart WHERE ID=@ID FOR UPDATE"
      : "SELECT ID,Kod,Birim,Kaynak FROM KysStokKart WITH (UPDLOCK,HOLDLOCK) WHERE ID=@ID")).recordset[0];
    if (!stock) throw new Error("Seçili stok kartı bulunamadı.");
  } else {
    stock = (await request.input("Kod", code).query(hasMysqlConfig()
      ? "SELECT ID,Kod,Birim,Kaynak FROM KysStokKart WHERE Kod=@Kod FOR UPDATE"
      : "SELECT ID,Kod,Birim,Kaynak FROM KysStokKart WITH (UPDLOCK,HOLDLOCK) WHERE Kod=@Kod")).recordset[0];
    if (stock && item.birim && stock.Birim !== item.birim) throw new Error(`${code}: birim mevcut ürün kartıyla eşleşmiyor (${stock.Birim}).`);
  }
  if (stock) {
    if (!["Root", "Spektrotek"].includes(stock.Kaynak)) await pool.request().input("ID", stock.ID).input("Source", series).query("UPDATE KysStokKart SET Kaynak=@Source,UpdatedAt=GETDATE() WHERE ID=@ID");
    return { id: Number(stock.ID), kod: stock.Kod, birim: stock.Birim || "Adet", created: false };
  }
  const id = await createKysStock({ kaynak: series, kod: code, ad: text(item.malzemeAdi),
    birim: text(item.birim) || "Adet", malzemeTuru: "Ürün", ozellik: item.ozellik,
    urun: { ...normalizeKysProduct({}, series), marka: text(item.marka) },
  }, pool);
  return { id, kod: code, birim: text(item.birim) || "Adet", created: true };
}

export async function createKysRequest(input: KysRequestInput) {
  await ensureKysSchema();
  await ensureKysRequestNumbers(await cosmoPool);
  if(!Array.isArray(input.kalemler)||!input.kalemler.length||input.kalemler.length>100)throw new Error("1–100 talep kalemi ekleyin.");
  if(input.kalemler.some(k=>!text(k.malzemeAdi)||numberValue(k.miktar,NaN)<=0||!Number.isFinite(numberValue(k.miktar,NaN))))throw new Error("Her kalemin adı ve pozitif miktarı zorunludur.");
  const basePool = await cosmoPool;
  const pool=await basePool.transaction();await pool.begin();
  try {
  if (input.seri && !["Unique", "Spektrotek", "Root"].includes(input.seri)) throw new Error("Talep serisi geçersiz.");
  const spektrotek = ["Spektrotek", "Root"].includes(input.seri || "");
  if (spektrotek && (!text(input.firmaAdi) || text(input.firmaAdi).length > 220)) throw new Error("Firma adı zorunludur (en fazla 220 karakter).");
  const talepTuru = spektrotek ? (text(input.talepTuru) === "Sipariş" ? "Sipariş" : "Satın Alma") : text(input.talepTuru) || "Stok Malzeme";
  if (spektrotek && talepTuru !== "Sipariş" && input.kalemler.some(k => k.stokId)) throw new Error("Satın alma kalemleri manuel girilmelidir.");
  const talepNo = spektrotek ? await nextSpektrotekRequestNumber(pool, talepTuru, input.seri) : await nextKysRequestNumber(pool);
  const res = await pool.request()
    .input("TalepNo", talepNo)
    .input("Seri", spektrotek ? input.seri : "Unique")
    .input("FirmaAdi", spektrotek ? text(input.firmaAdi) : null)
    .input("TalepTuru", talepTuru)
    .input("OlusturanID", nullableText(input.olusturanId))
    .input("OlusturanAd", nullableText(input.olusturanAd))
    .input("Notlar", nullableText(input.notlar))
    .input("TeknikSartname", nullableText(input.teknikSartname))
    .query(`
      INSERT INTO KysTalep (TalepNo, Seri, FirmaAdi, TalepTuru, Durum, OlusturanID, OlusturanAd, Notlar, TeknikSartname)
      OUTPUT INSERTED.ID
      VALUES (@TalepNo, @Seri, @FirmaAdi, @TalepTuru, 'Onay Bekliyor', @OlusturanID, @OlusturanAd, @Notlar, @TeknikSartname)
    `);
  const id = Number(res.recordset[0]?.ID || res.recordset[0]?.id || 0);
  for (const [index, originalItem] of (input.kalemler || []).entries()) {
    const item = { ...originalItem };
    if (spektrotek && talepTuru === "Sipariş") {
      const product = await ensureKysOrderProduct(pool, input.seri!, item, `${input.seri === "Root" ? "ROOT" : "SPK"}-ORDER-${id}-${index+1}`);
      item.stokId = product.id; item.kod = product.kod; item.birim = product.birim;
    }
    const name = text(item.malzemeAdi);
    if (!name) continue;
    let canonicalUnit=text(item.birim)||"Adet";
    if(item.stokId){
      const stock=(await pool.request().input("ID",Number(item.stokId)).query("SELECT ID,Birim FROM KysStokKart WHERE ID=@ID")).recordset[0];
      if(!stock)throw new Error("Seçili stok kartı bulunamadı.");canonicalUnit=stock.Birim||"Adet";
    }
    await pool.request()
      .input("TalepID", id)
      .input("StokID", item.stokId ? Number(item.stokId) : null)
      .input("Kod", nullableText(item.kod))
      .input("MalzemeAdi", name)
      .input("Miktar", numberValue(item.miktar))
      .input("Birim", canonicalUnit)
      .input("Ozellik", nullableText(item.ozellik))
      .input("Marka", nullableText(item.marka))
      .input("KullaniciNotu", nullableText(item.kullaniciNotu))
      .query(`
        INSERT INTO KysTalepKalem (TalepID, StokID, Kod, MalzemeAdi, Miktar, Birim, Ozellik, Marka, KullaniciNotu)
        VALUES (@TalepID, @StokID, @Kod, @MalzemeAdi, @Miktar, @Birim, @Ozellik, @Marka, @KullaniciNotu)
      `);
  }
  await pool.commit();return id;
  }catch(e){await pool.rollback();throw e;}
}

export async function editSpektrotekRequestNumber(id: number, value: unknown) {
  await ensureKysSchema();
  const number = text(value);
  if (!number || number.length > 40 || /[\r\n\t]/.test(number)) throw new Error("Talep numarası 1–40 karakter olmalıdır.");
  const pool = await (await cosmoPool).transaction();
  await pool.begin();
  try {
    const row = (await pool.request().input("ID", id).query(hasMysqlConfig()
      ? "SELECT * FROM KysTalep WHERE ID=@ID FOR UPDATE"
      : "SELECT * FROM KysTalep WITH (UPDLOCK,HOLDLOCK) WHERE ID=@ID")).recordset[0];
    if (!row || row.Durum === "Silindi") throw new Error("Talep bulunamadı.");
    if (!["Spektrotek", "Root"].includes(row.Seri)) throw new Error("Yalnızca Spektrotek ve Root talep numarası değiştirilebilir.");
    if (row.Seri === "Root" && !(row.TalepTuru === "Sipariş" ? /^R\d+$/ : /^RA\d+$/).test(number)) throw new Error("Root sipariş numarası R, satın alma numarası RA ile başlamalıdır.");
    const duplicate = (await pool.request().input("ID", id).input("No", number)
      .query("SELECT ID FROM KysTalep WHERE TalepNo=@No AND ID<>@ID")).recordset;
    if (duplicate.length) throw new Error("Bu talep numarası başka bir kayıtta kullanılıyor.");
    await pool.request().input("ID", id).input("No", number)
      .query("UPDATE KysTalep SET TalepNo=@No,UpdatedAt=GETDATE() WHERE ID=@ID");
    await pool.commit();
  } catch (e) { await pool.rollback(); throw e; }
}

export async function editKysRequest(id: number, input: KysRequestInput) {
  await ensureKysSchema();
  if (!Array.isArray(input.kalemler) || !input.kalemler.length || input.kalemler.length > 100)
    throw new Error("1–100 talep kalemi ekleyin.");
  if (input.kalemler.some(k => !text(k.malzemeAdi) || !Number.isFinite(numberValue(k.miktar, NaN)) || numberValue(k.miktar) <= 0))
    throw new Error("Her kalemin adı ve pozitif miktarı zorunludur.");
  const pool = await (await cosmoPool).transaction();
  await pool.begin();
  try {
    const current = (await pool.request().input("ID", id).query(hasMysqlConfig()
      ? "SELECT * FROM KysTalep WHERE ID=@ID FOR UPDATE"
      : "SELECT * FROM KysTalep WITH (UPDLOCK,HOLDLOCK) WHERE ID=@ID")).recordset[0];
    if (!current) throw new Error("Talep bulunamadı.");
    if (current.Durum !== "Onay Bekliyor" || current.OnayTarihi)
      throw new Error("Yalnızca onaylanmamış talepler düzenlenebilir. Sayfayı yenileyin.");
    const spektrotek = ["Spektrotek", "Root"].includes(current.Seri) || String(current.TalepNo).startsWith("S");
    if (spektrotek && (!text(input.firmaAdi) || text(input.firmaAdi).length > 220)) throw new Error("Firma adı zorunludur (en fazla 220 karakter).");
    const talepTuru = spektrotek ? (text(input.talepTuru) === "Sipariş" ? "Sipariş" : "Satın Alma") : text(input.talepTuru) || "Stok Malzeme";
    if (spektrotek && talepTuru !== "Sipariş" && input.kalemler.some(k => k.stokId)) throw new Error("Satın alma kalemleri manuel girilmelidir.");
    const accepted = await pool.request().input("ID", id).query("SELECT ID FROM KysTalepKabul WHERE TalepID=@ID");
    if (accepted.recordset.length) throw new Error("Kabul kaydı bulunan talep düzenlenemez.");
    let requestNumber = current.TalepNo;
    if (spektrotek && current.TalepTuru && current.TalepTuru !== talepTuru) {
      if (current.SiparisFaturaID) throw new Error("Talep türünü değiştirmeden önce fatura bağlantısını kaldırın.");
      requestNumber = await nextSpektrotekRequestNumber(pool, talepTuru, current.Seri || "Spektrotek");
    }
    await pool.request().input("ID", id).input("Tur", talepTuru)
      .input("Number", requestNumber)
      .input("Firma", spektrotek ? text(input.firmaAdi) : null)
      .input("Not", nullableText(input.notlar)).input("Spec", nullableText(input.teknikSartname))
      .query("UPDATE KysTalep SET TalepNo=@Number,FirmaAdi=@Firma,TalepTuru=@Tur,Notlar=@Not,TeknikSartname=@Spec,UpdatedAt=GETDATE() WHERE ID=@ID");
    await pool.request().input("ID", id).query("DELETE FROM KysTalepKalem WHERE TalepID=@ID");
    for (const [index, originalItem] of input.kalemler.entries()) {
      const item = { ...originalItem };
      if (spektrotek && talepTuru === "Sipariş") {
        const product = await ensureKysOrderProduct(pool, current.Seri || "Spektrotek", item, `${current.Seri === "Root" ? "ROOT" : "SPK"}-ORDER-${id}-${index+1}`);
        item.stokId = product.id; item.kod = product.kod; item.birim = product.birim;
      }
      let unit = text(item.birim) || "Adet";
      if (item.stokId) {
        const stock = (await pool.request().input("ID", Number(item.stokId)).query("SELECT ID,Birim FROM KysStokKart WHERE ID=@ID")).recordset[0];
        if (!stock) throw new Error("Seçili stok kartı bulunamadı.");
        unit = stock.Birim || "Adet";
      }
      await pool.request().input("ID", id).input("Stock", item.stokId ? Number(item.stokId) : null)
        .input("Code", nullableText(item.kod)).input("Name", text(item.malzemeAdi))
        .input("Qty", numberValue(item.miktar)).input("Unit", unit).input("Feature", nullableText(item.ozellik))
        .input("Brand", nullableText(item.marka)).input("Note", nullableText(item.kullaniciNotu))
        .query(`INSERT INTO KysTalepKalem (TalepID,StokID,Kod,MalzemeAdi,Miktar,Birim,Ozellik,Marka,KullaniciNotu)
          VALUES (@ID,@Stock,@Code,@Name,@Qty,@Unit,@Feature,@Brand,@Note)`);
    }
    await pool.commit();
  } catch (e) { await pool.rollback(); throw e; }
}

export async function getKysRequestDetail(id: number, includePurchaseDetails = false, executor?: any) {
  await ensureKysSchema();
  await ensureKysRequestNumbers(await cosmoPool);
  const pool = executor || await cosmoPool;
  const reqRes = await pool.request().input("ID", id).query(`SELECT * FROM KysTalep WHERE ID = @ID`);
  const talep = reqRes.recordset[0];
  if (!talep || talep.Durum === 'Silindi') return null;
  const itemsRes = await pool.request().input("ID", id).query(`
    SELECT k.*, s.Kod AS StokKod, s.Ad AS StokAd, s.Birim AS StokBirim
    FROM KysTalepKalem k
    LEFT JOIN KysStokKart s ON s.ID = k.StokID
    WHERE k.TalepID = @ID
    ORDER BY k.ID
  `);
  const acceptRes = await pool.request().input("ID", id).query(`
    SELECT k.*, h.HedefBirimID, h.Marka, h.Lot, h.SKT FROM KysTalepKabul k
    LEFT JOIN KysStokHareket h ON h.ID=k.HareketID WHERE k.TalepID = @ID ORDER BY k.ID DESC
  `);
  return {
    talep: {
      ...mapRequest({ ...talep, KalemSayisi: itemsRes.recordset.length }),
      notlar: rowString(talep, "Notlar"),
      teknikSartname: rowString(talep, "TeknikSartname"),
    },
    kalemler: itemsRes.recordset.map((r: AnyRow) => ({
      id: rowNumber(r, "ID"),
      talepId: rowNumber(r, "TalepID"),
      stokId: r.StokID == null ? null : Number(r.StokID),
      stokKod: rowString(r, "StokKod"),
      stokAd: rowString(r, "StokAd"),
      kod: rowString(r, "Kod"),
      malzemeAdi: rowString(r, "MalzemeAdi"),
      miktar: Number(r.Miktar || 0),
      birim: rowString(r, "StokBirim") || rowString(r, "Birim"),
      ozellik: rowString(r, "Ozellik"),
      marka: rowString(r, "Marka"),
      kullaniciNotu: rowString(r, "KullaniciNotu"),
      kabulMiktari: Number(r.KabulMiktari || 0),
      durum: rowString(r, "Durum"),
    })),
    kabuller: acceptRes.recordset.map((r: AnyRow) => ({
      id: rowNumber(r, "ID"),
      kalemId: rowNumber(r, "KalemID"),
      gelenMiktar: Number(r.GelenMiktar || 0),
      kabulTarihi: asDate(r.KabulTarihi),
      degerlendirenAd: rowString(r, "DegerlendirenAd"),
      genelDegerlendirme: rowString(r, "GenelDegerlendirme"),
      hedefBirimId: r.HedefBirimID == null ? null : Number(r.HedefBirimID),
      marka: rowString(r, "Marka"), lot: rowString(r, "Lot"), skt: asDate(r.SKT),
      istenilenMiktardaGeldi: Boolean(r.IstenilenMiktardaGeldi), markaOzellikUygun: Boolean(r.MarkaOzellikUygun),
      sktUygun: Boolean(r.SktUygun), sertifikaGerekli: Boolean(r.SertifikaGerekli),
      ...(includePurchaseDetails ? {
        tedarikci: rowString(r, "Tedarikci"),
        tedarikciId: r.TedarikciID == null ? null : Number(r.TedarikciID),
        satinAlmaTarihi: asDate(r.SatinAlmaTarihi),
        birimFiyat: r.BirimFiyat == null ? null : Number(r.BirimFiyat),
        paraBirimi: rowString(r, "ParaBirimi"),
        toplamTutar: r.ToplamTutar == null ? (r.BirimFiyat == null ? null : Number(r.BirimFiyat) * Number(r.GelenMiktar)) : Number(r.ToplamTutar),
        faturaNo: rowString(r, "FaturaNo"),
        satinAlanAd: rowString(r, "SatinAlanAd"),
      } : {}),
    })),
  };
}

export async function updateKysRequestStatus(id: number, input: { durum?: string; userId?: string | null; userName?: string | null }) {
  await ensureKysSchema();
  const durum = text(input.durum);
  if (!durum) throw new Error("Durum zorunludur.");
  const pool = await (await cosmoPool).transaction();
  await pool.begin();
  try {
  const current = (await pool.request().input("ID", id).query(hasMysqlConfig()
    ? "SELECT Durum FROM KysTalep WHERE ID=@ID FOR UPDATE"
    : "SELECT Durum FROM KysTalep WITH (UPDLOCK,HOLDLOCK) WHERE ID=@ID")).recordset[0];
  if (!current) throw new Error("Talep bulunamadı.");
  requireRequestTransition(current.Durum, durum);
  if (durum === "Onay Bekliyor") {
    const accepted = (await pool.request().input("ID", id).query("SELECT ID FROM KysTalepKabul WHERE TalepID=@ID")).recordset;
    if (accepted.length) throw new Error("Kabul kaydı bulunan talep geri gönderilemez.");
  }
  const dateFields =
    durum === "Onay Bekliyor"
      ? ", OnaylayanID = NULL, OnaylayanAd = NULL, OnayTarihi = NULL, IslemeAlanID = NULL, IslemeAlanAd = NULL, IslemeAlmaTarihi = NULL"
      : durum === "Onaylandı"
      ? ", OnaylayanID = @UserID, OnaylayanAd = @UserName, OnayTarihi = GETDATE()"
      : durum === "İşleme Alındı"
        ? ", IslemeAlanID = @UserID, IslemeAlanAd = @UserName, IslemeAlmaTarihi = GETDATE()"
        : "";
  await pool.request()
    .input("ID", id)
    .input("Durum", durum)
    .input("Current", current.Durum)
    .input("UserID", nullableText(input.userId))
    .input("UserName", nullableText(input.userName))
    .query(`UPDATE KysTalep SET Durum = @Durum${dateFields}, UpdatedAt = GETDATE() WHERE ID = @ID AND Durum=@Current`)
    .then(result => { if (!result.rowsAffected?.[0]) throw new Error("Talep durumu değişmiş. Sayfayı yenileyin."); });
  await pool.commit();
  } catch (e) { await pool.rollback(); throw e; }
}

export async function acceptKysRequestItem(talepId: number, input: any, executor?: any) {
  await ensureKysSchema();
  const { ensureKysPurchaseSchema, resolveKysSupplier } = await import("@/lib/kysPurchaseWorkflow");
  await ensureKysPurchaseSchema();
  const pool = executor || await (await cosmoPool).transaction();
  if (!executor) await pool.begin();
  try {
  await pool.request().input("ID", talepId).query(hasMysqlConfig() ? "SELECT ID FROM KysTalep WHERE ID=@ID FOR UPDATE" : "SELECT ID FROM KysTalep WITH (UPDLOCK,HOLDLOCK) WHERE ID=@ID");
  const kalemId = Number(input.kalemId);
  const gelenMiktar = numberValue(input.gelenMiktar);
  if (!kalemId || gelenMiktar <= 0) throw new Error("Kalem ve gelen miktar zorunludur.");

  const detail = await getKysRequestDetail(talepId, false, pool);
  const item = detail?.kalemler.find((k: any) => k.id === kalemId);
  if (!item) throw new Error("Talep kalemi bulunamadı.");
  requireRequestAcceptance(detail!.talep.durum, item.durum, item.kabulMiktari, item.miktar, gelenMiktar);
  if(input.hedefBirimId&&!(await pool.request().input("ID",Number(input.hedefBirimId)).query("SELECT ID FROM KysLaboratuvarBirim WHERE ID=@ID AND Durum='Aktif'")).recordset.length)throw new Error("Hedef birim bulunamadı.");
  for(const key of ["birimFiyat","toplamTutar"]){if(input[key]!==""&&input[key]!=null&&(!Number.isFinite(numberValue(input[key],NaN))||numberValue(input[key],NaN)<0))throw new Error("Fiyat ve tutar negatif olamaz; geçerli sayı girin.");}
  const supplier = input.satinAlanId ? await resolveKysSupplier(pool, input.tedarikciId) : null;

  const spektrotek = ["Spektrotek", "Root"].includes(detail!.talep.seri);
  const sale = spektrotek && detail!.talep.talepTuru === "Sipariş";
  let stokId = item.stokId ? Number(item.stokId) : 0;
  if (!stokId && spektrotek && item.kod) {
    const existing = (await pool.request().input("Kod", item.kod).query(hasMysqlConfig()
      ? "SELECT ID,Birim FROM KysStokKart WHERE Kod=@Kod FOR UPDATE"
      : "SELECT ID,Birim FROM KysStokKart WITH (UPDLOCK,HOLDLOCK) WHERE Kod=@Kod")).recordset[0];
    if (existing) { if (existing.Birim !== item.birim) throw new Error("Talep birimi stok kartı birimiyle eşleşmiyor."); stokId = Number(existing.ID); }
  }
  if (!stokId && !sale) {
    stokId = await createKysStock({
      kod: item.kod || `KYS-${kalemId}`,
      ad: item.malzemeAdi,
      kaynak: spektrotek ? detail!.talep.seri : "Unique",
      malzemeTuru: spektrotek ? "Ürün" : detail?.talep.talepTuru === "Cihaz" ? "Cihaz" : "Sarf",
      ozellik: item.ozellik,
      birim: item.birim,
    }, pool);
    await pool.request().input("KalemID", kalemId).input("StokID", stokId).query(`
      UPDATE KysTalepKalem SET StokID = @StokID WHERE ID = @KalemID
    `);
  }

  if (stokId) {
    await pool.request().input("KalemID", kalemId).input("StokID", stokId).query("UPDATE KysTalepKalem SET StokID=@StokID WHERE ID=@KalemID");

  }
  if (sale && stokId) {
    const stock = (await pool.request().input("ID", stokId).query(hasMysqlConfig() ? "SELECT StokMiktari FROM KysStokKart WHERE ID=@ID FOR UPDATE" : "SELECT StokMiktari FROM KysStokKart WITH (UPDLOCK,HOLDLOCK) WHERE ID=@ID")).recordset[0];
    if (!stock || Number(stock.StokMiktari) < gelenMiktar) throw new Error("Sipariş için depoda yeterli stok yok.");
    if (input.hedefBirimId) {
      const unit = (await pool.request().input("ID", stokId).input("Unit", Number(input.hedefBirimId)).query(hasMysqlConfig()
        ? "SELECT Miktar FROM KysStokBirimMiktar WHERE StokID=@ID AND BirimID=@Unit FOR UPDATE"
        : "SELECT Miktar FROM KysStokBirimMiktar WITH (UPDLOCK,HOLDLOCK) WHERE StokID=@ID AND BirimID=@Unit")).recordset[0];
      if (!unit || Number(unit.Miktar) < gelenMiktar) throw new Error("Seçilen depoda/birimde yeterli stok yok.");
    }
  }
  const hareketId = stokId ? await createKysStockMovement(stokId, {
    hareketTipi: sale ? "Çıkış" : "Kabul",
    miktar: gelenMiktar,
    birim: item.birim || "Adet",
    marka: input.marka || item.marka,
    lot: input.lot,
    skt: input.skt,
    stokGirisTarihi: input.kabulTarihi,
    hedefBirimId: input.hedefBirimId ? Number(input.hedefBirimId) : null,
    aciklama: `${sale ? "Sipariş" : "Talep kabul"}: ${detail?.talep.talepNo || talepId}`,
    kullaniciId: input.degerlendirenId,
    kullaniciAd: input.degerlendirenAd,
  }, pool) : null;

  const kabulId = await pool.request()
    .input("TalepID", talepId)
    .input("KalemID", kalemId)
    .input("GelenMiktar", gelenMiktar)
    .input("IstenilenMiktardaGeldi", input.istenilenMiktardaGeldi ? 1 : 0)
    .input("MarkaOzellikUygun", input.markaOzellikUygun ? 1 : 0)
    .input("SktUygun", input.sktUygun ? 1 : 0)
    .input("SertifikaGerekli", input.sertifikaGerekli ? 1 : 0)
    .input("GenelDegerlendirme", nullableText(input.genelDegerlendirme))
    .input("KabulTarihi", dateValue(input.kabulTarihi) || new Date().toISOString().slice(0, 10))
    .input("DegerlendirenID", nullableText(input.degerlendirenId))
    .input("DegerlendirenAd", nullableText(input.degerlendirenAd))
    .input("StokID", stokId || null)
    .input("HareketID", hareketId)
    .input("Tedarikci", supplier?.ad || null)
    .input("TedarikciID", supplier?.id || null)
    .input("SatinAlmaTarihi", dateValue(input.satinAlmaTarihi))
    .input("BirimFiyat", input.birimFiyat === "" || input.birimFiyat == null ? null : numberValue(input.birimFiyat))
    .input("ParaBirimi", nullableText(input.paraBirimi))
    .input("ToplamTutar", input.toplamTutar === "" || input.toplamTutar == null ? (input.birimFiyat === "" || input.birimFiyat == null ? null : numberValue(input.birimFiyat) * gelenMiktar) : numberValue(input.toplamTutar))
    .input("FaturaNo", nullableText(input.faturaNo))
    .input("SatinAlanID", nullableText(input.satinAlanId))
    .input("SatinAlanAd", nullableText(input.satinAlanAd))
    .query(`
      INSERT INTO KysTalepKabul
        (TalepID, KalemID, GelenMiktar, IstenilenMiktardaGeldi, MarkaOzellikUygun, SktUygun, SertifikaGerekli,
         GenelDegerlendirme, KabulTarihi, DegerlendirenID, DegerlendirenAd, StokID, HareketID,
         Tedarikci, TedarikciID, SatinAlmaTarihi, BirimFiyat, ParaBirimi, ToplamTutar, FaturaNo, SatinAlanID, SatinAlanAd)
      OUTPUT INSERTED.ID
      VALUES
        (@TalepID, @KalemID, @GelenMiktar, @IstenilenMiktardaGeldi, @MarkaOzellikUygun, @SktUygun, @SertifikaGerekli,
         @GenelDegerlendirme, @KabulTarihi, @DegerlendirenID, @DegerlendirenAd, @StokID, @HareketID,
         @Tedarikci, @TedarikciID, @SatinAlmaTarihi, @BirimFiyat, @ParaBirimi, @ToplamTutar, @FaturaNo, @SatinAlanID, @SatinAlanAd)
    `).then((r: { recordset: AnyRow[] }) => Number(r.recordset[0]?.ID || r.recordset[0]?.id));

  await pool.request()
    .input("KalemID", kalemId)
    .input("GelenMiktar", gelenMiktar)
    .query(`
      UPDATE KysTalepKalem
      SET Durum = CASE WHEN KabulMiktari + @GelenMiktar >= Miktar THEN 'Tamamlandı' ELSE 'Kısmi Kabul' END,
          KabulMiktari = KabulMiktari + @GelenMiktar
      WHERE ID = @KalemID
    `);

  await pool.request().input("TalepID", talepId).query(`
    UPDATE KysTalep
    SET Durum = CASE
      WHEN NOT EXISTS (SELECT 1 FROM KysTalepKalem WHERE TalepID = @TalepID AND Durum <> 'Tamamlandı') THEN 'Tamamlandı'
      ELSE 'Kısmi Kabul'
    END,
    UpdatedAt = GETDATE()
    WHERE ID = @TalepID
  `);

  if (input.belge) {
    const { saveKysAcceptanceFile } = await import("@/lib/kysPurchaseWorkflow");
    await saveKysAcceptanceFile(pool, talepId, kabulId, input.belge, input.degerlendirenId);
  }
  if (!executor) await pool.commit();
  return { stokId, hareketId, kabulId };
  } catch (e) { if (!executor) await pool.rollback(); throw e; }
}

export async function completeKysOrder(id: number, input: any) {
  await ensureKysSchema();
  const { ensureKysPurchaseSchema } = await import("@/lib/kysPurchaseWorkflow");
  await ensureKysPurchaseSchema();
  const shipmentDate = String(input.kabulTarihi || "");
  const parsedDate = new Date(`${shipmentDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(shipmentDate) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== shipmentDate) throw new Error("Geçerli bir gönderim tarihi girin.");
  if (!Number.isSafeInteger(Number(input.hedefBirimId)) || Number(input.hedefBirimId) <= 0) throw new Error("Stoktan düşülecek depo/birim seçin.");
  const tx = await (await cosmoPool).transaction();
  await tx.begin();
  try {
    await tx.request().input("ID", id).query(hasMysqlConfig() ? "SELECT ID FROM KysTalep WHERE ID=@ID FOR UPDATE" : "SELECT ID FROM KysTalep WITH (UPDLOCK,HOLDLOCK) WHERE ID=@ID");
    const detail = await getKysRequestDetail(id, false, tx);
    if (!detail || !["Spektrotek", "Root"].includes(detail.talep.seri) || detail.talep.talepTuru !== "Sipariş") throw new Error("Sipariş bulunamadı.");
    if (!["İşleme Alındı", "Kısmi Kabul"].includes(detail.talep.durum)) throw new Error("Yalnızca işleme alınmış sipariş tamamlanabilir.");
    const remaining = detail.kalemler.filter((item: any) => Number(item.miktar) > Number(item.kabulMiktari));
    if (!remaining.length) throw new Error("Gönderilecek sipariş kalemi yok.");
    for (const item of remaining) {
      await acceptKysRequestItem(id, { ...input, kalemId: item.id,
        gelenMiktar: Number(item.miktar) - Number(item.kabulMiktari),
        marka: item.marka, istenilenMiktardaGeldi: true, markaOzellikUygun: true,
        sktUygun: true, sertifikaGerekli: false,
      }, tx);
    }
    await tx.commit();
    return { tamamlananKalem: remaining.length };
  } catch (error) { await tx.rollback(); throw error; }
}

export async function listKysPurchases(params: { search?: string; islem?: string; page?: number; limit?: number; allowedFirmalar?: string[] }) {
  await ensureKysSchema();
  const pool = await cosmoPool;
  const page = Math.max(1, Number(params.page || 1));
  const limit = Math.min(100, Math.max(5, Number(params.limit || 25)));
  const visibleSeries = ["Unique", "Spektrotek", "Root"].filter(firma => params.allowedFirmalar?.includes(firma));
  let where = "WHERE 1=1";
  if (params.allowedFirmalar && visibleSeries.length === 0) where += " AND 1=0";
  else if (params.allowedFirmalar) where += ` AND h.Seri IN (${visibleSeries.map(series => `'${series}'`).join(",")})`;
  if (params.islem === "Alış" || params.islem === "Satış") where += " AND h.Islem=@islem";
  if (text(params.search)) where += " AND (h.StokKod LIKE @search OR h.MalzemeAdi LIKE @search OR h.Name LIKE @search OR h.Tedarikci LIKE @search OR h.TalepNo LIKE @search OR h.FaturaNo LIKE @search)";
  // One row per purchase acceptance or order item. Invoice totals are not item prices.
  const from = `FROM (
    SELECT k.ID, k.StokID, s.Kod AS StokKod, s.Name,
      COALESCE(s.Ad, tk.MalzemeAdi) AS MalzemeAdi, s.Kaynak AS StokKaynak,
      t.ID AS TalepID, t.TalepNo, t.Seri, t.Durum AS TalepDurumu,
      'Alış' AS Islem, k.GelenMiktar AS Miktar, k.GelenMiktar AS GonderilenMiktar,
      tk.Birim, COALESCE(k.Tedarikci,NULLIF(t.FirmaAdi,'')) AS Tedarikci, k.TedarikciID,
      COALESCE(k.SatinAlmaTarihi,k.KabulTarihi,CAST(k.CreatedAt AS DATE)) AS IslemTarihi,
      k.BirimFiyat, k.ParaBirimi, k.ToplamTutar, k.FaturaNo, k.SatinAlanAd
    FROM KysTalepKabul k
    INNER JOIN KysTalep t ON t.ID=k.TalepID
    INNER JOIN KysTalepKalem tk ON tk.ID=k.KalemID
    LEFT JOIN KysStokKart s ON s.ID=k.StokID
    WHERE t.Durum<>'Silindi' AND t.TalepTuru<>'Sipariş'
    UNION ALL
    SELECT tk.ID, tk.StokID, COALESCE(s.Kod,tk.Kod) AS StokKod, s.Name,
      COALESCE(s.Ad,tk.MalzemeAdi) AS MalzemeAdi, s.Kaynak AS StokKaynak,
      t.ID AS TalepID, t.TalepNo, t.Seri, t.Durum AS TalepDurumu,
      'Satış' AS Islem, tk.Miktar, tk.KabulMiktari AS GonderilenMiktar,
      tk.Birim, t.FirmaAdi AS Tedarikci, NULL AS TedarikciID,
      COALESCE((SELECT MAX(k.KabulTarihi) FROM KysTalepKabul k WHERE k.KalemID=tk.ID),CAST(t.OlusturmaTarihi AS DATE)) AS IslemTarihi,
      NULL AS BirimFiyat, NULL AS ParaBirimi, NULL AS ToplamTutar,
      COALESCE(f.Fatura_No,t.SiparisFaturaNo) AS FaturaNo, t.OlusturanAd AS SatinAlanAd
    FROM KysTalepKalem tk
    INNER JOIN KysTalep t ON t.ID=tk.TalepID
    LEFT JOIN KysStokKart s ON s.ID=tk.StokID
    LEFT JOIN Fatura f ON f.ID=t.SiparisFaturaID AND f.Durum='Aktif'
    WHERE t.Durum<>'Silindi' AND t.Seri IN ('Spektrotek','Root') AND t.TalepTuru='Sipariş'
  ) h`;
  const bind = (request: any) => request.input("search", `%${text(params.search)}%`).input("islem", text(params.islem));
  const count = await bind(pool.request()).query(`SELECT COUNT(*) AS total ${from} ${where}`);
  const rows = await bind(pool.request()).input("offset", (page-1)*limit).input("limit", limit).query(`
    SELECT h.* ${from} ${where}
    ORDER BY h.IslemTarihi DESC,h.TalepID DESC,h.Islem,h.ID DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`);
  const total = Number(count.recordset[0]?.total || 0);
  return {
    data: rows.recordset.map((r: AnyRow) => ({
      id: rowNumber(r,"ID"), islem: rowString(r,"Islem"), durum: rowString(r,"TalepDurumu"),
      stokId: r.StokID == null ? null : Number(r.StokID), stokKaynak: rowString(r,"StokKaynak"),
      stokKod: rowString(r,"StokKod"), malzemeAdi: rowString(r,"MalzemeAdi"),
      talepId: rowNumber(r,"TalepID"), talepNo: rowString(r,"TalepNo"),
      miktar: Number(r.Miktar || 0), gonderilenMiktar: Number(r.GonderilenMiktar || 0), birim: rowString(r,"Birim"),
      tedarikci: rowString(r,"Tedarikci"), tedarikciId: r.TedarikciID == null ? null : Number(r.TedarikciID),
      satinAlmaTarihi: asDate(r.IslemTarihi), birimFiyat: r.BirimFiyat == null ? null : Number(r.BirimFiyat),
      paraBirimi: rowString(r,"ParaBirimi"), toplamTutar: r.ToplamTutar == null ? null : Number(r.ToplamTutar),
      faturaNo: rowString(r,"FaturaNo"), satinAlanAd: rowString(r,"SatinAlanAd"),
    })), total, page, limit, totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function updateKysPurchase(id: number, input: any, user: { userId: string; userName: string; firmalar: string[] }) {
  await ensureKysSchema();
  const { ensureKysPurchaseSchema, resolveKysSupplier } = await import("@/lib/kysPurchaseWorkflow");
  await ensureKysPurchaseSchema();
  const pool = await cosmoPool;
  const current = (await pool.request().input("ID", id).query(`
    SELECT k.ID, k.GelenMiktar, t.Seri, t.TalepTuru
    FROM KysTalepKabul k INNER JOIN KysTalep t ON t.ID=k.TalepID
    WHERE k.ID=@ID AND t.Durum<>'Silindi'
  `)).recordset[0];
  if (!current || current.TalepTuru === "Sipariş") throw new Error("Satın alma kaydı bulunamadı.");
  if (!user.firmalar.includes(String(current.Seri || "Unique"))) throw new Error("Bu firmanın satın alma kaydını düzenleme yetkiniz yok.");
  const supplier = input.tedarikciId ? await resolveKysSupplier(pool, input.tedarikciId) : null;
  const manualSupplierName = supplier ? null : nullableText(input.tedarikci);
  if (manualSupplierName && manualSupplierName.length > 220) throw new Error("Tedarikçi firma adı en fazla 220 karakter olabilir.");
  const price = input.birimFiyat === "" || input.birimFiyat == null ? null : numberValue(input.birimFiyat, NaN);
  const total = input.toplamTutar === "" || input.toplamTutar == null
    ? price == null ? null : price * Number(current.GelenMiktar || 0)
    : numberValue(input.toplamTutar, NaN);
  if ((price != null && (!Number.isFinite(price) || price < 0)) || (total != null && (!Number.isFinite(total) || total < 0))) {
    throw new Error("Birim fiyat ve toplam tutar geçerli, negatif olmayan sayılar olmalıdır.");
  }
  await pool.request()
    .input("ID", id)
    .input("TedarikciID", supplier?.id || null)
    .input("Tedarikci", supplier?.ad || manualSupplierName)
    .input("SatinAlmaTarihi", dateValue(input.satinAlmaTarihi))
    .input("FaturaNo", nullableText(input.faturaNo))
    .input("BirimFiyat", price)
    .input("ParaBirimi", text(input.paraBirimi) || "TRY")
    .input("ToplamTutar", total)
    .input("SatinAlanID", user.userId)
    .input("SatinAlanAd", user.userName)
    .query(`UPDATE KysTalepKabul SET
      TedarikciID=@TedarikciID,Tedarikci=@Tedarikci,SatinAlmaTarihi=@SatinAlmaTarihi,
      FaturaNo=@FaturaNo,BirimFiyat=@BirimFiyat,ParaBirimi=@ParaBirimi,ToplamTutar=@ToplamTutar,
      SatinAlanID=@SatinAlanID,SatinAlanAd=@SatinAlanAd
      WHERE ID=@ID`);
  return { ok: true };
}

export async function updateKysOrderBilling(id: number, body: { faturaId?: number | string | null }) {
  await ensureKysSchema();
  const base = await cosmoPool;
  await ensureFaturaTrackingSchema(base);
  if (body.faturaId === undefined) throw new Error("Fatura seçin.");
  const invoiceId = body.faturaId ? Number(body.faturaId) : null;
  if (invoiceId !== null && (!Number.isSafeInteger(invoiceId) || invoiceId <= 0)) throw new Error("Geçersiz fatura.");
  const tx = await base.transaction();
  await tx.begin();
  try {
    const order = (await tx.request().input("ID", id).query(hasMysqlConfig()
      ? "SELECT ID,TalepNo FROM KysTalep WHERE ID=@ID AND Seri IN ('Spektrotek','Root') AND TalepTuru='Sipariş' AND Durum<>'Silindi' FOR UPDATE"
      : "SELECT ID,TalepNo FROM KysTalep WITH (UPDLOCK,HOLDLOCK) WHERE ID=@ID AND Seri IN ('Spektrotek','Root') AND TalepTuru='Sipariş' AND Durum<>'Silindi'")).recordset[0];
    if (!order) throw new Error("Sipariş bulunamadı.");
    let invoice: any = null;
    if (invoiceId) {
      invoice = (await tx.request().input("ID", invoiceId).query(hasMysqlConfig()
        ? "SELECT ID,Fatura_No,ProformaNo,Toplam,VadeTarihi FROM Fatura WHERE ID=@ID AND Durum='Aktif' FOR UPDATE"
        : "SELECT ID,Fatura_No,ProformaNo,Toplam,VadeTarihi FROM Fatura WITH (UPDLOCK,HOLDLOCK) WHERE ID=@ID AND Durum='Aktif'")).recordset[0];
      if (!invoice) throw new Error("Fatura bulunamadı.");
      const linked = (await tx.request().input("Invoice", invoiceId).input("ID", id).query("SELECT ID FROM KysTalep WHERE SiparisFaturaID=@Invoice AND ID<>@ID AND Durum<>'Silindi'")).recordset;
      if (linked.length) throw new Error("Fatura başka bir siparişle eşleştirilmiş.");
      const paymentRow = (await tx.request().input("Invoice", invoiceId).query("SELECT TOP 1 Odeme_Durumu FROM Odeme WHERE Fatura_ID=@Invoice AND ISNULL(Odeme_Durumu,N'')<>N'Proforma' ORDER BY ID DESC")).recordset[0];
      const legacyPayment = !paymentRow && invoice.ProformaNo ? (await tx.request().input("Evrak", invoice.ProformaNo).query("SELECT TOP 1 Odeme_Durumu FROM Odeme WHERE Evrak_No=@Evrak AND Fatura_ID IS NULL AND ISNULL(Odeme_Durumu,N'')<>N'Proforma' ORDER BY ID DESC")).recordset[0]?.Odeme_Durumu : null;
      const payment = paymentRow?.Odeme_Durumu || legacyPayment || "Ödeme Bekliyor";
      await tx.request().input("ID", invoiceId).input("Evrak", order.TalepNo).query("UPDATE Fatura SET ProformaNo=@Evrak WHERE ID=@ID");
      await tx.request().input("Invoice", invoiceId).input("Evrak", order.TalepNo).input("Payment", payment).query("INSERT INTO Odeme (Evrak_No,Odeme_Durumu,Fatura_ID,Tarih) VALUES (@Evrak,@Payment,@Invoice,GETDATE())");
    }
    await tx.request().input("ID", id).input("Invoice", invoiceId).input("No", invoice?.Fatura_No ?? null).input("Total", invoice?.Toplam ?? null).input("Due", invoice?.VadeTarihi ?? null).query("UPDATE KysTalep SET SiparisFaturaID=@Invoice,SiparisFaturaNo=@No,SiparisFaturaTutari=@Total,SiparisVade=@Due,UpdatedAt=GETDATE() WHERE ID=@ID");
    await tx.commit();
  } catch (error) { await tx.rollback(); throw error; }
}
