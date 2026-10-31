# Spektrotek Talep

Sayfa: `/iletisim/spektrotek-talep`, İletişim menüsünün son sırasında.
Yetki: `iletisim.spektrotek-talep`; yönetici otomatik erişir, diğer kullanıcılar
için Kullanıcı Yetkileri ekranından verilir. Liste, ekleme ve güncelleme aynı
yetkiyle korunur. Gösterilen saatler Europe/Istanbul, saklanan tarihler UTC'dir.

## Site aktarımı

`POST /api/integrations/spektrotek/mail-requests`, JSON gövdesi:

```json
{"talepler":[{"kaynakId":"mailbot:385","tarih":"2026-10-19T11:06:35+00:00","musteriAdi":"Örnek kurum","kisiAdi":"Örnek kişi","email":"sample@example.com","talep":"Ozmometre","ozet":"Teklif talebi","konu":"Proforma","hesap":"info","skor":90}]}
```

Mevcut `SPEKTROTEK_INTEGRATION_KEY`, `x-api-key` veya Bearer başlığında kullanılır.
Yeni anahtar veya Mac'ten doğrudan bağlantı gerekmez. Gövde yalnız `talepler`
alanını, her kayıt kılavuzdaki alanları kabul eder. Bilinmeyen alanlar, geçersiz
adres/tarih/skor ve 100'den fazla kayıt reddedilir. Mevcut ortak entegrasyon
katmanı gövdeyi 128 KiB ile sınırlar; site gerekirse daha küçük paketler göndermeli.

Yanıt: `{ "ok": true, "alinan": 1, "eklenen": 1 }`. Aynı `kaynakId` tekrar
gelirse yalnız mail alanları güncellenir. Durum, durum tarihi ve değiştiren kişi
korunur. Bir paketteki tüm kayıtlar tek veritabanı işlemiyle yazılır; hata olursa
paketin tamamı geri alınır. Eşzamanlı aktarımlar kilit ve benzersiz kaynak kimliğiyle
korunur. Başarısız paketler aynı kimliklerle tekrar gönderilebilir.

Portal hazır olduğunda, Spektrotek sitesinin mail-asistanı snapshot aktarımından
sonra bu ucu çağırması gerekir. Sitedeki ileri aktarma ve MailKontrol ayarları
bu depoda bulunmadığından burada değiştirilmemiştir. Sayfada gerçek taleplerin
görünmesi için kaynağın aktarımı başlatması gerekir.

## Personel işlemleri

- `GET /api/spektrotek-talepleri?q=&durum=&hesap=&page=1`: 50 kayıtlık sayfalar,
  filtreye uyan toplam, hesap listesi ve tüm kayıtlar için küçük özet.
- `POST /api/spektrotek-talepleri`: kaynak kimliği dışındaki alanlarla manuel kayıt.
  Kimlik sunucuda `manual:UUID` olarak oluşturulur; `durum` varsayılanı Bekliyor.
- `PATCH /api/spektrotek-talepleri/{id}`: `{ "durum": "Teklif Gönderildi", "surum": 1 }`.
- `PUT /api/spektrotek-talepleri/{id}`: düzenlenen alanlar, `durum` ve `surum`.

Durumlar Bekliyor ve Teklif Gönderildi. Durum değiştirilince personel adı ve UTC
değişiklik tarihi saklanır. Kaynak kimliği personel API'sinden değiştirilemez.
Eski `surum` ile düzenleme 409 döndürür; başka işlemle değişen veriyi sessizce
ezmez. Yazma isteklerinde aynı kaynak kontrolü ve 16 KiB JSON sınırı uygulanır.

MySQL/MariaDB ve MSSQL şemaları `migrations/20261031_spektrotek_talep_*.sql`
dosyalarındadır; uygulama ilk kullanımda da şemayı oluşturur. Kılavuzdaki eski
tablo önceden kurulmuşsa eksik `Surum` sütunu eklenir.

Liste görünür sekmede her 30 saniyede bir yenilenir; form açıkken yenileme durur.
Arama müşteri/kişi/mail/talep alanlarında, sıralama en yeni tarih ve kimlik üsttedir.
Üst özet tüm kayıtları kapsar; filtrelenmiş sayı filtrelerin yanında gösterilir.

## Kontroller

`node scripts/check-spektrotek-mail-requests.cjs` (MySQL yolu), aynı komuta
`--mssql` eklenerek MSSQL yolu. Kimlik/yetki/kaynak denetimleri, katı sözleşme,
tekrar aktarımda durum koruma, atomik geri alma, manuel işlemler ve sürüm
çakışmalarını sahte veritabanında doğrular. Gerçek veri yazmaz.

`node scripts/check-spektrotek-mail-requests-ui.cjs` gerçek React bileşenini
yalıtılmış tarayıcı ve sahte API ile sınar: durum değiştirme/geri alma, manuel
ekleme/düzenleme, arama, Türkiye tarihleri ve dar ekran düzeni.
