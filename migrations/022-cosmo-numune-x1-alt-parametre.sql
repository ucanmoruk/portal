-- ============================================================================
-- 022 — NumuneX1AltParametre (rapor bazında bileşen/alt parametre SONUÇLARI)
-- ----------------------------------------------------------------------------
-- StokAnalizAltParametre = katalog/şartname (her rapora ortak bileşen tanımı).
-- Bu tablo ise PER-RAPOR ölçülen sonuçları tutar: bir NumuneX1 satırının (X1ID =
-- o raporun ilgili analizi) altındaki her bileşen için Sonuç + Değerlendirme.
-- Şartname alanları (BilesenAdi/Birim/LOQ/Limit) snapshot olarak kopyalanır →
-- katalog sonradan değişse bile rapor sabit kalır. (X1ID, AltParametreID) tekil.
-- Idempotent.
-- ============================================================================
IF OBJECT_ID('dbo.NumuneX1AltParametre', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.NumuneX1AltParametre (
    ID             INT IDENTITY(1,1) PRIMARY KEY,
    X1ID           INT           NOT NULL,   -- FK → NumuneX1.ID
    AltParametreID INT           NULL,       -- FK → StokAnalizAltParametre.ID (katalog izi)
    Sira           INT           NOT NULL DEFAULT 0,
    BilesenAdi     NVARCHAR(255) NULL,
    BilesenAdiEn   NVARCHAR(255) NULL,
    Birim          NVARCHAR(100) NULL,
    BirimEn        NVARCHAR(100) NULL,
    LOQ            NVARCHAR(100) NULL,
    LOQEn          NVARCHAR(100) NULL,
    [Limit]        NVARCHAR(255) NULL,
    LimitEn        NVARCHAR(255) NULL,
    Sonuc          NVARCHAR(255) NULL,
    SonucEn        NVARCHAR(255) NULL,
    Degerlendirme  NVARCHAR(50)  NULL,
    UpdatedAt      DATETIME      NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_NumuneX1AltParametre_X1ID ON dbo.NumuneX1AltParametre (X1ID);
END
