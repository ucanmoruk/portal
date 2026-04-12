-- Migration: Add Limit, Birim, LOQ columns to StokAnalizListesi
-- Purpose: Enable limit/range management for test services
-- Date: 2026-04-10

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('StokAnalizListesi') AND name = 'Limit')
    ALTER TABLE StokAnalizListesi ADD [Limit] NVARCHAR(100) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('StokAnalizListesi') AND name = 'Birim')
    ALTER TABLE StokAnalizListesi ADD Birim NVARCHAR(50) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('StokAnalizListesi') AND name = 'LOQ')
    ALTER TABLE StokAnalizListesi ADD LOQ NVARCHAR(100) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('StokAnalizListesi') AND name = 'LimitEn')
    ALTER TABLE StokAnalizListesi ADD LimitEn NVARCHAR(100) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('StokAnalizListesi') AND name = 'BirimEn')
    ALTER TABLE StokAnalizListesi ADD BirimEn NVARCHAR(50) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('StokAnalizListesi') AND name = 'LOQEn')
    ALTER TABLE StokAnalizListesi ADD LOQEn NVARCHAR(100) NULL;

PRINT 'Migration 001 completed: StokAnalizListesi columns added successfully.';
