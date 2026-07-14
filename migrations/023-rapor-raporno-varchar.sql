-- Manuel müşteri belge yüklemelerinde Rapor.RaporNo alfanümerik olabilir
-- (örn. 26SE1026). Eski int kolon bu değeri 26'ya kırpıyordu.

-- MySQL / MariaDB
ALTER TABLE Rapor
  MODIFY COLUMN RaporNo VARCHAR(60)
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_turkish_ci
  NULL;

-- MSSQL için eşdeğer:
-- ALTER TABLE dbo.Rapor ALTER COLUMN RaporNo NVARCHAR(60) NULL;
