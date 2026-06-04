# Müşteri Portalı — Teklif Entegrasyon Sözleşmesi

> İç portal (ÜGD Portal) ile **müşteri portalı** aynı MSSQL veritabanını (`massgrup_cosmo`)
> paylaşır. Bu yüzden **veri aktarımı / ETL yoktur** — entegrasyon noktası tek bir
> **veri sözleşmesidir**: iki uygulama da aynı tabloları okur/yazar, birbirini
> **import etmez**. Teklif formatı (PDF/HTML) müşteri portalına **kopyalanır** (saf
> şablon), kod-bağımlılığı kurulmaz.

---

## 1. Tablolar

### `TeklifBaslik` (teklif başlığı — tek kaynak)
| Kolon | Tip | Anlamı |
|---|---|---|
| `ID` | INT IDENTITY PK | İç teklif kimliği |
| `TeklifNo` | INT | **İç takip no** (örn. 260200). Müşteriye gösterme. |
| `DisTeklifKodu` | NVARCHAR(20) | **Dış/müşteri kodu** `ÜGAM-26-XXXXX` — tahmin edilemez. URL/referans bu olmalı. |
| `RevNo` | INT | Revizyon no (gösterim: `/00`, `/01`…) |
| `MusteriID` | INT | **→ `Firma.ID`** (teklifin müşterisi) |
| `Tarih` | DATETIME | Oluşturma tarihi |
| `Toplam` | DECIMAL(18,2) | Ara toplam (KDV/iskonto hariç ham) |
| `Notlar` | NVARCHAR(MAX) | Teklif notu |
| `TeklifDurum` | NVARCHAR(20) | **Durum kapısı**: `Taslak` / `Gönderildi` / `Onaylandı` / `Reddedildi` |
| `KdvOran` | INT | KDV oranı (%) |
| `TeklifKonusu` | NVARCHAR(500) | Teklif konusu |
| `TeklifVeren` | NVARCHAR(200) | Teklifi veren (iç) |
| `GenelIskonto` | DECIMAL(5,2) | Genel iskonto (%) |
| `Durum` | NVARCHAR(20) | Kayıt durumu: `Aktif` / `Pasif` (soft-delete) |
| `KID` | INT | Oluşturan iç kullanıcı ID (Postgres RootKullanici) |
| `OlusturanAd` | NVARCHAR(255) | Oluşturan kullanıcı adı (metin) |

### `TeklifKalem` (teklif satırları)
| Kolon | Tip | Anlamı |
|---|---|---|
| `ID` | INT IDENTITY PK | |
| `TeklifID` | INT | **→ `TeklifBaslik.ID`** |
| `HizmetID` | INT | → `StokAnalizListesi.ID` (opsiyonel) |
| `HizmetAdi` | NVARCHAR(200) | Hizmet/analiz adı |
| `Adet` | INT | Adet |
| `Metot` | NVARCHAR(200) | Metot |
| `Akreditasyon` | NVARCHAR(10) | "Var" → akredite |
| `Fiyat` | DECIMAL(18,2) | Birim fiyat |
| `ParaBirimi` | NVARCHAR(10) | TRY/USD/EUR (TRY → "TL" göster) |
| `Iskonto` | DECIMAL(5,2) | Satır iskontosu (%) |
| `Notlar` | NVARCHAR(500) | |

### `TeklifOnayLog` (yaşam döngüsü / onay-red kaydı)
| Kolon | Tip | Anlamı |
|---|---|---|
| `ID` | INT IDENTITY PK | |
| `TeklifID` | INT | → `TeklifBaslik.ID` |
| `TeklifNo` | NVARCHAR(50) | Etiket (örn. `ÜGAM-26-XXXXX/00`) |
| `Aksiyon` | NVARCHAR(20) | `Oluşturuldu` / `Gönderildi` / `Onaylandı` / `Reddedildi` / `Revize` … |
| `Aciklama` | NVARCHAR(MAX) | Açıklama (red sebebi vb.) |
| `IpAdresi` | NVARCHAR(100) | |
| `MusteriAd` / `MusteriEmail` / `MusteriYetkili` | NVARCHAR(255) | **Müşteri aksiyonlarında doldurulur** |
| `KullaniciID` / `KullaniciAd` | INT / NVARCHAR(255) | İç kullanıcı aksiyonlarında |
| `Tarih` | DATETIME | DEFAULT GETDATE() |

