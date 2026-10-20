# Günlük vade raporu ve onaylı hatırlatma

Rapor alıcıları: oguzhan@uniqueanalyse.com ve muhasebe@uniqueanalyse.com.
Her gün Türkiye saatiyle 09.00 için hazırlanan akış, Unique kaynaklı aktif
faturalardan vadesi bugün veya geçmiş olanları, kısmi ödemeleri ve cari mahsupları
düşerek listeler. Ödenmiş, iptal edilmiş, vadesiz veya açık bakiyesi olmayan
faturalar dahil edilmez. Açık fatura yoksa da günlük bilgi e-postası gönderilir.

## Canlı ortamı etkinleştirme

1. Değişiklikleri portal sunucusuna dağıtın. Mevcut fatura takip ve cari ödeme
   şemasının (`Fatura`, `Odeme`, `Firma`, `FirmaCariOdemeDagitim`) kurulmuş olması
   gerekir. Gönderim günlüğü tablosu ilk çalıştırmada oluşturulur.
2. Sunucuda `PAYMENT_PORTAL_URL` değerini portalın gerçek HTTPS adresine,
   `PAYMENT_REPORT_CRON_SECRET` değerini rastgele en az 32 karakterlik gizli
   anahtara ayarlayın. Anahtarı istemciye veya kaynak kontrolüne eklemeyin.
   Portalın mevcut Admin → Ayarlar ekranındaki `MAIL_*` SMTP ayarları kullanılır.
3. Sunucu zamanlayıcısında proje dizininden `node scripts/send-daily-payment-report.mjs`
   komutunu günlük çalıştırın. Zamanlayıcının saat dilimi Europe/Istanbul ise
   09.00; UTC ise 06.00 seçin. cPanel sunucusunun saat dilimini önce doğrulayın.
   Node'un tam yolu ve proje dizini canlı kurulumdan alınmalıdır.
4. İlk gönderimi bu komutla kontrollü çalıştırıp iki posta kutusuna ulaşmasını
   doğrulayın. Bu komut gerçek rapor e-postası gönderir. Müşteriye gönderim yapmaz.

Bu değişiklik tek başına canlı sunucuyu veya zamanlayıcıyı etkinleştirmez.
Rapor adresleri `lib/paymentReminderRules.ts` içinde tanımlıdır.

### Geçici hatalardan toparlanma

Üretim uygulaması çalışırken, zamanlayıcı anahtarı tanımlıysa iç rapor işçisi
Türkiye saatiyle 09.00'dan sonra eksik raporları kontrol eder. Başarısız
hazırlık, veritabanı veya SMTP işlemleri beş dakika sonra yeniden denenir.
İşçi HTTP geçidine bağlı değildir; cron isteği 502 alsa bile çalışan uygulama
eksik gönderimi tamamlayabilir. Uygulama uyutulmuş veya durmuşsa harici cron
gereklidir. Gün içinde yeniden başlayan uygulama eksik raporu tamamlar.

Başarılı alıcıya tekrar gönderilmez. Başarısız, sonucu belirsiz veya beş
dakikadan uzun süredir işlemde kalan **iç rapor** kaydı atomik olarak yeniden
alınabilir. SMTP sonucu belirsizse aynı iç rapor ikinci kez ulaşabilir;
bu davranış raporu kaçırmamak için bilerek tercih edilmiştir. Müşteri
hatırlatmalarının onay ve tekrar koruması değişmez.

Harici cron için önerilen komut (sunucu Türkiye saatindeyken `0 9 * * *`):

```bash
curl --fail --silent --show-error --retry 3 --retry-delay 60 --connect-timeout 20 --max-time 180 --config /home/uniqueanalyse/.payment-report.curl >> /home/uniqueanalyse/payment-report.log 2>&1
```

## Onay

Fatura Takip → Ödeme hatırlatmalarını incele ve onayla bağlantısı veya rapordaki
bağlantı `/musteriler/fatura-takip/hatirlatmalar` ekranını açar. Mevcut portal
yöneticisi Oğuzhan (kullanıcı ID 2) oturum açar, en fazla 10 faturayı seçer,
alıcı ve tutarları inceler ve **Onaylıyorum, seçilenlere gönder** düğmesine basar.
E-postadaki bağlantıyı açmak gönderim onayı sayılmaz. Muhasebe adresi rapor alır;
bu adresin rapor alması hatırlatma gönderim yetkisi vermez.

Gönderim öncesi bakiye, vade, firma ve alıcı yeniden okunur. Ekranda incelenen
bilgiler değiştiyse yeni onay istenir. Geçersiz veya eksik müşteri adresine
gönderim yapılmaz. Hatırlatma mevcut kurumsal e-posta şablonunu ve banka
bilgilerini kullanır. Aynı faturaya sonraki gün yeniden hatırlatma göndermek
için yeniden onay gerekir.

## Gönderim günlüğü

Admin → Ayarlar → Otomasyonlar (`/admin/ayarlar/otomasyonlar`) ekranında
rapor alıcıları, planlanan saat, SMTP/portal/zamanlayıcı anahtarı yapılandırma
durumu, son çalışma, bugünkü iki alıcıya gönderim sonuçları ve geçmiş kayıtlar
görülebilir. Ekran yalnızca yöneticiye açıktır; gizli ayar değerlerini döndürmez.
Zamanlayıcının sunucuda etkin olduğunu varsaymaz. Yenile düğmesi güncel
kayıtları alır, işlem türü filtresi geçmişi daraltır. Bu ekrandan hatırlatma
onay sayfasına da geçilir.

Günlük rapor görevi çağrıldığında ayrı çalışma kaydı açılır; hazırlık veya SMTP
ayarı hataları da başarısız çalışma olarak görünür. Veritabanı erişilemiyorsa
çalışma kaydı yazılamayacağından sunucu/zamanlayıcı günlükleri kontrol edilir.

`PaymentReminderDelivery` tablosunun benzersiz `DeliveryKey` anahtarı aynı
faturaya aynı gün çift gönderimi ve aynı raporun aynı alıcıya tekrarını engeller.
`ApprovedBy` onaylayan kullanıcıyı, `Recipient` alıcıyı, `Details` zaman,
fatura bilgileri ve SMTP sonucunu kaydeder. `sent` SMTP sunucusunun kabulünü
ifade eder; posta kutusuna teslimat veya okunma garantisi değildir.

`sending` durumunda takılan veya `uncertain` görünen müşteri hatırlatmaları otomatik
yeniden denenmez. SMTP sunucusu kabul ettikten sonra bağlantı kopmuş olabilir.
Bu kayıtları yeniden göndermeden önce SMTP günlükleri ve alıcı adresi
kontrol edilmelidir. Rapor alıcıları ayrı ayrı kaydedildiğinden bir alıcıdaki
hata diğerinin başarılı kaydını etkilemez. Zamanlayıcının sıfırdan farklı çıkış
kodlarını operatöre bildirmesi yapılandırılmalıdır.
