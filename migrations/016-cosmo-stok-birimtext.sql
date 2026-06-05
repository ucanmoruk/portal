-- ============================================================================
-- 016 — StokAnalizListesi.BirimText (portal text birimi)
-- ----------------------------------------------------------------------------
-- Cosmo'daki Birim kolonu INT (eski LIMS şeması — birim ID'si). Portal text
-- birim girişi ("kob/g", "mg/L" vb.) için ayrı NVARCHAR kolonu. INT kolonu
-- mevcut LIMS referansları için aynen kalır.
-- Idempotent.
-- ============================================================================
IF COL_LENGTH('StokAnalizListesi','BirimText') IS NULL
  ALTER TABLE StokAnalizListesi ADD BirimText NVARCHAR(255) NULL;
