-- ============================================================================
-- 012 — UGDR (Ürün Güvenlik Değerlendirme Raporu) tabloları (MSSQL massgrup_cosmo)
-- ----------------------------------------------------------------------------
--   • rCosing   : Resmi CosIng INCI referans veritabanı (statik). ID korunarak
--                 Postgres'ten seed edilir (NKR_Formul.HammaddeID → rCosing.ID).
--   • rUGDDetay : Ürün fiziksel özellikleri (NKR başına). cosmo'da SIFIRDAN
--                 (eski Postgres satırları eski NKR ID uzayına bağlıydı).
-- Idempotent.
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='rCosing' AND xtype='U')
CREATE TABLE rCosing (
  ID         INT PRIMARY KEY,
  Link       NVARCHAR(MAX) NULL,
  INCIName   NVARCHAR(500) NULL,
  Cas        NVARCHAR(200) NULL,
  EC         NVARCHAR(200) NULL,
  Functions  NVARCHAR(MAX) NULL,
  Regulation NVARCHAR(MAX) NULL,
  SCCS       NVARCHAR(MAX) NULL,
  SCCSLink   NVARCHAR(MAX) NULL,
  Tur        NVARCHAR(100) NULL,
  Kategori   NVARCHAR(200) NULL
);

IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='rUGDDetay' AND xtype='U')
CREATE TABLE rUGDDetay (
  ID        INT IDENTITY(1,1) PRIMARY KEY,
  UrunID    INT           NULL,
  NKRID     INT           NULL,
  Gorunum   NVARCHAR(MAX) NULL,
  Renk      NVARCHAR(MAX) NULL,
  Koku      NVARCHAR(MAX) NULL,
  pH        NVARCHAR(100) NULL,
  Kaynama   NVARCHAR(200) NULL,
  Erime     NVARCHAR(200) NULL,
  Yogunluk  NVARCHAR(200) NULL,
  Viskozite NVARCHAR(200) NULL,
  Suda      NVARCHAR(MAX) NULL,
  Diger     NVARCHAR(MAX) NULL,
  Durum     NVARCHAR(20)  NULL,
  GorunumEn NVARCHAR(MAX) NULL,
  RenkEn    NVARCHAR(MAX) NULL,
  KokuEn    NVARCHAR(MAX) NULL,
  SudaEn    NVARCHAR(MAX) NULL,
  DigerEn   NVARCHAR(MAX) NULL
);