### `Firma` (cari / müşteri girişi)
İlgili kolonlar: `ID`, `Firma_Adi`, `Adres`, `Vergi_Dairesi`, `Vergi_No`, `Telefon`,
`Yetkili`, `Mail`, `Durum` (`Aktif`/`Pasif`), **`Kod`**, **`Parola`**.
→ Müşteri girişi `Kod` + `Parola` (veya `Mail` + `Parola`) ile yapılır; sonuç `Firma.ID`.

---

## 2. Müşteri girişi → kapsam
Müşteri portalına giren müşteri = bir `Firma`. Giriş:
```sql
SELECT ID, Firma_Adi, Mail, Yetkili
FROM Firma
WHERE Durum = N'Aktif'
  AND Kod = @kod          -- veya: Mail = @mail
  AND Parola = @parola;   -- (parola saklama/hashing önerisi: aşağıda Güvenlik)
```
Dönen `ID` = `@firmaId`. Müşteri **yalnızca** `TeklifBaslik.MusteriID = @firmaId` olan teklifleri görür.

---

## 3. "Tekliflerim" listesi (görünürlük kapısı)
```sql
SELECT
  t.ID, t.DisTeklifKodu, t.RevNo, t.TeklifDurum,
  FORMAT(t.Tarih, 'dd.MM.yyyy') AS Tarih,
  t.TeklifKonusu,
  -- KDV/iskonto dahil genel toplam istenirse kalemlerden hesaplanır (bkz. §6)
  t.Toplam
FROM TeklifBaslik t
WHERE t.MusteriID = @firmaId
  AND t.Durum = 'Aktif'
  AND t.TeklifDurum IN ('Gönderildi','Onaylandı','Reddedildi')   -- Taslak GÖRÜNMEZ
ORDER BY t.ID DESC;
```
- **Müşteriye gösterilen referans:** `DisTeklifKodu` + `/` + iki haneli `RevNo`
  (örn. `ÜGAM-26-AB3KP/00`). `ID`/`TeklifNo` gibi tahmin edilebilir değerleri URL'de kullanma.
- **Revizyon:** Aynı `TeklifNo`'nun birden çok revizyonu olabilir; genelde en güncel
  (`MAX(RevNo)`) gösterilir. Tüm geçmiş gerekirse `TeklifNo`'ya göre grupla.

## 4. Teklif detayı
```sql
-- Başlık
SELECT t.*, f.Firma_Adi AS MusteriAd, f.Adres, f.Yetkili, f.Mail
FROM TeklifBaslik t
LEFT JOIN Firma f ON f.ID = t.MusteriID
WHERE t.DisTeklifKodu = @disKod AND t.MusteriID = @firmaId;   -- sahiplik kontrolü ŞART

-- Kalemler
SELECT * FROM TeklifKalem WHERE TeklifID = @teklifId ORDER BY ID;
```
> **Güvenlik:** Detayda `MusteriID = @firmaId` filtresini **her zaman** ekle —
> başka müşterinin teklifini açmayı engeller.

