-- Migration 004: Add SonucEn and DegerlendirmeEn columns to NumuneX1
-- SonucEn    : English translation of Sonuc (e.g. "Tespit Edilmedi" → "Not Detected")
-- DegerlendirmeEn: English translation of Degerlendirme
--              "Uygun" → "Pass", "Uygun Değil" → "Fail", "D.Y." → "N/A"
-- Idempotent: can be run multiple times safely.

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('NumuneX1') AND name = 'SonucEn'
)
BEGIN
    ALTER TABLE NumuneX1 ADD SonucEn NVARCHAR(200) NULL
    PRINT 'NumuneX1.SonucEn kolonu eklendi'
END
ELSE
    PRINT 'NumuneX1.SonucEn zaten mevcut'

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('NumuneX1') AND name = 'DegerlendirmeEn'
)
BEGIN
    ALTER TABLE NumuneX1 ADD DegerlendirmeEn NVARCHAR(50) NULL
    PRINT 'NumuneX1.DegerlendirmeEn kolonu eklendi'
END
ELSE
    PRINT 'NumuneX1.DegerlendirmeEn zaten mevcut'

-- Mevcut satırları güncelle (Sonuc → SonucEn, Degerlendirme → DegerlendirmeEn)
UPDATE NumuneX1
SET SonucEn = CASE
    WHEN Sonuc = 'Tespit Edilmedi' THEN 'Not Detected'
    ELSE Sonuc
END
WHERE SonucEn IS NULL AND Sonuc IS NOT NULL

UPDATE NumuneX1
SET DegerlendirmeEn = CASE
    WHEN Degerlendirme = 'Uygun'       THEN 'Pass'
    WHEN Degerlendirme = 'Uygun Değil' THEN 'Fail'
    WHEN Degerlendirme = 'D.Y.'        THEN 'N/A'
    ELSE Degerlendirme
END
WHERE DegerlendirmeEn IS NULL AND Degerlendirme IS NOT NULL

PRINT 'Migration 004 completed: SonucEn and DegerlendirmeEn columns added and backfilled.'
