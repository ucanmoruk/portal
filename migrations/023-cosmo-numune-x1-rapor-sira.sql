IF COL_LENGTH('NumuneX1', 'RaporSira') IS NULL
BEGIN
  ALTER TABLE NumuneX1 ADD RaporSira INT NULL;
END
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_NumuneX1_RaporID_RaporSira'
    AND object_id = OBJECT_ID('NumuneX1')
)
BEGIN
  CREATE INDEX IX_NumuneX1_RaporID_RaporSira
  ON NumuneX1 (RaporID, RaporSira, ID);
END
GO
