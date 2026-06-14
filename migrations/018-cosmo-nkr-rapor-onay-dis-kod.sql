-- ============================================================================
-- 018 — NKR_RaporOnay.DisRaporKodu (rapor dış takip kodu)
-- ----------------------------------------------------------------------------
-- Her (NkrID, RaporFormati) onayında atanan dış kod. Format:
--   ÜGAM/RR26/XXXX  — RR rapor formatından türetilir (GE/ST/CH/CL/ÜG/DG).
-- Onay anında üretilir, idempotent (zaten doluysa dokunulmaz).
-- Eski (migration öncesi) kayıtlarda NULL kalır; eski PDF'ler, mailler ve
-- yazışmalar mevcut TaskTokeniyle çalışmaya devam eder.
-- Idempotent.
-- ============================================================================
IF COL_LENGTH('NKR_RaporOnay','DisRaporKodu') IS NULL
  ALTER TABLE NKR_RaporOnay ADD DisRaporKodu NVARCHAR(40) NULL;
GO

-- Aynı kodun farklı kayıtlara verilmemesi için kısmi unique index (NULL'ları izinli):
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_NKR_RaporOnay_DisRaporKodu')
  CREATE UNIQUE INDEX UX_NKR_RaporOnay_DisRaporKodu
    ON NKR_RaporOnay (DisRaporKodu)
    WHERE DisRaporKodu IS NOT NULL;
GO
