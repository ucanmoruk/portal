-- rUGDTip MSSQL -> MySQL aktarim bloğu
-- Kaynak: massgrup_root.dbo.rUGDTip
-- Satir sayisi: 31

SET NAMES utf8mb4 COLLATE utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS rUGDTip (
  ID INT NOT NULL PRIMARY KEY,
  Kategori VARCHAR(200) NULL,
  UrunTipi VARCHAR(200) NULL,
  YuzeyAlani INT NULL,
  UygulamaBolgesi VARCHAR(500) NULL,
  Siklik VARCHAR(500) NULL,
  GunlukMiktar VARCHAR(100) NULL,
  ADegeri DECIMAL(18,6) NULL,
  KategoriEn VARCHAR(200) NULL,
  UrunTipiEn VARCHAR(200) NULL,
  UygulamaBolgesiEn VARCHAR(500) NULL,
  SiklikEn VARCHAR(500) NULL
) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci;

ALTER TABLE rUGDTip ADD COLUMN IF NOT EXISTS YuzeyAlani INT NULL AFTER UrunTipi;
ALTER TABLE rUGDTip ADD COLUMN IF NOT EXISTS GunlukMiktar VARCHAR(100) NULL AFTER Siklik;
ALTER TABLE rUGDTip ADD COLUMN IF NOT EXISTS KategoriEn VARCHAR(200) NULL AFTER ADegeri;
ALTER TABLE rUGDTip ADD COLUMN IF NOT EXISTS UrunTipiEn VARCHAR(200) NULL AFTER KategoriEn;
ALTER TABLE rUGDTip ADD COLUMN IF NOT EXISTS UygulamaBolgesiEn VARCHAR(500) NULL AFTER UrunTipiEn;
ALTER TABLE rUGDTip ADD COLUMN IF NOT EXISTS SiklikEn VARCHAR(500) NULL AFTER UygulamaBolgesiEn;

