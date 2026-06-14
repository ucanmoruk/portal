-- ============================================================================
-- 019 — TalepMesaj (müşteri ↔ personel mesajlaşma)
-- ----------------------------------------------------------------------------
-- Bir talep (özellikle Destek) için müşteri ile personel arasında konuşma.
-- GonderenTip: 'Musteri' (portal) | 'Personel' (iç portal).
-- Idempotent.
-- ============================================================================
IF OBJECT_ID('dbo.TalepMesaj', 'U') IS NULL
CREATE TABLE dbo.TalepMesaj (
  ID           INT IDENTITY(1,1) PRIMARY KEY,
  TalepID      INT           NOT NULL,
  GonderenTip  NVARCHAR(10)  NOT NULL,           -- 'Musteri' | 'Personel'
  GonderenID   INT           NULL,                -- personel ise userId
  GonderenAd   NVARCHAR(255) NULL,
  Mesaj        NVARCHAR(MAX) NOT NULL,
  Tarih        DATETIME      NOT NULL DEFAULT GETDATE(),
  Okundu       BIT           NOT NULL DEFAULT 0
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TalepMesaj_TalepID' AND object_id = OBJECT_ID('dbo.TalepMesaj'))
  CREATE INDEX IX_TalepMesaj_TalepID
    ON dbo.TalepMesaj (TalepID, Tarih);
GO
