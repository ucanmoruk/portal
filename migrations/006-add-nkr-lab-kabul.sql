-- Migration: NKR_LabKabul tablosu
-- Purpose: Laboratuvarın bir numuneyi belirli bir rapor formatı için
--          resmi olarak "kabul ettiği" anı kaydeder. Numune Takip
--          ekranındaki "Kabul Bekleyenler" → "Kabul Edildi" geçişi.
-- Date: 2026-05-29

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'NKR_LabKabul')
BEGIN
    CREATE TABLE NKR_LabKabul (
        ID            INT IDENTITY(1,1) PRIMARY KEY,
        NkrID         INT NOT NULL,
        RaporFormati  NVARCHAR(80) NOT NULL,
        BolumID       INT NULL,
        KabulEdenID   INT NULL,
        KabulTarihi   DATETIME NOT NULL DEFAULT GETDATE(),
        Notlar        NVARCHAR(500) NULL,
        CONSTRAINT UQ_NKR_LabKabul UNIQUE (NkrID, RaporFormati)
    );

    CREATE INDEX IX_NKR_LabKabul_Nkr ON NKR_LabKabul (NkrID);
END

PRINT 'Migration 006 completed: NKR_LabKabul tablosu olusturuldu.';