INSERT INTO rUGDTip (`ID`, `Kategori`, `UrunTipi`, `YuzeyAlani`, `UygulamaBolgesi`, `Siklik`, `GunlukMiktar`, `ADegeri`, `KategoriEn`, `UrunTipiEn`, `UygulamaBolgesiEn`, `SiklikEn`)
VALUES
  (1, 'Banyo, Duş Ürünleri', 'Duş Jeli', 17500, 'Toplam vücut alanı', '1,43/gün', '18,67g', 2.79, 'Bathing, showering', 'Shower gel ', 'Total body area', '1.43/day'),
  (2, 'Banyo, Duş Ürünleri', 'El yıkama sabunu', 860, 'Eller', '10/gün', '20,00g', 3.33, 'Bathing, showering', 'Hand wash soap', 'Area hands', '10/day'),
  (3, 'Banyo, Duş Ürünleri', 'Banyo yağı, tuzlar vs', 16340, 'Vücut, baş', '1/gün', NULL, NULL, 'Bathing, showering', 'Bath oil, salts, etc.', 'Area body- area hands', '1/day'),
  (4, 'Saç Bakım Ürünleri', 'Şampuan', 1440, 'Eller + başın ½’si', '1/gün', '10,46g', 1.51, 'Hair care', 'Shampoo', 'Area hands+ ½ area head', '1/day'),
  (5, 'Saç Bakım Ürünleri', 'Saç kremi', 1440, 'Eller + başın ½’si', '0,28/gün', '3,92g', 0.67, 'Hair care', 'Hair conditioner', 'Area hands+ ½ area head', '0,28/day'),
  (6, 'Saç Bakım Ürünleri', 'Saç şekillendirme ürünleri ', 1010, 'Eller + başın ½’si', '1,14/gün', '4,00g', 5.74, 'Hair care', 'Hair styling products', '½ area hands+ ½ area head', '1,14/day'),
  (7, 'Saç Bakım Ürünleri', 'Yarı kalıcı saç boyaları (ve 
losyonları)', 580, 'Başın ½’si', '1/hafta (20 dakika)', '35 mL', NULL, 'Hair care', 'Semi-permanent
hair dyes (and lotions)', '½ area head', '1/week
(20min.)'),
  (8, 'Saç Bakım Ürünleri', 'Oksitleyici / kalıcı saç ', 580, 'Başın ½’si', '1/ay (30 dakika)', '100 mL', NULL, 'Hair care', 'Oxidative/permanent
hair dyes', '½ area head', '1/month
(30min.)'),
  (9, 'Cilt Bakım Ürünleri', 'Vücut losyonu', 15670, 'Tüm vücut alanı (kadın)', '2,28/gün', '7,82g', 123.2, 'Skin care', 'Body lotion', 'area body-area head
(female)', '2.28/day'),
  (10, 'Cilt Bakım Ürünleri', 'Yüz kremi', 565, 'Başın ½’si (kadın)', '2,14/gün', '1,54g', 24.14, 'Skin care', 'Face cream', '½ area head (female)', '2.14/day'),
  (11, 'Cilt Bakım Ürünleri', 'El kremi', 860, 'Eller', '2/gün', '2,16g', 32.7, 'Skin care', 'Hand cream', 'Area hands', '2/day'),
  (12, 'Makyaj', 'Likit fondöten', 565, 'Başın ½’si (kadın)', '1/gün', '0,51g', 7.9, 'Make-up', 'Liquid foundation', '½ area head (female)', '1/day'),
  (13, 'Makyaj', 'Makyaj temizleyici', 565, 'Başın ½’si (kadın)', '1/gün', '5,00g', 8.33, 'Make-up', 'Make-up remover', '½ area head (female)', '1/day'),
  (14, 'Makyaj', 'Göz farı', 24, NULL, '2/gün', '0,02g', 0.33, 'Make-up', 'Eye shadow', NULL, '2/day'),
  (15, 'Makyaj', 'Maskara', 2, NULL, '2/gün', '0,025g', 0.42, 'Make-up', 'Mascara', NULL, '2/day'),
  (16, 'Makyaj', 'Göz kalemi', 3, NULL, '2/gün', '0,005g', 0.08, 'Make-up', 'Eyeliner', NULL, '2/day'),
  (17, 'Makyaj', 'Ruj, dudak kremi', 5, NULL, '2/gün', '0,057g', 0.9, 'Make-up', 'Lipstick, lip salve', NULL, '2/day'),
  (18, 'Deodorant', 'Deodorant sprey olmayan', 200, 'Her iki koltuk altı', '2/gün', '1,50', 22.08, 'Deodorant', 'Deodorant nonspray', 'Both axillae', '2/day'),
  (19, 'Deodorant', 'Deodorant sprey', 200, 'Her iki koltuk altı', '2/gün', '0,69', 10, 'Deodorant', 'Deodorant spray', 'Both axillae', '1/day'),
  (20, 'Koku vericiler', 'EDT', 200, 'Tüm vücut', '1/gün', '1,43', 20.63, 'Fragrances', 'Eau de toilette spray ', 'Total body area', '1/day'),
  (21, 'Ağız bakım', 'Diş macunu (yetişkin)', 3, NULL, NULL, '2,75', 2.16, 'Oral hygiene', 'Toothpaste (adult)', NULL, ''),
  (22, 'Ağız bakım', 'Ağız yıkama suyu', NULL, NULL, NULL, '21,62', 32.54, 'Oral hygiene', 'Mouthwash', NULL, NULL),
  (23, 'Koku vericiler', 'Parfüm sprey', 100, 'Eller', '1/gün', '1,43', 20.63, 'Fragrances', 'Perfume spray', 'Area hands', '1/day'),
  (24, 'Erkek kozmetikleri', 'Tıraş kremi', 305, 'Başın dörtte biri', '1/gün', NULL, NULL, 'Men’s cosmetics', 'Shaving cream ', '¼ area hand (male)', '1/day'),
  (25, 'Erkek kozmetikleri', 'Tıraş sonrası ürünler', 305, 'Başın dörtte biri', '1/gün', NULL, NULL, 'Men’s cosmetics', 'Aftershave', '¼ area hand (male)', '1/day'),
  (26, 'Güneş koruma', 'Güneş koruma', 17500, 'Tüm vücut alanı', '2/gün', NULL, NULL, 'Sun care cosmetics', 'Sunscreen lotion/ cream', 'Total body area', '2/day'),
  (27, 'Makyaj', 'Tırnak Cilaları / Ojeler', 40, 'Tırnaklar', '1/gün', '0,25 g (10 nails)', 0.067, 'Make-up', 'Nail Polish', 'nails', '1/day'),
  (28, 'Cilt Bakım', 'Serum', NULL, NULL, NULL, NULL, NULL, 'Skin care', 'Serum', NULL, NULL),
  (29, 'Cilt Bakım', 'Yüz Serumu', NULL, NULL, NULL, NULL, NULL, 'Skin care', 'Face serum', NULL, NULL),
  (30, 'Cilt Bakım', 'Saç Serumu', NULL, NULL, NULL, NULL, NULL, 'Skin care', 'Hair serum', NULL, NULL),
  (31, 'Hijyen Ürünleri', 'Dış genital bölge bakım ürünleri', NULL, NULL, NULL, NULL, NULL, 'Hygiene Products', 'External genital area care products', NULL, NULL)
ON DUPLICATE KEY UPDATE
  `Kategori` = VALUES(`Kategori`),
  `UrunTipi` = VALUES(`UrunTipi`),
  `YuzeyAlani` = VALUES(`YuzeyAlani`),
  `UygulamaBolgesi` = VALUES(`UygulamaBolgesi`),
  `Siklik` = VALUES(`Siklik`),
  `GunlukMiktar` = VALUES(`GunlukMiktar`),
  `ADegeri` = VALUES(`ADegeri`),
  `KategoriEn` = VALUES(`KategoriEn`),
  `UrunTipiEn` = VALUES(`UrunTipiEn`),
  `UygulamaBolgesiEn` = VALUES(`UygulamaBolgesiEn`),
  `SiklikEn` = VALUES(`SiklikEn`);
