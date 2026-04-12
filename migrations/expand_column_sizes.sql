-- Sonuc, Degerlendirme, Durum kolonlarının boyutlarını genişlet
-- Tekrar çalıştırılabilir: Mevcut boyut yeterliyse değişiklik yapmaz

-- Sonuc — max 500 char
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='NumuneX1' AND COLUMN_NAME='Sonuc')
BEGIN
  ALTER TABLE NumuneX1 ALTER COLUMN Sonuc NVARCHAR(500) NULL
END

-- Degerlendirme — max 100 char (en azından "Uygun Değil" için)
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='NumuneX1' AND COLUMN_NAME='Degerlendirme')
BEGIN
  ALTER TABLE NumuneX1 ALTER COLUMN Degerlendirme NVARCHAR(100) NULL
END

-- Durum — max 50 char (Tamamlandı = 10 char, ama buffer ekle)
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='NumuneX1' AND COLUMN_NAME='Durum')
BEGIN
  ALTER TABLE NumuneX1 ALTER COLUMN Durum NVARCHAR(50) NULL
END
