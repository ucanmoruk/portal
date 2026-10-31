-- Spektrotek mail leads; SQL Server. Application also initializes this schema.
IF OBJECT_ID('SpektrotekTalep','U') IS NULL BEGIN CREATE TABLE SpektrotekTalep (
      Id INT IDENTITY(1,1) PRIMARY KEY,KaynakId NVARCHAR(64) NOT NULL UNIQUE,Tarih DATETIME2(3) NOT NULL,
      MusteriAdi NVARCHAR(300) NOT NULL,KisiAdi NVARCHAR(200) NULL,Email NVARCHAR(320) NOT NULL,Talep NVARCHAR(300) NOT NULL,
      Ozet NVARCHAR(1000) NULL,Konu NVARCHAR(500) NULL,Hesap NVARCHAR(100) NOT NULL,Skor TINYINT NULL,
      Durum NVARCHAR(40) NOT NULL DEFAULT N'Bekliyor',DurumTarihi DATETIME2(3) NULL,DurumKullanici NVARCHAR(100) NULL,
      OlusturmaTarihi DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),GuncellemeTarihi DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),Surum INT NOT NULL DEFAULT 1,
      CONSTRAINT CK_SpektrotekTalep_Durum CHECK (Durum IN (N'Bekliyor',N'Teklif Gönderildi')));
      CREATE INDEX IX_SpektrotekTalep_Tarih ON SpektrotekTalep (Tarih DESC,Id DESC); END;
IF COL_LENGTH('SpektrotekTalep','Surum') IS NULL ALTER TABLE SpektrotekTalep ADD Surum INT NOT NULL DEFAULT 1;
