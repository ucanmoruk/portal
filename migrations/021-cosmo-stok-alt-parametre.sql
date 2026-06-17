-- ============================================================================
-- 021 — StokAnalizAltParametre (hizmet alt parametreleri / bileşenleri)
-- ----------------------------------------------------------------------------
-- Bir hizmet (StokAnalizListesi) birden fazla bileşen/alt parametre içerebilir
-- (ör. "Ağır Metaller" → Pb, Cd, As ...). Her birinin kendi Birim/LOQ/Limit'i
-- (+ İngilizce karşılıkları) olur. Hizmet detay modalindeki "Alt Parametreler"
-- sekmesi bu tabloyu yönetir. Idempotent.
-- ============================================================================
IF OBJECT_ID('dbo.StokAnalizAltParametre', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.StokAnalizAltParametre (
    ID           INT IDENTITY(1,1) PRIMARY KEY,
    AnalizID     INT           NOT NULL,   -- FK → StokAnalizListesi.ID
    Sira         INT           NOT NULL DEFAULT 0,
    BilesenAdi   NVARCHAR(255) NULL,
    BilesenAdiEn NVARCHAR(255) NULL,
    Birim        NVARCHAR(100) NULL,
    BirimEn      NVARCHAR(100) NULL,
    LOQ          NVARCHAR(100) NULL,
    LOQEn        NVARCHAR(100) NULL,
    [Limit]      NVARCHAR(255) NULL,
    LimitEn      NVARCHAR(255) NULL,
    CreatedAt    DATETIME      NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_StokAnalizAltParametre_AnalizID
    ON dbo.StokAnalizAltParametre (AnalizID);
END
