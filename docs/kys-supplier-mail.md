# Talep onayında tedarikçi maili

Talep detayında **Onayla** yalnız talebi onaylar ve mail göndermez.
Onaylanan taleplerde ayrı **Mail gönder** butonu görünür. Bu butondan aramalı çoklu listede aktif
tedarikçiler seçilir veya listede olmayan alıcıların adresleri elle girilir; her firmaya ayrı mail gönderilir. Tüm seçili firmalara
gönderim başarılı olunca talep otomatik **İşleme Alındı** durumuna geçer.
Hata/kısmi gönderimde **Onaylandı** olarak kalır. Müşteriye verilen `Sipariş`
türü tedarikçiye teklif isteme akışının dışındadır.

- Gönderen ve yanıt adresi: `purchasing@uniquealphabet.com`
- CC: `oguzhan@uniquealphabet.com`, `selin@uniquealphabet.com`
- Alıcı: Seçili firmanın kartındaki tüm e-posta adresleri
- Ek: Sistem yazdırma ekranıyla aynı şablondaki PDF; talep eden/onaylayan isim bölümü hariç

Tedarikçi kartlarında adresler virgül, noktalı virgül veya satır sonuyla ayrılır.
Adresler doğrulanır ve yinelenenler tekilleştirilir. Adresi eksik/geçersiz firma
seçilemez; sunucu da onay sırasında yeniden doğrular.

## SMTP

Varsayılan olarak portalın `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`,
`MAIL_PASS` ayarları kullanılır. Ayrı hesap için aynı anahtarların
`PURCHASING_` önekli sürümleri ortam değişkeni olarak tanımlanabilir.
Hesap, sabit gönderici adresi adına mail göndermeye yetkili olmalıdır.
Şifreler istemciye veya gönderim geçmişine yazılmaz.

## Gönderim geçmişi ve tekrar deneme

`KysTalepTedarikciMail` adres ve form bilgilerini ilk Mail gönder işleminde saklar.
Sonraki kart değişiklikleri eski onayın alıcılarını/ekini değiştirmez.
Her yeni gönderim ayrı kimlik alır ve önceki kayıtlar korunur. Mail gönder penceresinde önceki gönderimin kontrol edildiği onaylanarak yeniden gönderilebilir. Aynı gönderim anahtarıyla yinelenen HTTP istekleri yeni mail oluşturmaz. Eski gönderimlerin bekleyen/hatalı kayıtları kendiliğinden yeniden denenmez.

Talep detayında her firmanın alıcıları, durumu, hata ve gönderim tarihi görünür.
`Gönderildi`, SMTP sunucusunun alıcıları kabul ettiğini gösterir; gelen kutusuna
teslim edildiğini kanıtlamaz. `Hata` veya `Bekliyor` kayıtları ekrandan yeniden
denenebilir. Atomik kayıt sahiplenme, paralel çağrıların aynı maili göndermesini
önler. Gönderilmiş kayıtlar tekrar gönderilmez.

SMTP sonucu belirsizse veya yalnız bazı alıcılar kabul edilmişse `Belirsiz`
kaydı oluşur. Otomatik tekrar yapılmaz; posta kutusu/SMTP kayıtları kontrol edilmelidir. Kullanıcı bu kontrolü yaptığını onaylayarak yeni bir gönderim oluşturabilir. Gönderim aşaması ve başlangıç zamanı saklanır; 10 dakikayı geçen `Gönderiliyor` kayıtları ekranda `Sonuç alınamadı` olarak gösterilir. Daha yeni süren bir gönderim varken yeniden gönderim yapılmaz. Ekran süren kayıtları 10 saniyede bir yeniler. Mail gönder isteği sırasında işlenen
kalıcı kuyruk kullanılır; bağımsız zamanlanmış tekrar deneme görevi yoktur.

Şema, mevcut KYS tablolarının şema hazırlama yöntemiyle ilk kullanımda eklenir.
Tedarikçi `Email` alanı çoklu adresler için metin alanına genişletilir.

Mail metni Tahoma ile hazırlanır. Her mailde Oğuzhan EKER / Managing Director imzası, telefon/adres/web bilgileri ve CID ile eklenen UNIQUE ANALYSE logosu bulunur.

Elle girilen adresler tedarikçi kartı oluşturmaz. Seçili tedarikçinin adresleriyle çakışan elle girilmiş adresler ikinci defa gönderime eklenmez. Gönderim özeti sayfanın altındadır.
