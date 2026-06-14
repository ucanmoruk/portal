-- ============================================================================
-- 017 — TalepRaporlama.Mail (rapor gönderilecek mail adresi)
-- ----------------------------------------------------------------------------
-- Müşteri portalında talep oluşturulurken girilen "Rapor gönderilecek mail
-- adresi". Talep detay sayfasında "RAPORLAMA BİLGİLERİ" bölümünde gösterilir.
-- Idempotent.
-- ============================================================================
IF COL_LENGTH('TalepRaporlama','Mail') IS NULL
  ALTER TABLE TalepRaporlama ADD Mail NVARCHAR(255) NULL;
