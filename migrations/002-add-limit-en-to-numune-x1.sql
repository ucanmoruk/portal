-- Migration: Add English limit columns to NumuneX1
-- Purpose: Support bilingual limit/range display in test results
-- Date: 2026-04-10

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('NumuneX1') AND name = 'LimitEn')
    ALTER TABLE NumuneX1 ADD LimitEn NVARCHAR(100) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('NumuneX1') AND name = 'BirimEn')
    ALTER TABLE NumuneX1 ADD BirimEn NVARCHAR(50) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('NumuneX1') AND name = 'LOQ')
    ALTER TABLE NumuneX1 ADD LOQ NVARCHAR(100) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('NumuneX1') AND name = 'LOQEn')
    ALTER TABLE NumuneX1 ADD LOQEn NVARCHAR(100) NULL;

PRINT 'Migration 002 completed: NumuneX1 English limit columns added successfully.';
