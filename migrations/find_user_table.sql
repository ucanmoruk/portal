-- Veritabanındaki kullanıcı tablosunun adını bulmak için
-- Bu sorguyu SQL Server'da çalıştırarak doğru tablo adını bulun

SELECT TABLE_NAME 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_TYPE = 'BASE TABLE' 
AND (TABLE_NAME LIKE '%kullanici%' OR TABLE_NAME LIKE '%user%' OR TABLE_NAME LIKE '%person%')
ORDER BY TABLE_NAME;
