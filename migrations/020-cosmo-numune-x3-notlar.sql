-- ============================================================================
-- 020 — NumuneX3.Notlar (hizmet paketi aciklamasi)
-- ----------------------------------------------------------------------------
-- NumuneX3.Aciklama legacy olarak paket ADI tutuyor (API'de ListeAdi olarak
-- sunulur). Gerçek açıklama metni için ayrı kolon yoktu. Bu migration ile
-- paket aciklamasi NumuneX3.Notlar'a yazilir.
-- Idempotent.
-- ============================================================================
IF COL_LENGTH('dbo.NumuneX3','Notlar') IS NULL
  ALTER TABLE dbo.NumuneX3 ADD Notlar NVARCHAR(MAX) NULL;
