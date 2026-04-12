-- NumuneX1 tablosuna Sonuc ve Degerlendirme kolonları ekleme
-- Rapor Takip sayfasında sonuç girişi için kullanılır
-- Bu script idempotent: birden fazla çalıştırılabilir

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('NumuneX1') AND name = 'Sonuc'
)
BEGIN
    ALTER TABLE NumuneX1 ADD Sonuc NVARCHAR(200) NULL
    PRINT 'NumuneX1.Sonuc kolonu eklendi'
END
ELSE
    PRINT 'NumuneX1.Sonuc zaten mevcut'

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('NumuneX1') AND name = 'Degerlendirme'
)
BEGIN
    ALTER TABLE NumuneX1 ADD Degerlendirme NVARCHAR(50) NULL
    PRINT 'NumuneX1.Degerlendirme kolonu eklendi'
END
ELSE
    PRINT 'NumuneX1.Degerlendirme zaten mevcut'
