-- ============================================================================
-- 010 — Laboratuvar portal şeması (MSSQL massgrup_cosmo)
-- ----------------------------------------------------------------------------
-- Lab modülü Postgres'te genişletilmiş şemayla çalışıyordu; cosmo (canlı LIMS)
-- bu portal kolon/tablolarını içermiyor. Bu script HEPSİ ADDITIVE:
--   • yalnızca yeni NULLABLE kolon ekler (mevcut satırlara dokunmaz)
--   • yalnızca olmayan tabloları oluşturur
-- Idempotent: tekrar çalıştırılabilir.
--
-- Kullanıcı yaklaşımı: auth Postgres RootKullanici'de kalır. cosmo tablolarında
-- *Ad alanları (OnaylayanAd, KabulEdenAd, KullaniciAdi) ile kullanıcı adı yazma
-- anında metin olarak saklanır → cross-DB join gerekmez.
-- ============================================================================

-- ── NumuneX1: sonuç-giriş kolonları ─────────────────────────────────────────
IF COL_LENGTH('NumuneX1','Sonuc')            IS NULL ALTER TABLE NumuneX1 ADD Sonuc            NVARCHAR(255) NULL;
IF COL_LENGTH('NumuneX1','Degerlendirme')    IS NULL ALTER TABLE NumuneX1 ADD Degerlendirme    NVARCHAR(255) NULL;
IF COL_LENGTH('NumuneX1','Birim')            IS NULL ALTER TABLE NumuneX1 ADD Birim            NVARCHAR(255) NULL;
IF COL_LENGTH('NumuneX1','Limit')            IS NULL ALTER TABLE NumuneX1 ADD [Limit]         NVARCHAR(255) NULL;
IF COL_LENGTH('NumuneX1','LOQ')              IS NULL ALTER TABLE NumuneX1 ADD LOQ              NVARCHAR(255) NULL;
IF COL_LENGTH('NumuneX1','SonucEn')          IS NULL ALTER TABLE NumuneX1 ADD SonucEn          NVARCHAR(255) NULL;
IF COL_LENGTH('NumuneX1','DegerlendirmeEn')  IS NULL ALTER TABLE NumuneX1 ADD DegerlendirmeEn  NVARCHAR(255) NULL;
IF COL_LENGTH('NumuneX1','LimitEn')          IS NULL ALTER TABLE NumuneX1 ADD LimitEn          NVARCHAR(255) NULL;
IF COL_LENGTH('NumuneX1','BirimEn')          IS NULL ALTER TABLE NumuneX1 ADD BirimEn          NVARCHAR(255) NULL;
IF COL_LENGTH('NumuneX1','LOQEn')            IS NULL ALTER TABLE NumuneX1 ADD LOQEn            NVARCHAR(255) NULL;
IF COL_LENGTH('NumuneX1','SonucKayitTarihi') IS NULL ALTER TABLE NumuneX1 ADD SonucKayitTarihi DATETIME      NULL;

-- ── StokAnalizListesi: portal kolonları ─────────────────────────────────────
IF COL_LENGTH('StokAnalizListesi','BolumID')      IS NULL ALTER TABLE StokAnalizListesi ADD BolumID      INT           NULL;
IF COL_LENGTH('StokAnalizListesi','YetkiliID')    IS NULL ALTER TABLE StokAnalizListesi ADD YetkiliID    INT           NULL;
IF COL_LENGTH('StokAnalizListesi','RaporFormati') IS NULL ALTER TABLE StokAnalizListesi ADD RaporFormati NVARCHAR(100) NULL;
IF COL_LENGTH('StokAnalizListesi','LOQ')          IS NULL ALTER TABLE StokAnalizListesi ADD LOQ          NVARCHAR(255) NULL;
IF COL_LENGTH('StokAnalizListesi','Limit')        IS NULL ALTER TABLE StokAnalizListesi ADD [Limit]     NVARCHAR(255) NULL;
IF COL_LENGTH('StokAnalizListesi','LimitEn')      IS NULL ALTER TABLE StokAnalizListesi ADD LimitEn      NVARCHAR(255) NULL;
IF COL_LENGTH('StokAnalizListesi','BirimEn')      IS NULL ALTER TABLE StokAnalizListesi ADD BirimEn      NVARCHAR(255) NULL;
IF COL_LENGTH('StokAnalizListesi','LOQEn')        IS NULL ALTER TABLE StokAnalizListesi ADD LOQEn        NVARCHAR(255) NULL;

