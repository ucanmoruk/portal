-- ============================================================================
-- 013 — TeklifBaslik.KisaAciklama (müşteri portalı kısa açıklama)
-- ----------------------------------------------------------------------------
-- Müşteri portalında teklif listesi tablosunda gösterilen kısa açıklama.
-- Print/mail'de KULLANILMAZ. Default: "Fiyat teklifimiz".
-- Idempotent.
-- ============================================================================
IF COL_LENGTH('TeklifBaslik','KisaAciklama') IS NULL
  ALTER TABLE TeklifBaslik ADD KisaAciklama NVARCHAR(500) NULL;