## 5. Onay / Red (müşteri → geri-yazım)
Müşteri kararını **aynı DB'ye** yazar; iç portal `TeklifDurum` + `TeklifOnayLog`'u zaten
okuduğu için **durum ve geçmiş otomatik senkron** olur (ek aktarım yok).
```sql
-- 1) Durum
UPDATE TeklifBaslik
SET TeklifDurum = @karar            -- 'Onaylandı' veya 'Reddedildi'
WHERE ID = @teklifId AND MusteriID = @firmaId
  AND TeklifDurum = 'Gönderildi';   -- yalnızca bekleyen teklif karara bağlanır

-- 2) Log (iç portalda 'Geçmiş' sekmesinde görünür)
INSERT INTO TeklifOnayLog (TeklifID, TeklifNo, Aksiyon, Aciklama, IpAdresi, MusteriAd, MusteriEmail, MusteriYetkili, Tarih)
VALUES (@teklifId, @disKodEtiket, @karar, @aciklama, @ip, @firmaAd, @firmaMail, @firmaYetkili, GETDATE());
```
- Red'de `@aciklama` = red/revizyon sebebi (zorunlu tutulması önerilir).
- `@disKodEtiket` = `ÜGAM-26-XXXXX/00` biçimi.

## 6. Tutar hesabı (PDF ve toplamlar için)
```
araToplam   = Σ (Adet × Fiyat × (1 − Iskonto/100))      -- kalem bazında
iskontolu   = araToplam × (1 − GenelIskonto/100)
kdv         = iskontolu × KdvOran/100
genelToplam = iskontolu + kdv
```

## 7. PDF / teklif formatı
Teklif çıktısı **veriden türeyen saf bir HTML/CSS şablonudur** — müşteri portalına
**kopyalanır** (kod-bağımlılığı kurulmaz). İç portaldaki referanslar:
- `app/teklif-print/[id]/page.tsx` — yazdırma/PDF sayfası (JetBrains Mono, A4)
- `app/api/teklifler/[id]/export/route.ts` — Word/PDF export mantığı
Bunlar `TeklifBaslik` + `TeklifKalem`'den okur; müşteri portalı aynı sorgularla aynı
şablonu kullanırsa çıktı **birebir aynı** olur. Müşteriye gösterilen numara = `DisTeklifKodu`.

## 8. Bildirim ("yeni teklifiniz var")
Müşteri portalı kendi tarafında üretir (bağımsızlık için):
- `TeklifDurum = 'Gönderildi'` ve müşterinin **henüz görmediği** teklifler için rozet/bildirim.
- "Görüldü" durumu müşteri portalının **kendi tablosunda** tutulmalı (iç portal şemasına
  dokunma). Alternatif: müşteri portalı, son giriş zamanından sonra `Gönderildi` olan
  teklifleri sayar.
- İç portaldan ayrıca e-posta gidiyorsa (mail aksiyonu) bu bildirimden bağımsızdır.

## 9. Durum akışı
```
Taslak  ──(iç: mail gönder / 'Müşteri Portalına Gönder')──▶  Gönderildi
                                                              │
                              (müşteri portalı)              ├─▶ Onaylandı
                                                              └─▶ Reddedildi
```
- **Taslak**: yalnızca iç portalda; müşteride görünmez.
- **Gönderildi**: müşteri portalında görünür + karar verebilir.
- **Onaylandı/Reddedildi**: kilitli; müşteri portalı yalnızca gösterir.

## 10. Güvenlik notları
- Müşteri portalı sorgularında **`MusteriID = @firmaId` filtresi her zaman zorunlu**.
- URL/refer ans olarak **`DisTeklifKodu`** kullan (enumerable `ID`/`TeklifNo` değil).
- `Firma.Parola` düz metinse, müşteri portalında **hash'li doğrulamaya** geçmek önerilir
  (iç portal Firma yazımını etkilemez; ayrı bir parola kolonu/şeması düşünülebilir).
- Tüm yazma işlemleri (onay/red) **parametreli** sorgu ile (SQL injection'a karşı).

---

### Özet
- **Aktarım yok** — aynı DB. Teklif `TeklifDurum='Gönderildi'` olunca müşteri portalında belirir.
- **Tek kaynak**: `TeklifBaslik` / `TeklifKalem`. Müşteri portalı bunları okur, onay/red'i
  `TeklifDurum` + `TeklifOnayLog`'a yazar.
- **Kod bağlanmaz**; format **kopyalanır**. Raporlar için de aynı desen uygulanacak.
