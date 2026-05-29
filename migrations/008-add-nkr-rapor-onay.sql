-- Migration 008: NKR_RaporOnay
-- Purpose: Rapor Takip > PDF Önizleme > Onayla akışı.
--   - Her (NkrID, RaporFormati) çifti için Onayla basıldığında 1 kayıt oluşur.
--   - KarekodToken UNIQUE — public /rapor-dogrula/<token> sayfası bu token ile sorgular.
--   - Durum: "Onaylandı" (default) → "Yayınlandı" (Portalda Yayınla sonrası).
--   - Geri Gönder bu satırı + NKR_LabKabul satırını birlikte siler.
-- Date: 2026-05-29

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'NKR_RaporOnay')
BEGIN
  CREATE TABLE NKR_RaporOnay (
    ID            INT IDENTITY(1,1) PRIMARY KEY,
    NkrID         INT NOT NULL,
    RaporFormati  NVARCHAR(80) NOT NULL,
    KarekodToken  NVARCHAR(48) NOT NULL,
    Durum         NVARCHAR(40) NOT NULL DEFAULT 'Onaylandı',
    OnaylayanID   INT NULL,
    OnayTarihi    DATETIME NOT NULL DEFAULT GETDATE(),
    YayinTarihi   DATETIME NULL,
    YayinUrl      NVARCHAR(500) NULL,
    Notlar        NVARCHAR(500) NULL,
    CONSTRAINT UQ_NKR_RaporOnay UNIQUE (NkrID, RaporFormati),
    CONSTRAINT UQ_NKR_RaporOnay_Token UNIQUE (KarekodToken)
  );

  CREATE INDEX IX_NKR_RaporOnay_Token ON NKR_RaporOnay (KarekodToken);
  CREATE INDEX IX_NKR_RaporOnay_Nkr   ON NKR_RaporOnay (NkrID);
END

PRINT 'Migration 008 completed: NKR_RaporOnay oluşturuldu.';
