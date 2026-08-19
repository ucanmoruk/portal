IF COL_LENGTH('StokAnalizListesi', 'OlcumBelirsizligi') IS NULL
BEGIN
  ALTER TABLE StokAnalizListesi ADD OlcumBelirsizligi NVARCHAR(255) NULL;
END
GO

IF COL_LENGTH('NumuneX1', 'OlcumBelirsizligi') IS NULL
BEGIN
  ALTER TABLE NumuneX1 ADD OlcumBelirsizligi NVARCHAR(255) NULL;
END
GO
