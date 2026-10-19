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

`PaymentReminderDelivery` tablosunun benzersiz `DeliveryKey` anahtarı aynı
faturaya aynı gün çift gönderimi ve aynı raporun aynı alıcıya tekrarını engeller.
`ApprovedBy` onaylayan kullanıcıyı, `Recipient` alıcıyı, `Details` zaman,
fatura bilgileri ve SMTP sonucunu kaydeder. `sent` SMTP sunucusunun kabulünü
ifade eder; posta kutusuna teslimat veya okunma garantisi değildir.

`sending` durumunda takılan veya `uncertain` görünen gönderimler otomatik
yeniden denenmez. SMTP sunucusu kabul ettikten sonra bağlantı kopmuş olabilir.
Bu kayıtları yeniden göndermeden önce SMTP günlükleri ve alıcı adresi
kontrol edilmelidir. Rapor alıcıları ayrı ayrı kaydedildiğinden bir alıcıdaki
hata diğerinin başarılı kaydını etkilemez. Zamanlayıcının sıfırdan farklı çıkış
kodlarını operatöre bildirmesi yapılandırılmalıdır.
