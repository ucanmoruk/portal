-- Dış takip kodlarının başlangıç önekini ASCII standardına getirir.
-- Yalnızca başında eski "ÜGAM" öneki bulunan değerler değiştirilir.

UPDATE TeklifBaslik
SET DisTeklifKodu = CONCAT('UGAM', SUBSTRING(DisTeklifKodu, 5))
WHERE DisTeklifKodu LIKE 'ÜGAM%';

UPDATE Talep
SET DisTalepKodu = CONCAT('UGAM', SUBSTRING(DisTalepKodu, 5))
WHERE DisTalepKodu LIKE 'ÜGAM%';

UPDATE NKR_RaporOnay
SET DisRaporKodu = CONCAT('UGAM', SUBSTRING(DisRaporKodu, 5))
WHERE DisRaporKodu LIKE 'ÜGAM%';

UPDATE NKR_EvrakEslestirme
SET HedefKod = CONCAT('UGAM', SUBSTRING(HedefKod, 5))
WHERE HedefKod LIKE 'ÜGAM%';

UPDATE TeklifOnayLog
SET TeklifNo = CONCAT('UGAM', SUBSTRING(TeklifNo, 5))
WHERE TeklifNo LIKE 'ÜGAM%';
