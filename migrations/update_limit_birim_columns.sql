-- NumuneX1 tablosuna Limit ve Birim kolonları ekleme
-- Eski Limit kolonunu silip yeni iki kolon ekliyoruz

-- Önce eski Limit kolonunu varsa kontrol et ve sil
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('NumuneX1') AND name = 'Limit')
BEGIN
    PRINT 'Eski Limit kolonu siliniyor...'
    ALTER TABLE NumuneX1 DROP COLUMN [Limit]
END

-- Yeni kolonları ekle
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('NumuneX1') AND name = 'Limit')
BEGIN
    PRINT 'Limit kolonu ekleniyor...'
    ALTER TABLE NumuneX1 
    ADD [Limit] NVARCHAR(100) NULL
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('NumuneX1') AND name = 'Birim')
BEGIN
    PRINT 'Birim kolonu ekleniyor...'
    ALTER TABLE NumuneX1 
    ADD [Birim] NVARCHAR(50) NULL
END

PRINT 'Kolon düzenlemeleri tamamlandı!'
