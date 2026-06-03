-- ============================================================================
-- 011 — Hizmet Paketleri: NumuneX4 portal kolonları (MSSQL massgrup_cosmo)
-- ----------------------------------------------------------------------------
-- Legacy cosmo NumuneX4: ID, x3ID(=ListeID), AltAnalizID(=HizmetID), Limit, Birim.
-- Portal zengin limit alanlarını ekler (additive, nullable). Kod okurken
-- ISNULL(LimitDeger, Limit) fallback yapar → mevcut 1081 kalemin Limit/Birim'i
-- de görünür, yeni düzenlemeler LimitDeger/LimitBirimi'ye yazılır.
-- Idempotent.
-- ============================================================================
IF COL_LENGTH('NumuneX4','LimitDeger')    IS NULL ALTER TABLE NumuneX4 ADD LimitDeger    NVARCHAR(255) NULL;
IF COL_LENGTH('NumuneX4','LimitBirimi')   IS NULL ALTER TABLE NumuneX4 ADD LimitBirimi   NVARCHAR(255) NULL;
IF COL_LENGTH('NumuneX4','LimitDegerEn')  IS NULL ALTER TABLE NumuneX4 ADD LimitDegerEn  NVARCHAR(255) NULL;
IF COL_LENGTH('NumuneX4','LimitBirimiEn') IS NULL ALTER TABLE NumuneX4 ADD LimitBirimiEn NVARCHAR(255) NULL;
IF COL_LENGTH('NumuneX4','LOQ')           IS NULL ALTER TABLE NumuneX4 ADD LOQ           NVARCHAR(255) NULL;
IF COL_LENGTH('NumuneX4','LOQEn')         IS NULL ALTER TABLE NumuneX4 ADD LOQEn         NVARCHAR(255) NULL;
IF COL_LENGTH('NumuneX4','Notlar')        IS NULL ALTER TABLE NumuneX4 ADD Notlar        NVARCHAR(500) NULL;
