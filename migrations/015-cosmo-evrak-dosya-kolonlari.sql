-- ============================================================================
-- 015 — NKR_EvrakEslestirme dosya kolonları (massgrup_cosmo)
-- ----------------------------------------------------------------------------
-- Tur='Dosya' kayıtları için dosya içeriği + meta. VARBINARY(MAX) blob (mevcut
-- Fotograf tablosuyla aynı desen).
-- Idempotent.
-- ============================================================================
IF COL_LENGTH('NKR_EvrakEslestirme','FileData') IS NULL
  ALTER TABLE NKR_EvrakEslestirme ADD FileData VARBINARY(MAX) NULL;
IF COL_LENGTH('NKR_EvrakEslestirme','FileName') IS NULL
  ALTER TABLE NKR_EvrakEslestirme ADD FileName NVARCHAR(255) NULL;
IF COL_LENGTH('NKR_EvrakEslestirme','MimeType') IS NULL
  ALTER TABLE NKR_EvrakEslestirme ADD MimeType NVARCHAR(120) NULL;
IF COL_LENGTH('NKR_EvrakEslestirme','FileSize') IS NULL
  ALTER TABLE NKR_EvrakEslestirme ADD FileSize INT NULL;
