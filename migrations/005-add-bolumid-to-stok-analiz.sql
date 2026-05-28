-- Migration: Add BolumID column to StokAnalizListesi
-- Purpose: Assign each lab service to a department (RootFirmaBirim)
--          Replaces the per-service "Yetkili Kişi" (YetkiliID) selection
--          in the UI with a "Bölüm" selection. YetkiliID column is kept
--          for legacy callers (e.g. sonuc-giris JOIN).
-- Date: 2026-05-28

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('StokAnalizListesi') AND name = 'BolumID')
    ALTER TABLE StokAnalizListesi ADD BolumID INT NULL;

PRINT 'Migration 005 completed: StokAnalizListesi.BolumID added.';
