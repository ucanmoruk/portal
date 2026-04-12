-- NumuneX1'e Durum kolonu ekler (Devam / Tamamlandı)
-- NULL = henüz işlem yapılmamış → "Devam" olarak değerlendirilir (backward compat)
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('NumuneX1') AND name = 'Durum'
)
BEGIN
  ALTER TABLE NumuneX1 ADD Durum NVARCHAR(20) NULL
END
