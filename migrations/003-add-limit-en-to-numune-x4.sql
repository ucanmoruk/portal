-- Migration: Add English limit columns to NumuneX4 (Package Items)
-- Purpose: Support package-level limit overrides with bilingual display
-- Date: 2026-04-10

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('NumuneX4') AND name = 'LimitDegerEn')
    ALTER TABLE NumuneX4 ADD LimitDegerEn NVARCHAR(100) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('NumuneX4') AND name = 'LimitBirimiEn')
    ALTER TABLE NumuneX4 ADD LimitBirimiEn NVARCHAR(50) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('NumuneX4') AND name = 'LOQ')
    ALTER TABLE NumuneX4 ADD LOQ NVARCHAR(100) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('NumuneX4') AND name = 'LOQEn')
    ALTER TABLE NumuneX4 ADD LOQEn NVARCHAR(100) NULL;

PRINT 'Migration 003 completed: NumuneX4 English limit columns added successfully.';
