-- ============================================================================
-- 014 — NKR_EvrakEslestirme tablosu (massgrup_cosmo)
-- ----------------------------------------------------------------------------
-- Numune Kabul evrakı (NKR.Evrak_No) ile diğer kayıtları (Teklif, Analiz Talep,
-- Destek Talep, Dosya) bağlayan eşleştirme tablosu.
--   Tur ∈ {'Teklif','AnalizTalep','DestekTalep','Dosya'}
--   HedefID → TeklifBaslik.ID / dbo.Talep.ID / (Dosya için NULL)
-- Idempotent.
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='NKR_EvrakEslestirme' AND xtype='U')
CREATE TABLE NKR_EvrakEslestirme (
  ID               INT IDENTITY(1,1) PRIMARY KEY,
  EvrakNo          NVARCHAR(50)  NOT NULL,
  Tur              NVARCHAR(20)  NOT NULL,
  HedefID          INT           NULL,
  HedefKod         NVARCHAR(100) NULL,    -- ÜGAM-26-XXXXX, ÜGAM/26/XXXX vb.
  Aciklama         NVARCHAR(500) NULL,    -- dosya için path/etiket
  EslestirenID     INT           NULL,
  EslestirenAd     NVARCHAR(255) NULL,
  EslestirmeTarihi DATETIME      NOT NULL DEFAULT GETDATE()
);

-- Aynı evrak için aynı tür+hedef tekrarlanmasın (Dosya için Tur+ID'den çok kayıt
-- olabilir; bu yüzden HedefID NULL ise kısıt yok — filtered index).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_NKR_EvrakEslestirme_TurHedef')
CREATE UNIQUE INDEX UX_NKR_EvrakEslestirme_TurHedef
  ON NKR_EvrakEslestirme (EvrakNo, Tur, HedefID)
  WHERE HedefID IS NOT NULL;
