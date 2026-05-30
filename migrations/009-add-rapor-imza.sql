-- Migration 009: NKR_RaporOnay'a dijital imza (tamper-proof) alanları
-- Purpose: Rapor onaylandığında rapor içeriğinin (numune, firma, analiz sonuçları)
--   HMAC-SHA256 imzası hesaplanıp saklanır. Doğrulama sayfası bu imzayı
--   güncel DB içeriğinden yeniden hesaplayıp karşılaştırır → rapor değiştirilmişse
--   "Belge bütünlüğü bozulmuş" uyarısı verir.
--   - ImzaHash: 64 karakterlik hex (SHA-256). Onay anında hesaplanır.
--   - ImzaTarihi: imzanın atıldığı an.
--   - ImzaSurum: imza algoritması sürümü (ileride değişirse uyumluluk için).
-- Date: 2026-05-30

IF COL_LENGTH('NKR_RaporOnay', 'ImzaHash') IS NULL
BEGIN
  ALTER TABLE NKR_RaporOnay ADD ImzaHash NVARCHAR(128) NULL;
END

IF COL_LENGTH('NKR_RaporOnay', 'ImzaTarihi') IS NULL
BEGIN
  ALTER TABLE NKR_RaporOnay ADD ImzaTarihi DATETIME NULL;
END

IF COL_LENGTH('NKR_RaporOnay', 'ImzaSurum') IS NULL
BEGIN
  ALTER TABLE NKR_RaporOnay ADD ImzaSurum NVARCHAR(10) NULL;
END

PRINT 'Migration 009 completed: NKR_RaporOnay imza alanları eklendi.';