-- ── NKR: portal kolonları ───────────────────────────────────────────────────
IF COL_LENGTH('NKR','TesteMiktar')      IS NULL ALTER TABLE NKR ADD TesteMiktar      FLOAT         NULL;
IF COL_LENGTH('NKR','TesteMiktarBirim') IS NULL ALTER TABLE NKR ADD TesteMiktarBirim NVARCHAR(50)  NULL;
IF COL_LENGTH('NKR','UGDTip_ID')        IS NULL ALTER TABLE NKR ADD UGDTip_ID        INT           NULL;
IF COL_LENGTH('NKR','Barkod')           IS NULL ALTER TABLE NKR ADD Barkod           NVARCHAR(100) NULL;
IF COL_LENGTH('NKR','Teklif_No')        IS NULL ALTER TABLE NKR ADD Teklif_No        NVARCHAR(50)  NULL;
IF COL_LENGTH('NKR','Talep_No')         IS NULL ALTER TABLE NKR ADD Talep_No         NVARCHAR(50)  NULL;
IF COL_LENGTH('NKR','Numune_Adi_En')    IS NULL ALTER TABLE NKR ADD Numune_Adi_En    NVARCHAR(500) NULL;
IF COL_LENGTH('NKR','Numune_Adi3')      IS NULL ALTER TABLE NKR ADD Numune_Adi3      NVARCHAR(500) NULL;
IF COL_LENGTH('NKR','Urun_Tipi')        IS NULL ALTER TABLE NKR ADD Urun_Tipi        NVARCHAR(200) NULL;
IF COL_LENGTH('NKR','Hedef_Grup')       IS NULL ALTER TABLE NKR ADD Hedef_Grup       NVARCHAR(200) NULL;

-- ── RootFirmaBirim (lab birim/bölüm) ────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='RootFirmaBirim' AND xtype='U')
CREATE TABLE RootFirmaBirim (
  ID      INT IDENTITY(1,1) PRIMARY KEY,
  FirmaID INT           NULL,
  Birim   NVARCHAR(255) NULL,
  Durum   NVARCHAR(20)  NULL
);

-- ── NKR_LabKabul (numune lab kabul) ─────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='NKR_LabKabul' AND xtype='U')
CREATE TABLE NKR_LabKabul (
  ID           INT IDENTITY(1,1) PRIMARY KEY,
  NkrID        INT           NOT NULL,
  RaporFormati NVARCHAR(80)  NULL,
  BolumID      INT           NULL,
  KabulEdenID  INT           NULL,
  KabulEdenAd  NVARCHAR(255) NULL,   -- kullanıcı adı (Postgres'e join yerine)
  KabulTarihi  DATETIME      NULL,
  Notlar       NVARCHAR(500) NULL
);

-- ── NKR_RaporOnay (rapor onay + e-imza) ─────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='NKR_RaporOnay' AND xtype='U')
CREATE TABLE NKR_RaporOnay (
  ID           INT IDENTITY(1,1) PRIMARY KEY,
  NkrID        INT           NOT NULL,
  RaporFormati NVARCHAR(80)  NULL,
  KarekodToken NVARCHAR(48)  NULL,
  Durum        NVARCHAR(40)  NULL,
  OnaylayanID  INT           NULL,
  OnaylayanAd  NVARCHAR(255) NULL,   -- kullanıcı adı (Postgres'e join yerine)
  OnayTarihi   DATETIME      NULL,
  YayinTarihi  DATETIME      NULL,
  YayinUrl     NVARCHAR(500) NULL,
  Notlar       NVARCHAR(500) NULL,
  ImzaHash     NVARCHAR(128) NULL,
  ImzaTarihi   DATETIME      NULL,
  ImzaSurum    NVARCHAR(10)  NULL
);

-- ── NKR_RaporDurumOverride (rapor durum override) ───────────────────────────
IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='NKR_RaporDurumOverride' AND xtype='U')
CREATE TABLE NKR_RaporDurumOverride (
  NkrID        INT           NOT NULL,
  RaporFormati NVARCHAR(100) NOT NULL,
  Durum        NVARCHAR(50)  NULL,
  UpdatedAt    DATETIME      NULL,
  Notlar       NVARCHAR(1000) NULL,
  CONSTRAINT PK_NKR_RaporDurumOverride PRIMARY KEY (NkrID, RaporFormati)
);

-- ── NKR_Log (numune işlem günlüğü) ──────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='NKR_Log' AND xtype='U')
CREATE TABLE NKR_Log (
  ID           INT IDENTITY(1,1) PRIMARY KEY,
  NKRID        INT           NULL,
  Tarih        DATETIME      NOT NULL DEFAULT GETDATE(),
  KullaniciID  INT           NULL,
  KullaniciAdi NVARCHAR(255) NULL,
  Eylem        NVARCHAR(MAX) NULL,
  Aciklama     NVARCHAR(MAX) NULL
);

-- ── NKR_Formul (rapor-takip UGDR formül) ────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='NKR_Formul' AND xtype='U')
CREATE TABLE NKR_Formul (
  ID         INT IDENTITY(1,1) PRIMARY KEY,
  NKRID      INT           NULL,
  HammaddeID INT           NULL,
  INCIName   NVARCHAR(MAX) NULL,
  Miktar     FLOAT         NULL,
  DaP        FLOAT         NULL,
  Noael      FLOAT         NULL
);
