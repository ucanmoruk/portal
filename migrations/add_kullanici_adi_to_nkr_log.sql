-- NKR_Log tablosuna KullaniciAdi kolonu ekle (revizyon yapan kişi adı)
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('NKR_Log') AND name = 'KullaniciAdi'
)
BEGIN
  ALTER TABLE NKR_Log ADD KullaniciAdi NVARCHAR(255) NULL
END
