-- Performans index'leri — numune-kabul / numune-takip-lab / rapor-takip ağır
-- sorgularındaki join + filtre kolonları. MariaDB CREATE INDEX IF NOT EXISTS.
-- Schema + data'dan SONRA çalıştır.
SET FOREIGN_KEY_CHECKS=0;

CREATE INDEX IF NOT EXISTS ix_NKR_Durum            ON `NKR` (`Durum`);
CREATE INDEX IF NOT EXISTS ix_NKR_EvrakNo          ON `NKR` (`Evrak_No`);
CREATE INDEX IF NOT EXISTS ix_NKR_FirmaID          ON `NKR` (`Firma_ID`);
CREATE INDEX IF NOT EXISTS ix_NumuneX1_RaporID     ON `NumuneX1` (`RaporID`);
CREATE INDEX IF NOT EXISTS ix_NumuneX1_AnalizID    ON `NumuneX1` (`AnalizID`);
CREATE INDEX IF NOT EXISTS ix_NumuneDetay_RaporID  ON `NumuneDetay` (`RaporID`);
CREATE INDEX IF NOT EXISTS ix_NumuneDetay_ProjeID  ON `NumuneDetay` (`ProjeID`);
CREATE INDEX IF NOT EXISTS ix_LabKabul_NkrID       ON `NKR_LabKabul` (`NkrID`);
CREATE INDEX IF NOT EXISTS ix_LabKabul_NkrIDFmt    ON `NKR_LabKabul` (`NkrID`, `RaporFormati`);
CREATE INDEX IF NOT EXISTS ix_RaporOnay_NkrID      ON `NKR_RaporOnay` (`NkrID`);
CREATE INDEX IF NOT EXISTS ix_Override_NkrID       ON `NKR_RaporDurumOverride` (`NkrID`);
CREATE INDEX IF NOT EXISTS ix_Odeme_EvrakNo        ON `Odeme` (`Evrak_No`);
CREATE INDEX IF NOT EXISTS ix_EvrakEslestirme_No   ON `NKR_EvrakEslestirme` (`EvrakNo`);
CREATE INDEX IF NOT EXISTS ix_Stok_RaporFormati    ON `StokAnalizListesi` (`RaporFormati`);

SET FOREIGN_KEY_CHECKS=1;
